/**
 * HubSpot Private App（アクセストークン）＋取引の重複検索条件
 *
 * 必須: HUBSPOT_ACCESS_TOKEN
 * 重複判定（いずれか）:
 *   - 単一プロパティ: HUBSPOT_MATCH_PROPERTY（HubSpot の内部名）と値は agency_id|正規化顧客名
 *   - AND 検索: HUBSPOT_MATCH_AGENCY_PROPERTY + HUBSPOT_MATCH_CUSTOMER_PROPERTY
 *
 * 取引作成時は pipeline / dealstage が必要なため、未指定時は API で先頭パイプラインの先頭ステージを使用します。
 */

export type HubSpotDedupeSingle = {
  kind: "single";
  property: string;
};

export type HubSpotDedupeAnd = {
  kind: "and";
  agencyProperty: string;
  customerProperty: string;
};

/**
 * 会社名のみで照合（HUBSPOT_MATCH_CUSTOMER_PROPERTY のみ設定。AGENCY 側プロパティが無い場合）
 * 設定が無ければ dealname の CONTAINS_TOKEN にフォールバックする
 */
export type HubSpotDedupeCustomerOnly = {
  kind: "customer";
  customerProperty: string;
};

export type HubSpotConfig = {
  accessToken: string;
  apiBase: string;
  /** dedupe 未指定時は dealname の CONTAINS_TOKEN で会社名検索する */
  dedupe:
    | HubSpotDedupeSingle
    | HubSpotDedupeAnd
    | HubSpotDedupeCustomerOnly
    | { kind: "none" };
  pipelineId?: string;
  dealStageId?: string;
  /** 作成時にコピーする任意プロパティ internalName → 固定値またはテンプレート */
  extraCreateProperties?: Record<string, string>;
};

function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 単一キーモード用の重複照合用値（DB の agency_id + 顧客名） */
export function buildHubSpotSingleMatchValue(agencyId: string, customerName: string): string {
  return `${agencyId}|${normalizeCustomerName(customerName)}`;
}

export function getHubSpotConfig(): HubSpotConfig | null {
  const accessToken =
    process.env.HUBSPOT_ACCESS_TOKEN?.trim() || process.env.HUBSPOT_PRIVATE_APP_ACCESS_TOKEN?.trim() || "";
  if (!accessToken) return null;

  const apiBase = (process.env.HUBSPOT_API_BASE ?? "https://api.hubapi.com").replace(/\/$/, "");

  const agencyProp = process.env.HUBSPOT_MATCH_AGENCY_PROPERTY?.trim() ?? "";
  const customerProp = process.env.HUBSPOT_MATCH_CUSTOMER_PROPERTY?.trim() ?? "";
  const singleProp = process.env.HUBSPOT_MATCH_PROPERTY?.trim() ?? "";

  let dedupe: HubSpotConfig["dedupe"];
  if (agencyProp && customerProp) {
    dedupe = { kind: "and", agencyProperty: agencyProp, customerProperty: customerProp };
  } else if (singleProp) {
    dedupe = { kind: "single", property: singleProp };
  } else if (customerProp) {
    dedupe = { kind: "customer", customerProperty: customerProp };
  } else {
    // 何も設定されていない場合は dealname の CONTAINS_TOKEN にフォールバック
    dedupe = { kind: "none" };
  }

  const pipelineId = process.env.HUBSPOT_PIPELINE_ID?.trim() || undefined;
  const dealStageId = process.env.HUBSPOT_DEAL_STAGE_ID?.trim() || undefined;

  const extra: Record<string, string> = {};
  const extraJson = process.env.HUBSPOT_CREATE_PROPERTIES_JSON?.trim();
  if (extraJson) {
    try {
      const parsed = JSON.parse(extraJson) as Record<string, string>;
      Object.assign(extra, parsed);
    } catch {
      console.warn("[hubspot] HUBSPOT_CREATE_PROPERTIES_JSON の JSON が不正です。無視します。");
    }
  }

  return {
    accessToken,
    apiBase,
    dedupe,
    pipelineId,
    dealStageId,
    extraCreateProperties: Object.keys(extra).length ? extra : undefined,
  };
}

export function hubSpotConfigHelpMessage(): string {
  return (
    "HubSpot: HUBSPOT_ACCESS_TOKEN（Private App のアクセストークン）と、" +
    "HUBSPOT_MATCH_PROPERTY（単一フィールドで照合）または " +
    "HUBSPOT_MATCH_AGENCY_PROPERTY + HUBSPOT_MATCH_CUSTOMER_PROPERTY（代理店・顧客の AND 照合）を設定してください。"
  );
}
