/**
 * POST /api/estimates/submit
 *
 * 1. 見積番号を生成
 * 2. DB に estimates レコードを INSERT
 * 3. テンプレート Excel にデータ書き込み → Blob に Excel 保存
 * 4. xlsx で書き込み済み Excel を読み取り → @react-pdf/renderer で PDF 生成 → Blob に保存
 * 5. DB の excel_url / pdf_url を更新
 * 6. 承認通知を送信
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { sendApprovalNotification } from "@/lib/notify";
import { writeEstimateToTemplate } from "@/lib/excel-writer";
import { readExcelSheet } from "@/lib/excel-reader";
import { generateEstimatePdf } from "@/lib/pdf-generator";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    // ── Excel & PDF 生成 ──────────────────────────────────
    let excelUrl = "";
    let pdfUrl = "";

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

              // ── Excel 生成（exceljs でテンプレートにデータ書き込み）──
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

              // ── PDF 生成（xlsx で読み取り → @react-pdf/renderer）──
              const { cells, maxRow, maxCol } = readExcelSheet(excelBuffer);

              const pdfBuffer = await generateEstimatePdf({
                estimateNo,
                createdAt,
                agencyName,
                customerName,
                deliveryType,
                contractType,
                cloudBilling,
                cells,
                maxRow,
                maxCol,
              });

              const { url: pdUrl } = await put(
                `estimates/${record.id}/${estimateNo}.pdf`,
                pdfBuffer,
                { access: "public", addRandomSuffix: false }
              );
              pdfUrl = pdUrl;

              // DB 更新
              await sql`
                UPDATE estimates
                SET excel_url = ${excelUrl}, pdf_url = ${pdfUrl}
                WHERE id = ${record.id}
              `;
            } else {
              console.warn(`[submit] Template fetch failed: ${tplRes.status} ${blobUrl}`);
            }
          } else {
            console.warn(`[submit] Template ${templateId} has no blob_url`);
          }
        }
      } catch (genErr) {
        console.error("[submit] File generation error:", genErr);
      }
    } else {
      console.warn("[submit] BLOB_READ_WRITE_TOKEN not set, skipping file generation");
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
      pdfUrl,
    }, { status: 201 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[submit] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
