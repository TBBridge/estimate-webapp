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
