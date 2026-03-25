/**
 * 案件詳細用: 顧客名で営業案件 kintone レコードを検索し、表示用行を組み立てる
 */
import { fetchKintoneRecords, type KintoneRecord } from "@/lib/kintone";
import { getKintoneSalesAppConfig } from "@/lib/kintone-env";
import {
  buildKintoneSalesLookupQuery,
  getKintoneSalesUpsertScope,
} from "@/lib/kintone-sales-query";
import type { Locale } from "@/lib/translations";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

type PreviewFieldDef = { envVar: string; labelJa: string; labelEn: string };

const PREVIEW_FIELDS: PreviewFieldDef[] = [
  { envVar: "KINTONE_SALES_FIELD_CUSTOMER", labelJa: "顧客名", labelEn: "Customer" },
  { envVar: "KINTONE_SALES_FIELD_ESTIMATE_NO", labelJa: "見積番号", labelEn: "Estimate no." },
  { envVar: "KINTONE_SALES_FIELD_AGENCY_NAME", labelJa: "代理店名", labelEn: "Agency name" },
  { envVar: "KINTONE_SALES_FIELD_AGENCY_ID", labelJa: "代理店ID", labelEn: "Agency ID" },
  { envVar: "KINTONE_SALES_FIELD_DELIVERY", labelJa: "提供形態", labelEn: "Delivery type" },
  { envVar: "KINTONE_SALES_FIELD_CONTRACT", labelJa: "契約形態", labelEn: "Contract type" },
  { envVar: "KINTONE_SALES_FIELD_DELIVERY_RAW", labelJa: "提供形態（コード）", labelEn: "Delivery (code)" },
  { envVar: "KINTONE_SALES_FIELD_CONTRACT_RAW", labelJa: "契約形態（コード）", labelEn: "Contract (code)" },
  { envVar: "KINTONE_SALES_FIELD_CLOUD_BILLING", labelJa: "クラウド課金", labelEn: "Cloud billing" },
  { envVar: "KINTONE_SALES_FIELD_EXCEL_URL", labelJa: "Excel URL", labelEn: "Excel URL" },
  { envVar: "KINTONE_SALES_FIELD_PDF_URL", labelJa: "PDF URL", labelEn: "PDF URL" },
  { envVar: "KINTONE_SALES_FIELD_WEB_ESTIMATE_ID", labelJa: "Web見積ID", labelEn: "Web estimate ID" },
  { envVar: "KINTONE_SALES_FIELD_AMOUNT", labelJa: "見積額", labelEn: "Amount" },
  { envVar: "KINTONE_SALES_FIELD_MAINTENANCE_FEE", labelJa: "保守料等", labelEn: "Maintenance fee" },
  { envVar: "KINTONE_SALES_FIELD_APPROVED_AT", labelJa: "承認日", labelEn: "Approved date" },
  { envVar: "KINTONE_SALES_FIELD_FORM_JSON", labelJa: "フォームJSON", labelEn: "Form JSON" },
  { envVar: "KINTONE_SALES_FIELD_ESTIMATE_HISTORY", labelJa: "見積履歴", labelEn: "Estimate history" },
];

function formatKintoneCellValue(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (Array.isArray(raw)) {
    try {
      return raw.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
    } catch {
      return String(raw);
    }
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

function rowValue(rec: KintoneRecord, fieldCode: string): string {
  const cell = rec[fieldCode];
  if (!cell || typeof cell !== "object" || !("value" in cell)) return "";
  return formatKintoneCellValue((cell as { value: unknown }).value).trim();
}

export type KintoneSalesPreviewPayload =
  | { configured: false }
  | {
      configured: true;
      found: boolean;
      recordId?: string;
      rows: { label: string; value: string }[];
      error?: string;
    };

export async function fetchKintoneSalesPreviewForCustomer(
  customerName: string,
  agencyId: string,
  agencyName: string,
  locale: Locale
): Promise<KintoneSalesPreviewPayload> {
  const kc = getKintoneSalesAppConfig();
  if (!kc) return { configured: false };

  const fieldCustomer = env("KINTONE_SALES_FIELD_CUSTOMER");
  if (!fieldCustomer) {
    return {
      configured: true,
      found: false,
      rows: [],
      error:
        locale === "en"
          ? "KINTONE_SALES_FIELD_CUSTOMER is not set."
          : "KINTONE_SALES_FIELD_CUSTOMER が未設定です。",
    };
  }

  const customerTrim = customerName.trim();
  if (!customerTrim) {
    return { configured: true, found: false, rows: [] };
  }

  const scope = getKintoneSalesUpsertScope();
  const fieldAgency = env("KINTONE_SALES_FIELD_AGENCY_ID");
  const matchBy = env("KINTONE_SALES_MATCH_AGENCY_BY") || "id";

  const query = buildKintoneSalesLookupQuery({
    customerTrim,
    fieldCustomer,
    scope,
    fieldAgency,
    matchBy,
    agencyId,
    agencyName,
  });

  const fieldCodes = new Set<string>(["$id", fieldCustomer]);
  for (const p of PREVIEW_FIELDS) {
    const code = env(p.envVar);
    if (code) fieldCodes.add(code);
  }

  try {
    const data = await fetchKintoneRecords({
      domain: kc.domain,
      appId: kc.appId,
      apiToken: kc.apiToken,
      query,
      fields: [...fieldCodes],
    });

    const first = data.records?.[0];
    if (!first) {
      return { configured: true, found: false, rows: [] };
    }

    const recordId = String(first.$id?.value ?? "").trim();
    const rows: { label: string; value: string }[] = [];

    if (recordId) {
      rows.push({
        label: locale === "en" ? "Record no. ($id)" : "レコード番号",
        value: recordId,
      });
    }

    for (const p of PREVIEW_FIELDS) {
      const code = env(p.envVar);
      if (!code) continue;
      const value = rowValue(first, code);
      if (!value) continue;
      rows.push({
        label: locale === "en" ? p.labelEn : p.labelJa,
        value: value.length > 8000 ? value.slice(0, 8000) + "…" : value,
      });
    }

    return { configured: true, found: true, recordId: recordId || undefined, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[kintone-sales-preview]", msg);
    return {
      configured: true,
      found: false,
      rows: [],
      error: msg.slice(0, 400),
    };
  }
}
