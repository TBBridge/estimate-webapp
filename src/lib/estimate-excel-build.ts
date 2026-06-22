/**
 * 見積の現在の DB 状態（form_inputs・顧客名・代理店・仕切り率）からテンプレート Excel を
 * 再生成し、Blob に保存して excel_url を更新する。
 *
 * 申請時 (POST /api/estimates/submit) と、承認者・管理者による申請内容の編集時
 * (PATCH /api/estimates/[id]) で共通利用する。編集時は既存 Excel を履歴
 * (excel_file_history) に退避してから差し替え、pdf_url をクリアする
 * （PDF 再生成は呼び出し側で generateEstimatePdfAndSave を呼ぶこと）。
 */
import { put } from "@vercel/blob";
import type { getDb } from "@/lib/db";
import { writeEstimateToTemplate } from "@/lib/excel-writer";
import {
  parseExcelFileHistory,
  sanitizeEstimateNoForBlobPath,
  type ExcelFileHistoryEntry,
} from "@/lib/excel-file-history";

type Sql = ReturnType<typeof getDb>;

/** 仕切り率マスタの主製品キー */
const MAIN_PRODUCT_ID = "ireporter";

/** 提供形態・契約形態（とクラウド課金区分）からテンプレート ID を解決する */
export function resolveTemplateId(
  deliveryType: string,
  contractType: string,
  cloudBilling?: string | null
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

export type RegenerateExcelResult = {
  excelUrl: string;
  excelFileHistory: ExcelFileHistoryEntry[];
};

/**
 * 見積 ID に紐づく Excel を DB の現在値から再生成して Blob に保存する。
 *
 * @returns 生成に必要な要素（BLOB トークン・テンプレート）が揃わない場合は null。
 * @throws テンプレート取得失敗・Excel 書き込み失敗時は例外を投げる。
 */
export async function regenerateEstimateExcel(
  sql: Sql,
  estimateId: string
): Promise<RegenerateExcelResult | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  const rows = await sql`
    SELECT id, no, agency_id, agency_name, customer_name,
           delivery_type, contract_type, cloud_billing,
           form_inputs, excel_url, excel_file_history,
           COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
           TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created_at
    FROM estimates WHERE id = ${estimateId}
  `;
  if (rows.length === 0) throw new Error("見積が見つかりません");
  const est = rows[0] as {
    id: string;
    no: string;
    agency_id: string;
    agency_name: string;
    customer_name: string;
    delivery_type: string;
    contract_type: string;
    cloud_billing: string | null;
    form_inputs: unknown;
    excel_url: string | null;
    excel_file_history: unknown;
    hubspot_deal_id: string;
    created_at: string;
  };

  const templateId = resolveTemplateId(est.delivery_type, est.contract_type, est.cloud_billing);
  if (!templateId) return null;

  const tplRows = await sql`SELECT blob_url FROM templates WHERE id = ${templateId}`;
  const blobUrl = (tplRows[0] as { blob_url?: string } | undefined)?.blob_url;
  if (!blobUrl) return null;

  // 代理店種別（設定情報 C7 の VLOOKUP キー）と仕切り率
  const agencyRows = await sql`
    SELECT agency_type FROM agencies WHERE id = ${est.agency_id} LIMIT 1
  `;
  const agencyType =
    (agencyRows[0] as { agency_type?: string } | undefined)?.agency_type ?? est.agency_name;

  const mrRows = await sql`
    SELECT CAST(rate AS FLOAT) AS rate FROM margin_rates
    WHERE agency_id = ${est.agency_id} AND product_id = ${MAIN_PRODUCT_ID} AND delivery_type = ${est.delivery_type}
    LIMIT 1
  `;
  const maintRows = await sql`
    SELECT CAST(rate AS FLOAT) AS rate FROM maintenance_rates
    WHERE agency_id = ${est.agency_id} AND product_id = ${MAIN_PRODUCT_ID}
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

  const formInputs =
    est.form_inputs && typeof est.form_inputs === "object" && !Array.isArray(est.form_inputs)
      ? (est.form_inputs as Record<string, unknown>)
      : {};

  const tplRes = await fetch(blobUrl, { cache: "no-store" });
  if (!tplRes.ok) {
    throw new Error(`テンプレート取得に失敗しました: HTTP ${tplRes.status}`);
  }
  const templateBuffer = Buffer.from(new Uint8Array(await tplRes.arrayBuffer()));

  const excelBuffer = await writeEstimateToTemplate({
    templateBuffer,
    agencyName: est.agency_name,
    agencyType,
    customerName: est.customer_name,
    deliveryType: est.delivery_type,
    contractType: est.contract_type,
    cloudBilling: est.cloud_billing ?? undefined,
    formInputs,
    createdAt: est.created_at,
    productMarginRate,
    maintenanceMarginRate,
    hubspotNo: est.hubspot_deal_id || undefined,
  });

  // 既存 Excel があれば履歴へ退避してから差し替える
  const prevHistory = parseExcelFileHistory(est.excel_file_history);
  const currentUrl = String(est.excel_url ?? "").trim();
  const newHistory: ExcelFileHistoryEntry[] = [...prevHistory];
  if (currentUrl) {
    newHistory.push({
      version: newHistory.length + 1,
      url: currentUrl,
      uploadedAt: new Date().toISOString(),
    });
  }

  const seq = newHistory.length + 1;
  const safeNo = sanitizeEstimateNoForBlobPath(est.no);
  const blobPath = `estimates/${estimateId}/${safeNo}_r${seq}_${Date.now()}.xlsx`;
  const { url: excelUrl } = await put(blobPath, excelBuffer, {
    access: "public",
    addRandomSuffix: false,
  });

  await sql`
    UPDATE estimates
    SET excel_url = ${excelUrl},
        pdf_url = '',
        excel_file_history = ${JSON.stringify(newHistory)}::jsonb
    WHERE id = ${estimateId}
  `;

  return { excelUrl, excelFileHistory: newHistory };
}
