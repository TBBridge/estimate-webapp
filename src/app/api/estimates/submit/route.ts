/**
 * POST /api/estimates/submit
 *
 * 1. 見積番号を生成
 * 2. DB に estimates レコードを INSERT
 * 3. テンプレート Excel にデータ書き込み → Blob に Excel 保存 → DB 更新
 * 4. 承認通知を送信
 *
 * ※ PDF 生成は別エンドポイント /api/estimates/[id]/generate-pdf で行う
 *   （Wasm 初期化に時間がかかるため、申請レスポンスから分離）
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { sendApprovalNotification } from "@/lib/notify";
import { writeEstimateToTemplate } from "@/lib/excel-writer";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import {
  resolveCustomerDisplayName,
  validateEstimateRequesterContact,
} from "@/lib/estimate-schema";
import { handleAuthError, requireAuth } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const maxDuration = 30;

function resolveTemplateId(
  deliveryType: string,
  contractType: string,
  cloudBilling?: string
): string | null {
  if (deliveryType === "onprem") {
    if (contractType === "new") return "tpl-1";
    if (contractType === "license_add") return "tpl-2";
    if (contractType === "option_add") return "tpl-3";
  }
  if (deliveryType === "subscription" && contractType === "new") return "tpl-4";
  if (deliveryType === "cloud") {
    if (contractType === "new") return cloudBilling === "period" ? "tpl-6" : "tpl-5";
    if (contractType === "license_add") return "tpl-7";
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();

    const {
      agencyId: bodyAgencyId,
      agencyName: bodyAgencyName,
      customerName,
      deliveryType,
      contractType,
      cloudBilling,
      formInputs,
    } = body as {
      agencyId: string;
      agencyName: string;
      customerName: string;
      deliveryType: string;
      contractType: string;
      cloudBilling?: string;
      formInputs: Record<string, unknown>;
    };
    const normalizedFormInputs: Record<string, unknown> =
      formInputs && typeof formInputs === "object" && !Array.isArray(formInputs)
        ? formInputs
        : {};

    const requesterContact = validateEstimateRequesterContact(normalizedFormInputs);
    if (!requesterContact.ok) {
      return NextResponse.json({ error: requesterContact.error }, { status: 400 });
    }

    const sql = getDb();

    // agency ロールでは agencyId を強制的にセッション値で上書き、
    // agencyName/agency_type も DB から取得（クライアント送信値は信用しない）。
    let agencyId = bodyAgencyId;
    let agencyName = bodyAgencyName;

    if (session.role === "agency") {
      if (!session.agencyId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      agencyId = session.agencyId;
    }

    // ── 代理店情報を 1 クエリで取得（TOCTOU 防止）────
    const agencyRows = await sql`
      SELECT name, agency_type FROM agencies WHERE id = ${agencyId} LIMIT 1
    `;
    if (session.role === "agency" && agencyRows.length === 0) {
      return NextResponse.json({ error: "agency_not_found" }, { status: 403 });
    }
    if (agencyRows.length > 0) {
      if (session.role === "agency") {
        agencyName = String(agencyRows[0].name ?? "");
      }
    }
    const agencyType = (agencyRows[0]?.agency_type as string | undefined) ?? agencyName;

    const mainProductId = "ireporter";
    const mrRows = await sql`
      SELECT CAST(rate AS FLOAT) AS rate FROM margin_rates
      WHERE agency_id = ${agencyId} AND product_id = ${mainProductId} AND delivery_type = ${deliveryType}
      LIMIT 1
    `;
    const maintRows = await sql`
      SELECT CAST(rate AS FLOAT) AS rate FROM maintenance_rates
      WHERE agency_id = ${agencyId} AND product_id = ${mainProductId}
      LIMIT 1
    `;
    const productMarginRate =
      mrRows[0]?.rate != null && Number.isFinite(Number(mrRows[0].rate))
        ? Number(mrRows[0].rate)
        : undefined;
    const maintenanceMarginRate =
      maintRows[0]?.rate != null && Number.isFinite(Number(maintRows[0].rate))
        ? Number(maintRows[0].rate)
        : undefined;

    const resolvedCustomerName =
      String(customerName ?? "").trim() ||
      resolveCustomerDisplayName(normalizedFormInputs) ||
      "（未入力）";

    // ── 見積番号生成 & DB INSERT ──────────────────────────
    // 採番ルール: EST-YYYYMM-{連番3桁}。
    // 削除済みレコードの番号は再利用しない（管理者が削除しても次回採番に影響させない）ため、
    // COUNT(*) ではなく既存最大連番 + 1 で算出する。
    // 並列申請による一意制約衝突 (23505) に備えて、衝突したら MAX を再取得して連番を取り直す。
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `EST-${ym}-`;
    const likePattern = `${prefix}%`;

    // 正規表現は JS テンプレートリテラルでの \d 縮退（\d → d）を避けるため [0-9] を使う。
    // PostgreSQL ARE で `EST-[0-9]{6}-([0-9]+)$` の括弧キャプチャを SUBSTRING が返す。
    const seqPattern = `^${prefix}([0-9]+)$`;

    async function fetchNextSeq(): Promise<number> {
      const rows = await sql`
        SELECT COALESCE(
          MAX(CAST(SUBSTRING(no FROM ${seqPattern}) AS INTEGER)),
          0
        ) AS max_seq
        FROM estimates
        WHERE no LIKE ${likePattern}
      `;
      return Number(rows[0]?.max_seq ?? 0) + 1;
    }

    let seq = await fetchNextSeq();

    const createdAt = now.toISOString().slice(0, 10);

    type EstimateInsertRow = {
      id: string;
      no: string;
      status: string;
      created_at: string;
    };
    let record: EstimateInsertRow | null = null;
    const MAX_NO_RETRY = 10;
    for (let attempt = 0; attempt < MAX_NO_RETRY; attempt++) {
      const candidateNo = `${prefix}${String(seq).padStart(3, "0")}`;
      try {
        const rows = await sql`
          INSERT INTO estimates
            (no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing, form_inputs)
          VALUES
            (${candidateNo}, ${agencyId}, ${agencyName}, ${resolvedCustomerName},
             ${deliveryType}, ${contractType}, ${cloudBilling ?? null},
             ${JSON.stringify(normalizedFormInputs)}::JSONB)
          RETURNING id, no, status,
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at
        `;
        record = rows[0] as EstimateInsertRow;
        break;
      } catch (insertErr: unknown) {
        const e = insertErr as { code?: string; constraint?: string } | null;
        if (e?.code === "23505" && e?.constraint === "estimates_no_key") {
          // 衝突: MAX を再取得して取り直す（並列申請で他リクエストが先に確定したケースに追従）。
          // 万一 MAX が今の seq 以下のままなら、確実に進めるため +1 する。
          const next = await fetchNextSeq();
          const bumped = next > seq ? next : seq + 1;
          console.warn(
            `[submit] estimate no collision on ${candidateNo} (attempt ${attempt + 1}), retry seq=${bumped}`
          );
          seq = bumped;
          continue;
        }
        throw insertErr;
      }
    }
    if (!record) {
      console.error(`[submit] estimate no collision exceeded ${MAX_NO_RETRY} retries for prefix ${prefix}`);
      return NextResponse.json({ error: "estimate_no_collision" }, { status: 500 });
    }
    const estimateNo = record.no;

    // ── Excel 生成 & Blob 保存 ────────────────────────────
    // HubSpot 連携は承認時（PUT /api/estimates/[id] status=approved）に行うため、
    // submit 時点では C13 セル（Hubspot NO）は空のままとする
    let hubspotDealId = "";
    let excelUrl = "";

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const templateId = resolveTemplateId(deliveryType, contractType, cloudBilling);
        if (templateId) {
          const tplRows = await sql`SELECT blob_url FROM templates WHERE id = ${templateId}`;
          const blobUrl = tplRows[0]?.blob_url as string | undefined;

          if (blobUrl) {
            const tplRes = await fetch(blobUrl);
            if (tplRes.ok) {
              const templateArrayBuffer = await tplRes.arrayBuffer();
              // ArrayBuffer → Buffer に変換して ExcelJS に渡す
              const templateBuffer = Buffer.from(new Uint8Array(templateArrayBuffer));
              const excelBuffer = await writeEstimateToTemplate({
                templateBuffer,
                agencyName,
                agencyType,
                customerName: resolvedCustomerName,
                deliveryType,
                contractType,
                cloudBilling,
                formInputs: normalizedFormInputs,
                createdAt,
                productMarginRate,
                maintenanceMarginRate,
              });

              const { url: exUrl } = await put(
                `estimates/${record.id}/${estimateNo}.xlsx`,
                excelBuffer,
                { access: "public", addRandomSuffix: false }
              );
              excelUrl = exUrl;

              await sql`
                UPDATE estimates SET excel_url = ${excelUrl} WHERE id = ${record.id}
              `;
            } else {
              console.warn(`[submit] Template fetch failed: ${tplRes.status}`);
            }
          } else {
            console.warn(`[submit] Template ${templateId} has no blob_url`);
          }
        }
      } catch (excelErr) {
        // 詳細エラーはサーバログにのみ残し、レスポンスには含めない（スタック漏洩防止）
        console.error("[submit] Excel generation error:", excelErr);
        return NextResponse.json({
          id: record.id, no: record.no, status: record.status,
          createdAt: record.created_at, excelUrl: "", pdfUrl: "",
          hubspotDealId: hubspotDealId || undefined,
          excelError: "excel_generation_failed",
        }, { status: 201 });
      }
    }

    // ── 承認通知（失敗しても申請は成功扱い）──────────────
    try {
      const deliveryLabel = DELIVERY_TYPES.find((d) => d.value === deliveryType)?.labelJa ?? deliveryType;
      const contractLabel = CONTRACT_TYPES.find((c) => c.value === contractType)?.labelJa ?? contractType;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://estimate-webapp.vercel.app";

      await sendApprovalNotification({
        estimateNo,
        customerName,
        deliveryType: deliveryLabel,
        contractType: contractLabel,
        requestedAt: record.created_at,
        agencyName,
        approvalUrl: `${baseUrl}/approver?no=${estimateNo}`,
      });
    } catch (notifyErr) {
      console.error("[submit] Notification failed (skipped):", notifyErr);
    }

    return NextResponse.json({
      id: record.id,
      no: record.no,
      status: record.status,
      createdAt: record.created_at,
      excelUrl,
      pdfUrl: "",
      ...(hubspotDealId ? { hubspotDealId } : {}),
    }, { status: 201 });

  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[submit] Error:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
