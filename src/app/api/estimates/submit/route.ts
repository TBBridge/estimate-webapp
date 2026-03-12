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
    const sql = getDb();
    const body = await req.json();

    const {
      agencyId,
      agencyName,
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

    // ── 見積番号生成 ─────────────────────────────────────
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const seqRows = await sql`
      SELECT COUNT(*) AS cnt FROM estimates WHERE no LIKE ${"EST-" + ym + "-%"}
    `;
    const seq = Number(seqRows[0].cnt) + 1;
    const estimateNo = `EST-${ym}-${String(seq).padStart(3, "0")}`;
    const createdAt = now.toISOString().slice(0, 10);

    // ── DB INSERT ────────────────────────────────────────
    const rows = await sql`
      INSERT INTO estimates
        (no, agency_id, agency_name, customer_name,
         delivery_type, contract_type, cloud_billing, form_inputs)
      VALUES
        (${estimateNo}, ${agencyId}, ${agencyName}, ${customerName},
         ${deliveryType}, ${contractType}, ${cloudBilling ?? null},
         ${JSON.stringify(formInputs)}::JSONB)
      RETURNING id, no, status,
                TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at
    `;
    const record = rows[0];

    // ── Excel 生成 & Blob 保存 ────────────────────────────
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
              const templateBuffer = await tplRes.arrayBuffer();
              const excelBuffer = await writeEstimateToTemplate({
                templateBuffer,
                agencyName,
                customerName,
                deliveryType,
                contractType,
                cloudBilling,
                formInputs,
                createdAt,
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
        const errMsg = excelErr instanceof Error ? `${excelErr.message}\n${excelErr.stack}` : String(excelErr);
        console.error("[submit] Excel generation error:", errMsg);
        // excelError をレスポンスに含めてデバッグを容易にする（申請自体は成功）
        return NextResponse.json({
          id: record.id, no: record.no, status: record.status,
          createdAt: record.created_at, excelUrl: "", pdfUrl: "",
          excelError: errMsg,
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
    }, { status: 201 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[submit] Error:", msg, stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
