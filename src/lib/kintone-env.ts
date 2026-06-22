/**
 * kintone ライセンス参照アプリ用の環境変数（アプリ ID は変更されうるため .env で指定）
 *
 * アプリ ID: KINTONE_APP_ID（推奨）または KINTONE_APP_LICENSE（後方互換、省略時 219）
 * API トークン: KINTONE_API_TOKEN（推奨）または KINTONE_API_TOKEN_APP219（後方互換）
 */

export type KintoneLicenseAppConfig = {
  domain: string;
  appId: string;
  apiToken: string;
};

export function getKintoneLicenseAppConfig(): KintoneLicenseAppConfig | null {
  const domain = process.env.KINTONE_DOMAIN?.trim() ?? "";
  const appId =
    process.env.KINTONE_APP_ID?.trim() ||
    process.env.KINTONE_APP_LICENSE?.trim() ||
    "219";
  const apiToken =
    process.env.KINTONE_API_TOKEN?.trim() ||
    process.env.KINTONE_API_TOKEN_APP219?.trim() ||
    "";
  if (!domain || !apiToken) return null;
  return { domain, appId, apiToken };
}

/**
 * オプション契約参照用フィールド設定（オプション追加時に kintone の現在契約を表示するため）
 *
 * 各オプション（OPTION_ITEMS のキー）について、kintone ライセンス管理アプリの
 * 「有無」フィールドと「ライセンス数」フィールドのフィールドコードを env で指定する。
 *   KINTONE_FIELD_OPTION_<ID 大文字>_PRESENCE  … 契約有無のフィールドコード
 *   KINTONE_FIELD_OPTION_<ID 大文字>_COUNT     … 契約ライセンス数のフィールドコード
 * 例: i_repo_edge_ocr → KINTONE_FIELD_OPTION_I_REPO_EDGE_OCR_PRESENCE / _COUNT
 * 未設定のオプションはスキップする（連携未設定は静かに無視する方針）。
 */
export type KintoneOptionFieldConfig = {
  /** OPTION_ITEMS のキー */
  optionKey: string;
  presenceField?: string;
  countField?: string;
};

export function getKintoneOptionFieldConfigs(
  optionEntries: { key: string; id: string }[]
): KintoneOptionFieldConfig[] {
  const configs: KintoneOptionFieldConfig[] = [];
  for (const { key, id } of optionEntries) {
    const base = `KINTONE_FIELD_OPTION_${id.toUpperCase()}`;
    const presenceField = process.env[`${base}_PRESENCE`]?.trim() || undefined;
    const countField = process.env[`${base}_COUNT`]?.trim() || undefined;
    if (presenceField || countField) {
      configs.push({ optionKey: key, presenceField, countField });
    }
  }
  return configs;
}

export function kintoneConfigErrorMessage(): string {
  return (
    "kintone が未設定です。KINTONE_DOMAIN と KINTONE_API_TOKEN（または KINTONE_API_TOKEN_APP219）、" +
    "必要に応じて KINTONE_APP_ID（アプリ番号）を環境変数に設定してください。"
  );
}

/** 営業案件管理アプリ（新規見積の承認時に upsert） */
export type KintoneSalesAppConfig = {
  domain: string;
  appId: string;
  apiToken: string;
};

/**
 * 営業案件管理アプリ用。KINTONE_SALES_APP_ID と KINTONE_SALES_API_TOKEN が揃っているときのみ有効。
 * ライセンス参照アプリとは別トークン（アプリ単位）を推奨。
 */
export function getKintoneSalesAppConfig(): KintoneSalesAppConfig | null {
  const domain = process.env.KINTONE_DOMAIN?.trim() ?? "";
  const appId = process.env.KINTONE_SALES_APP_ID?.trim() ?? "";
  const apiToken = process.env.KINTONE_SALES_API_TOKEN?.trim() ?? "";
  if (!domain || !appId || !apiToken) return null;
  return { domain, appId, apiToken };
}
