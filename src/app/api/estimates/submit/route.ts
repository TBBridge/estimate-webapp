/**
 * POST /api/estimates/submit
 *
 * 代理店が見積フォームを申請する際に呼び出すエンドポイント。
 * 1. 見積番号を生成
 * 2. DB に estimates レコードを INSERT
 * 3. テンプレート Excel を Blob から取得してデータを書き込み → Blob に保存
 * 4. DB の excel_url を更新
 * 5. 承認通知を送信（Slack / Teams / Gmail）
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { sendApprovalNotification } from "@/lib/notify";
import { writeEstimateToTemplate } from "@/lib/excel-writer";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

/** 提供形態・契約形態・cloudBilling からテンプレート ID を解決 */
function resolveTemplateId(
  deliveryType: string,
  contractType: string,
  cloudBilling?: string
): string | null {
  // tpl-1: オンプレ 新規
  // tpl-2: オンプレ ライセンス追加
  // tpl-3: オンプレ オプション追加
  // tpl-4: サブスクリプション 新規
  // tpl-5: クラウド 新規（年額）
  // tpl-6: クラウド 新規（区切り）
  // tpl-7: クラウド 追加
  if (deliveryType === "onprem") {
    if (contractType === "new") return "tpl-1";
    if (contractType === "license_add") return "tpl-2";
    if (contractType === "option_add") return "tpl-3";
  }
  if (deliveryType === "subscription" && contractType === "new") return "tpl-4";
  if (deliveryType === "cloud") {
    if (contractType === "new") {
      return cloudBilling === "period" ? "tpl-6" : "tpl-5";
    }
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
      SELECT COUNT(*) AS cnt
      FROM estimates
      WHERE no LIKE ${"EST-" + ym + "-%"}
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
            // テンプレートを Blob から取得
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

              // 生成した Excel を Blob に保存
              const fileName = `${estimateNo}.xlsx`;
              const { url } = await put(
                `estimates/${record.id}/${fileName}`,
                excelBuffer,
                { access: "public", addRandomSuffix: false }
              );
              excelUrl = url;

              // DB 更新
              await sql`
                UPDATE estimates SET excel_url = ${excelUrl} WHERE id = ${record.id}
              `;
            } else {
              console.warn(`[submit] Template fetch failed: ${tplRes.status} ${blobUrl}`);
            }
          } else {
            console.warn(`[submit] Template ${templateId} has no blob_url`);
          }
        }
      } catch (excelErr) {
        // Excel 生成失敗は申請自体を止めない（警告のみ）
        console.error("[submit] Excel generation error:", excelErr);
      }
    } else {
      console.warn("[submit] BLOB_READ_WRITE_TOKEN not set, skipping Excel generation");
    }

    // ── 承認通知 ─────────────────────────────────────────
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

    return NextResponse.json({
      id: record.id,
      no: record.no,
      status: record.status,
      createdAt: record.created_at,
      excelUrl,
    }, { status: 201 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[submit] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
