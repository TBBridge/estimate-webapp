/**
 * kintone REST API ヘルパー（サーバー専用）
 * @see https://cybozu.dev/ja/kintone/docs/rest-api/
 */

/** kintone クエリ文字列内のエスケープ */
export function escapeKintoneQueryString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type KintoneRecord = {
  $id?: { value: string };
  [fieldCode: string]: { value: unknown } | undefined;
};

export type KintoneRecordsResponse = {
  records?: KintoneRecord[];
  totalCount?: string | null;
};

/**
 * ドメイン末尾のスラッシュを除去
 */
export function normalizeKintoneDomain(domain: string): string {
  return domain.replace(/\/+$/, "");
}

/**
 * レコード一覧取得 GET /k/v1/records.json
 */
export async function fetchKintoneRecords(params: {
  domain: string;
  appId: string | number;
  apiToken: string;
  query: string;
  fields?: string[];
}): Promise<KintoneRecordsResponse> {
  const base = normalizeKintoneDomain(params.domain);
  const url = new URL(`${base}/k/v1/records.json`);
  url.searchParams.set("app", String(params.appId));
  url.searchParams.set("query", params.query);
  if (params.fields?.length) {
    params.fields.forEach((f) => url.searchParams.append("fields[]", f));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Cybozu-API-Token": params.apiToken,
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kintone API ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as KintoneRecordsResponse;
}

/** kintone レコードの record オブジェクト（フィールドコード → { value }） */
export type KintoneRecordInput = Record<string, { value: unknown }>;

/**
 * レコード登録 POST /k/v1/record.json
 * @see https://cybozu.dev/ja/kintone/docs/rest-api/records/add-record/
 */
export async function postKintoneRecord(params: {
  domain: string;
  appId: string | number;
  apiToken: string;
  record: KintoneRecordInput;
}): Promise<{ id: string }> {
  const base = normalizeKintoneDomain(params.domain);
  const res = await fetch(`${base}/k/v1/record.json`, {
    method: "POST",
    headers: {
      "X-Cybozu-API-Token": params.apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ app: params.appId, record: params.record }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kintone add record ${res.status}: ${text.slice(0, 500)}`);
  }
  const j = JSON.parse(text) as { id?: string };
  const id = j.id != null ? String(j.id) : "";
  if (!id) throw new Error(`kintone add record: missing id in response`);
  return { id };
}

/**
 * レコード更新 PUT /k/v1/record.json
 * @see https://cybozu.dev/ja/kintone/docs/rest-api/records/update-record/
 */
export async function putKintoneRecord(params: {
  domain: string;
  appId: string | number;
  apiToken: string;
  recordId: string | number;
  record: KintoneRecordInput;
}): Promise<void> {
  const base = normalizeKintoneDomain(params.domain);
  const res = await fetch(`${base}/k/v1/record.json`, {
    method: "PUT",
    headers: {
      "X-Cybozu-API-Token": params.apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: params.appId,
      id: params.recordId,
      record: params.record,
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kintone update record ${res.status}: ${text.slice(0, 500)}`);
  }
}

/** GET /k/v1/app/form/fields.json — アプリのフィールドコード一覧（環境変数の突合用） */
export async function fetchKintoneFormFields(params: {
  domain: string;
  appId: string | number;
  apiToken: string;
}): Promise<Record<string, unknown>> {
  const base = normalizeKintoneDomain(params.domain);
  const url = new URL(`${base}/k/v1/app/form/fields.json`);
  url.searchParams.set("app", String(params.appId));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Cybozu-API-Token": params.apiToken,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kintone form API ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** form/fields の properties を一覧用にフラット化 */
export function flattenKintoneFormFieldList(data: Record<string, unknown>): {
  code: string;
  type: string;
  label: string;
}[] {
  const props = data.properties;
  if (!props || typeof props !== "object") return [];
  const out: { code: string; type: string; label: string }[] = [];
  for (const [code, def] of Object.entries(props as Record<string, Record<string, unknown>>)) {
    const type = String(def?.type ?? "");
    const label = String(def?.label ?? "");
    out.push({ code, type, label });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** DATE / DATETIME の値から year_month 用オブジェクトへ */
export function kintoneDateToYearMonth(
  value: unknown
): { year: number; month: number } | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(s);
  if (m) {
    return { year: Number(m[1]), month: Number(m[2]) };
  }
  return null;
}

/** 数値フィールドの値 */
export function kintoneNumberValue(record: KintoneRecord, fieldCode: string): number | null {
  const cell = record[fieldCode];
  if (!cell || typeof cell !== "object" || !("value" in cell)) return null;
  const v = (cell as { value: unknown }).value;
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 文字列フィールドの値 */
export function kintoneStringValue(record: KintoneRecord, fieldCode: string): string {
  const cell = record[fieldCode];
  if (!cell || typeof cell !== "object" || !("value" in cell)) return "";
  const v = (cell as { value: unknown }).value;
  return v == null ? "" : String(v);
}
