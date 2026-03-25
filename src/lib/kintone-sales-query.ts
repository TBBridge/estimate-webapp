/**
 * 営業案件アプリ: レコード検索クエリ（顧客単位 / 代理店+顧客 の切り替え）
 */
import { escapeKintoneQueryString } from "@/lib/kintone";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export type KintoneSalesUpsertScope = "customer" | "customer_and_agency";

/** 既定は顧客のみ（複数代理店から同一顧客の見積で 1 レコードを共有） */
export function getKintoneSalesUpsertScope(): KintoneSalesUpsertScope {
  const s = env("KINTONE_SALES_UPSERT_SCOPE").toLowerCase();
  if (s === "customer_and_agency") return "customer_and_agency";
  return "customer";
}

export function buildAgencyQueryClause(
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

export function buildKintoneSalesLookupQuery(opts: {
  customerTrim: string;
  fieldCustomer: string;
  scope: KintoneSalesUpsertScope;
  fieldAgency: string;
  matchBy: string;
  agencyId: string;
  agencyName: string;
}): string {
  const escapedCustomer = escapeKintoneQueryString(opts.customerTrim);
  if (opts.scope === "customer_and_agency" && opts.fieldAgency) {
    const agencyPart = buildAgencyQueryClause(
      opts.fieldAgency,
      opts.matchBy,
      opts.agencyId,
      opts.agencyName
    );
    return `${agencyPart} and ${opts.fieldCustomer} = "${escapedCustomer}" order by $id desc limit 1`;
  }
  return `${opts.fieldCustomer} = "${escapedCustomer}" order by $id desc limit 1`;
}
