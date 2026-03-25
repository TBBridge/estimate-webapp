/**
 * 新規契約（contract_type === "new"）の見積が承認されたとき、
 * kintone 営業案件管理アプリへ upsert（同一代理店＋同一顧客名で既存があれば更新）。
 */
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import {
  escapeKintoneQueryString,
  fetchKintoneRecords,
  postKintoneRecord,
  putKintoneRecord,
  type KintoneRecordInput,
} from "@/lib/kintone";
import { getKintoneSalesAppConfig } from "@/lib/kintone-env";
import type { KintoneSalesSyncResultDto } from "@/lib/kintone-sales-types";

export type EstimateRowForKintoneSales = {
  id: string;
  no: string;
  agency_id: string;
  agency_name: string;
  customer_name: string;
  delivery_type: string;
  contract_type: string;
  cloud_billing: string | null;
  excel_url: string;
  pdf_url: string;
  amount: number;
  maintenance_fee: number;
  form_inputs: unknown;
  /** TO_CHAR 済み承認日時（JST 表示）または null */
  approved_at: string | null;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function setMappedField(
  record: KintoneRecordInput,
  envVarName: string,
  value: unknown
): void {
  const code = env(envVarName);
  if (!code) return;
  if (value == null) return;
  if (typeof value === "string" && value.trim() === "") return;
  record[code] = { value: String(value) };
}

function deliveryLabelJa(v: string): string {
  return DELIVERY_TYPES.find((d) => d.value === v)?.labelJa ?? v;
}

function contractLabelJa(v: string): string {
  return CONTRACT_TYPES.find((c) => c.value === v)?.labelJa ?? v;
}

/** 承認日を DATE 用 YYYY-MM-DD（JST）に */
function approvedDateOnly(approvedAtChar: string | null): string {
  if (!approvedAtChar) {
    const d = new Date();
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(approvedAtChar.trim());
  return m ? m[1] : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function buildAgencyQueryClause(
  fieldAgency: string,
  matchBy: string,
  agencyId: string,
  agencyName: string
): string {
  if (matchBy === "name" && agencyName) {
    return `${fieldAgency} = "${escapeKintoneQueryString(agencyName)}"`;
  }
  return `${fieldAgency} = "${escapeKintoneQueryString(agencyId)}"`;
}

/**
 * 見積1件分の kintone レコードペイロード（フィールドコードは環境変数で指定）
 */
export function buildKintoneSalesRecordPayload(row: EstimateRowForKintoneSales): KintoneRecordInput {
  const record: KintoneRecordInput = {};

  setMappedField(record, "KINTONE_SALES_FIELD_CUSTOMER", row.customer_name.trim());
  setMappedField(record, "KINTONE_SALES_FIELD_ESTIMATE_NO", row.no);
  setMappedField(record, "KINTONE_SALES_FIELD_AGENCY_NAME", row.agency_name);
  setMappedField(record, "KINTONE_SALES_FIELD_AGENCY_ID", row.agency_id);
  setMappedField(record, "KINTONE_SALES_FIELD_DELIVERY", deliveryLabelJa(row.delivery_type));
  setMappedField(record, "KINTONE_SALES_FIELD_CONTRACT", contractLabelJa(row.contract_type));
  setMappedField(record, "KINTONE_SALES_FIELD_DELIVERY_RAW", row.delivery_type);
  setMappedField(record, "KINTONE_SALES_FIELD_CONTRACT_RAW", row.contract_type);
  if (row.cloud_billing) {
    setMappedField(record, "KINTONE_SALES_FIELD_CLOUD_BILLING", row.cloud_billing);
  }
  setMappedField(record, "KINTONE_SALES_FIELD_EXCEL_URL", row.excel_url || undefined);
  setMappedField(record, "KINTONE_SALES_FIELD_PDF_URL", row.pdf_url || undefined);
  setMappedField(record, "KINTONE_SALES_FIELD_WEB_ESTIMATE_ID", row.id);
  setMappedField(record, "KINTONE_SALES_FIELD_AMOUNT", row.amount);
  setMappedField(record, "KINTONE_SALES_FIELD_MAINTENANCE_FEE", row.maintenance_fee);
  setMappedField(record, "KINTONE_SALES_FIELD_APPROVED_AT", approvedDateOnly(row.approved_at));

  const formJsonField = env("KINTONE_SALES_FIELD_FORM_JSON");
  if (formJsonField && row.form_inputs != null) {
    try {
      const s = JSON.stringify(row.form_inputs);
      record[formJsonField] = { value: s.length > 12000 ? s.slice(0, 12000) + "…" : s };
    } catch {
      /* ignore */
    }
  }

  return record;
}

export async function syncApprovedNewEstimateToKintoneSales(
  row: EstimateRowForKintoneSales
): Promise<KintoneSalesSyncResultDto> {
  if (row.contract_type !== "new") {
    return { ok: true, skipped: true, reason: "not_new_contract" };
  }

  const kc = getKintoneSalesAppConfig();
  if (!kc) {
    return { ok: true, skipped: true, reason: "sales_app_not_configured" };
  }

  const fieldCustomer = env("KINTONE_SALES_FIELD_CUSTOMER");
  if (!fieldCustomer) {
    return {
      ok: false,
      error:
        "営業案件連携に KINTONE_SALES_FIELD_CUSTOMER（顧客名フィールドコード）の設定が必要です。",
    };
  }

  const fieldAgency = env("KINTONE_SALES_FIELD_AGENCY_ID");
  const matchBy = env("KINTONE_SALES_MATCH_AGENCY_BY") || "id";

  const customerTrim = row.customer_name.trim();
  if (!customerTrim) {
    return { ok: false, error: "顧客名が空のため kintone に登録できません。" };
  }

  const escapedCustomer = escapeKintoneQueryString(customerTrim);
  let query: string;
  if (fieldAgency) {
    const agencyPart = buildAgencyQueryClause(
      fieldAgency,
      matchBy,
      row.agency_id,
      row.agency_name
    );
    query = `${agencyPart} and ${fieldCustomer} = "${escapedCustomer}" order by $id desc limit 1`;
  } else {
    query = `${fieldCustomer} = "${escapedCustomer}" order by $id desc limit 1`;
  }

  const record = buildKintoneSalesRecordPayload(row);
  if (Object.keys(record).length === 0) {
    return { ok: false, error: "マッピング対象フィールドが1つもありません（KINTONE_SALES_FIELD_* を設定してください）。" };
  }

  try {
    const existing = await fetchKintoneRecords({
      domain: kc.domain,
      appId: kc.appId,
      apiToken: kc.apiToken,
      query,
      fields: ["$id", fieldCustomer],
    });

    const first = existing.records?.[0];
    const existingId = first?.$id?.value;

    if (existingId) {
      await putKintoneRecord({
        domain: kc.domain,
        appId: kc.appId,
        apiToken: kc.apiToken,
        recordId: existingId,
        record,
      });
      return { ok: true, action: "updated", recordId: String(existingId) };
    }

    const { id } = await postKintoneRecord({
      domain: kc.domain,
      appId: kc.appId,
      apiToken: kc.apiToken,
      record,
    });
    return { ok: true, action: "created", recordId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[kintone-sales-sync]", msg);
    return { ok: false, error: msg.slice(0, 400) };
  }
}
