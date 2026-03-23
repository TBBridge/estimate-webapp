/**
 * モックデータ（API/DB 未接続の間の開発用）
 */

import type { DeliveryType, ContractType } from "./estimate-schema";

// ─────────────────────────────────────────────
// 代理店
// ─────────────────────────────────────────────
export type Agency = {
  id: string;
  name: string;
  email: string;
  loginPassword?: string;
  agencyType?: string;
  /** 代理店側担当者名（見積フォーム初期値用） */
  contactName?: string;
  department?: string;
  phoneCountryCode?: string;
  phoneLocal?: string;
  faxCountryCode?: string;
  faxLocal?: string;
  approverName: string;
  approverEmail: string;
  createdAt: string;
};

export const MOCK_AGENCIES: Agency[] = [
  { id: "ag-1", name: "株式会社アルファ", email: "alpha@example.com", approverName: "田中 太郎", approverEmail: "tanaka@alpha.example.com", createdAt: "2024-04-01" },
  { id: "ag-2", name: "ベータ商事", email: "beta@example.com", approverName: "鈴木 花子", approverEmail: "suzuki@beta.example.com", createdAt: "2024-05-15" },
  { id: "ag-3", name: "ガンマテック株式会社", email: "gamma@example.com", approverName: "佐藤 一郎", approverEmail: "sato@gamma.example.com", createdAt: "2024-06-01" },
  { id: "ag-4", name: "デルタソリューションズ", email: "delta@example.com", approverName: "山田 次郎", approverEmail: "yamada@delta.example.com", createdAt: "2024-07-20" },
  { id: "ag-5", name: "イプシロン情報", email: "epsilon@example.com", approverName: "中村 三郎", approverEmail: "nakamura@epsilon.example.com", createdAt: "2024-09-01" },
];

// ─────────────────────────────────────────────
// 見積（案件）
// ─────────────────────────────────────────────
export type EstimateStatus = "pending" | "approved" | "rejected";

export type Estimate = {
  id: string;
  no: string;
  agencyId: string;
  agencyName: string;
  customerName: string;
  deliveryType: DeliveryType;
  contractType: ContractType;
  cloudBilling?: string;
  amount: number;
  maintenanceFee: number;
  formInputs?: Record<string, unknown>;
  excelUrl?: string;
  pdfUrl?: string;
  status: EstimateStatus;
  createdAt: string;
  approvedAt?: string;
};

export const MOCK_ESTIMATES: Estimate[] = [
  { id: "es-001", no: "EST-2024-001", agencyId: "ag-1", agencyName: "株式会社アルファ", customerName: "富士山工業", deliveryType: "onprem", contractType: "new", amount: 1200000, maintenanceFee: 180000, status: "approved", createdAt: "2024-10-01", approvedAt: "2024-10-03" },
  { id: "es-002", no: "EST-2024-002", agencyId: "ag-2", agencyName: "ベータ商事", customerName: "桜花製作所", deliveryType: "subscription", contractType: "new", amount: 600000, maintenanceFee: 90000, status: "approved", createdAt: "2024-10-10", approvedAt: "2024-10-12" },
  { id: "es-003", no: "EST-2024-003", agencyId: "ag-1", agencyName: "株式会社アルファ", customerName: "富士山工業", deliveryType: "onprem", contractType: "license_add", amount: 300000, maintenanceFee: 45000, status: "pending", createdAt: "2024-11-05" },
  { id: "es-004", no: "EST-2024-004", agencyId: "ag-3", agencyName: "ガンマテック株式会社", customerName: "青空物流", deliveryType: "cloud", contractType: "new", amount: 800000, maintenanceFee: 120000, status: "approved", createdAt: "2024-11-15", approvedAt: "2024-11-17" },
  { id: "es-005", no: "EST-2024-005", agencyId: "ag-4", agencyName: "デルタソリューションズ", customerName: "東京商事", deliveryType: "onprem", contractType: "option_add", amount: 150000, maintenanceFee: 22500, status: "rejected", createdAt: "2024-11-20" },
  { id: "es-006", no: "EST-2024-006", agencyId: "ag-2", agencyName: "ベータ商事", customerName: "大阪電機", deliveryType: "cloud", contractType: "license_add", amount: 400000, maintenanceFee: 60000, status: "pending", createdAt: "2024-12-01" },
  { id: "es-007", no: "EST-2025-001", agencyId: "ag-5", agencyName: "イプシロン情報", customerName: "横浜港運", deliveryType: "subscription", contractType: "new", amount: 480000, maintenanceFee: 72000, status: "approved", createdAt: "2025-01-10", approvedAt: "2025-01-13" },
  { id: "es-008", no: "EST-2025-002", agencyId: "ag-1", agencyName: "株式会社アルファ", customerName: "千葉食品", deliveryType: "onprem", contractType: "new", amount: 1500000, maintenanceFee: 225000, status: "pending", createdAt: "2025-01-20" },
  { id: "es-009", no: "EST-2025-003", agencyId: "ag-3", agencyName: "ガンマテック株式会社", customerName: "名古屋精機", deliveryType: "cloud", contractType: "new", amount: 950000, maintenanceFee: 142500, status: "approved", createdAt: "2025-02-05", approvedAt: "2025-02-07" },
  { id: "es-010", no: "EST-2025-004", agencyId: "ag-4", agencyName: "デルタソリューションズ", customerName: "札幌建設", deliveryType: "onprem", contractType: "license_add", amount: 600000, maintenanceFee: 90000, status: "pending", createdAt: "2025-02-18" },
];

// ─────────────────────────────────────────────
// 製品一覧（仕切り率・単価のキー）
// ─────────────────────────────────────────────
/**
 * 製品マスタ
 * deliveryTypes: この製品で仕切り率を設定する提供形態の一覧
 * hasMaintenanceRate: 保守仕切り率を設定するか（onprem の永久ライセンスがある製品のみ true）
 * isOption: 見積フォームでオプション扱いかどうか
 */
export const PRODUCTS = [
  {
    id: "ireporter",     nameJa: "i-Reporter",
    isOption: false,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "webapi",        nameJa: "Web API Module Set (for external system coordination)",
    isOption: true,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "conmas_gw",     nameJa: "ConMas Gateway",
    isOption: true,
    deliveryTypes: ["onprem", "cloud"] as const,
    hasMaintenanceRate: false,
  },
  {
    id: "conmas_std",    nameJa: "ConMas IoT standard版",
    isOption: true,
    deliveryTypes: ["subscription", "cloud"] as const,
    hasMaintenanceRate: false,
  },
  {
    id: "conmas_pro",    nameJa: "ConMas IoT professional版",
    isOption: true,
    deliveryTypes: ["subscription", "cloud"] as const,
    hasMaintenanceRate: false,
  },
  {
    id: "conmas_map",    nameJa: "ConMas IoT MappingTOOL",
    isOption: true,
    deliveryTypes: ["subscription", "cloud"] as const,
    hasMaintenanceRate: false,
  },
  {
    id: "irepo_link",    nameJa: "i-Repo Link",
    isOption: true,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "irepo_edgeocr", nameJa: "i-Repo EdgeOCR",
    isOption: true,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "irepo_freedraw",nameJa: "i-Repo FreeDraw",
    isOption: true,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "irepo_workflow",nameJa: "i-Repo WorkFlow",
    isOption: true,
    deliveryTypes: ["onprem", "subscription", "cloud"] as const,
    hasMaintenanceRate: true,
  },
  {
    id: "irepo_scan",    nameJa: "i-Repo Scan",
    isOption: true,
    deliveryTypes: ["subscription"] as const,
    hasMaintenanceRate: false,
  },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

// ─────────────────────────────────────────────
// 仕切り率（本製品用）: 代理店 × 製品 × 提供形態
// ─────────────────────────────────────────────
export type MarginRate = {
  id: string;
  agencyId: string;
  agencyName: string;
  productId: ProductId;
  deliveryType: DeliveryType;
  rate: number; // 0〜1
};

// 代理店1社あたり全製品×製品ごとの提供形態のサンプルデータ
function makeMarginRows(
  agencyId: string,
  agencyName: string,
  baseRate: number,
  prefix: string,
): MarginRate[] {
  const rows: MarginRate[] = [];
  let seq = 1;
  for (const p of PRODUCTS) {
    for (const dt of p.deliveryTypes as readonly DeliveryType[]) {
      rows.push({ id: `${prefix}-${seq++}`, agencyId, agencyName, productId: p.id, deliveryType: dt, rate: baseRate });
    }
  }
  return rows;
}

export const MOCK_MARGIN_RATES: MarginRate[] = [
  ...makeMarginRows("ag-1", "株式会社アルファ",  0.70, "mr1"),
  ...makeMarginRows("ag-2", "ベータ商事",         0.65, "mr2"),
  ...makeMarginRows("ag-3", "ガンマテック株式会社",0.75, "mr3"),
  ...makeMarginRows("ag-4", "デルタソリューションズ",0.68,"mr4"),
  ...makeMarginRows("ag-5", "イプシロン情報",     0.72, "mr5"),
];

// ─────────────────────────────────────────────
// 保守料仕切り率
// ─────────────────────────────────────────────
export type MaintenanceRate = {
  id: string;
  agencyId: string;
  agencyName: string;
  productId: string;
  rate: number;
};

export const MOCK_MAINTENANCE_RATES: MaintenanceRate[] = [
  { id: "mtr-1", agencyId: "ag-1", agencyName: "株式会社アルファ", productId: "ireporter", rate: 0.70 },
  { id: "mtr-2", agencyId: "ag-2", agencyName: "ベータ商事", productId: "ireporter", rate: 0.65 },
  { id: "mtr-3", agencyId: "ag-3", agencyName: "ガンマテック株式会社", productId: "ireporter", rate: 0.75 },
  { id: "mtr-4", agencyId: "ag-4", agencyName: "デルタソリューションズ", productId: "ireporter", rate: 0.68 },
  { id: "mtr-5", agencyId: "ag-5", agencyName: "イプシロン情報", productId: "ireporter", rate: 0.72 },
];

// ─────────────────────────────────────────────
// 製品単価（ライセンス数ティア制）
// ─────────────────────────────────────────────
export type PriceTier = {
  minLicenses: number; // このティアが適用される最小ライセンス数
  price: number;       // 1ライセンスあたりの単価（円）
};

export type UnitPrice = {
  id: string;
  productId: ProductId;
  productName: string;
  deliveryType: DeliveryType;
  tiers: PriceTier[]; // minLicenses 昇順
};

// i-Reporter のライセンス数段階に対応したティア（オンプレ）
const IREPORTER_ONPREM_TIERS: PriceTier[] = [
  { minLicenses: 5,   price: 35000 },
  { minLicenses: 10,  price: 33000 },
  { minLicenses: 20,  price: 31000 },
  { minLicenses: 30,  price: 30000 },
  { minLicenses: 50,  price: 29000 },
  { minLicenses: 100, price: 28000 },
  { minLicenses: 200, price: 27000 },
  { minLicenses: 300, price: 26000 },
  { minLicenses: 500, price: 25000 },
];
const IREPORTER_SUBSCRIPTION_TIERS: PriceTier[] = [
  { minLicenses: 5,   price: 6000 },
  { minLicenses: 10,  price: 5500 },
  { minLicenses: 20,  price: 5200 },
  { minLicenses: 50,  price: 5000 },
  { minLicenses: 100, price: 4800 },
  { minLicenses: 200, price: 4500 },
  { minLicenses: 500, price: 4200 },
];
const IREPORTER_CLOUD_TIERS: PriceTier[] = [
  { minLicenses: 5,   price: 30000 },
  { minLicenses: 10,  price: 28000 },
  { minLicenses: 20,  price: 26000 },
  { minLicenses: 50,  price: 25000 },
  { minLicenses: 100, price: 24000 },
  { minLicenses: 200, price: 23000 },
  { minLicenses: 500, price: 22000 },
];

export const MOCK_UNIT_PRICES: UnitPrice[] = [
  { id: "up-1", productId: "ireporter",     productName: "i-Reporter",                deliveryType: "onprem",       tiers: IREPORTER_ONPREM_TIERS },
  { id: "up-2", productId: "ireporter",     productName: "i-Reporter",                deliveryType: "subscription", tiers: IREPORTER_SUBSCRIPTION_TIERS },
  { id: "up-3", productId: "ireporter",     productName: "i-Reporter",                deliveryType: "cloud",        tiers: IREPORTER_CLOUD_TIERS },
  { id: "up-4", productId: "webapi",        productName: "Web API",                   deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 50000 }] },
  { id: "up-5", productId: "conmas_std",    productName: "ConMas IoT standard版",     deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 80000 }] },
  { id: "up-6", productId: "conmas_pro",    productName: "ConMas IoT professional版", deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 120000 }] },
  { id: "up-7", productId: "conmas_map",    productName: "ConMas IoT MappingTOOL",    deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 60000 }] },
  { id: "up-8", productId: "irepo_link",    productName: "i-Repo Link",               deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 45000 }] },
  { id: "up-9", productId: "irepo_edgeocr", productName: "i-Repo EdgeOCR",           deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 90000 }] },
  { id: "up-10",productId: "irepo_freedraw",productName: "i-Repo FreeDraw",           deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 70000 }] },
  { id: "up-11",productId: "irepo_workflow",productName: "i-Repo WorkFlow",           deliveryType: "onprem",       tiers: [{ minLicenses: 1, price: 65000 }] },
];

// ─────────────────────────────────────────────
// テンプレートマスタ
// ─────────────────────────────────────────────
export type TemplateDef = {
  id: string;
  deliveryType: DeliveryType;
  contractType: ContractType;
  subType?: string;
  fileName: string;
  uploadedAt: string;
};

export const MOCK_TEMPLATES: TemplateDef[] = [
  { id: "tpl-1", deliveryType: "onprem", contractType: "new", fileName: "estimate_onprem_new.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-2", deliveryType: "onprem", contractType: "license_add", fileName: "estimate_onprem_license_add.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-3", deliveryType: "onprem", contractType: "option_add", fileName: "estimate_onprem_option_add.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-4", deliveryType: "subscription", contractType: "new", fileName: "estimate_subscription_new.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-5", deliveryType: "cloud", contractType: "new", subType: "annual", fileName: "estimate_cloud_new_annual.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-6", deliveryType: "cloud", contractType: "new", subType: "period", fileName: "estimate_cloud_new_period.xlsx", uploadedAt: "2024-04-01" },
  { id: "tpl-7", deliveryType: "cloud", contractType: "license_add", fileName: "estimate_cloud_license_add.xlsx", uploadedAt: "2024-04-01" },
];

// ─────────────────────────────────────────────
// ダッシュボード用集計ヘルパー
// ─────────────────────────────────────────────
export function getDashboardStats() {
  const total = MOCK_ESTIMATES.length;
  const approved = MOCK_ESTIMATES.filter((e) => e.status === "approved").length;
  const pending = MOCK_ESTIMATES.filter((e) => e.status === "pending").length;
  const totalAmount = MOCK_ESTIMATES.reduce((s, e) => s + e.amount + e.maintenanceFee, 0);

  // 代理店別
  const byAgency = MOCK_AGENCIES.map((ag) => {
    const rows = MOCK_ESTIMATES.filter((e) => e.agencyId === ag.id);
    return {
      name: ag.name.length > 8 ? ag.name.slice(0, 8) + "…" : ag.name,
      count: rows.length,
      amount: rows.reduce((s, e) => s + e.amount, 0),
    };
  }).filter((a) => a.count > 0);

  // 提供形態別
  const byDelivery = [
    { name: "オンプレ", count: MOCK_ESTIMATES.filter((e) => e.deliveryType === "onprem").length },
    { name: "サブスク", count: MOCK_ESTIMATES.filter((e) => e.deliveryType === "subscription").length },
    { name: "クラウド", count: MOCK_ESTIMATES.filter((e) => e.deliveryType === "cloud").length },
  ];

  // 契約形態別
  const byContract = [
    { name: "新規", count: MOCK_ESTIMATES.filter((e) => e.contractType === "new").length },
    { name: "ライセンス追加", count: MOCK_ESTIMATES.filter((e) => e.contractType === "license_add").length },
    { name: "オプション追加", count: MOCK_ESTIMATES.filter((e) => e.contractType === "option_add").length },
  ];

  // 月次推移（過去6ヶ月）
  const monthly = ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"].map((ym) => {
    const rows = MOCK_ESTIMATES.filter((e) => e.createdAt.startsWith(ym));
    return {
      month: ym.replace("-", "/"),
      count: rows.length,
      amount: rows.reduce((s, e) => s + e.amount, 0),
    };
  });

  return { total, approved, pending, totalAmount, byAgency, byDelivery, byContract, monthly };
}

// ─────────────────────────────────────────────
// 設定
// ─────────────────────────────────────────────
export type NotificationChannel = "teams" | "slack" | "gmail";

export type AppSettings = {
  notificationChannel: NotificationChannel;
  notificationTarget: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  notificationChannel: "slack",
  notificationTarget: "#approval-requests",
};
