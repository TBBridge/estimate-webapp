export type Role = "admin" | "agency" | "approver";

export const ROLES: Record<Role, { labelJa: string; labelEn: string }> = {
  admin: { labelJa: "自社管理者", labelEn: "Admin" },
  agency: { labelJa: "代理店", labelEn: "Agency" },
  approver: { labelJa: "承認者", labelEn: "Approver" },
};

export const DELIVERY_TYPES = [
  { value: "onprem", labelJa: "オンプレミス", labelEn: "On-premise" },
  { value: "subscription", labelJa: "サブスクリプション", labelEn: "Subscription" },
  { value: "cloud", labelJa: "クラウド", labelEn: "Cloud" },
] as const;

export const CONTRACT_TYPES = [
  { value: "new", labelJa: "新規", labelEn: "New" },
  { value: "license_add", labelJa: "ライセンス追加", labelEn: "License addition" },
  { value: "option_add", labelJa: "オプション追加", labelEn: "Option addition" },
] as const;

/** kintone アプリ ID（要件仕様書 11.1） */
export const KINTONE_APP_IDS = {
  salesCase: 127,
  license: 166,
} as const;
