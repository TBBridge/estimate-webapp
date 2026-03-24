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
