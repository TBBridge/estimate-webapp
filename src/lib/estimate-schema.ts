/**
 * 提供形態×契約形態ごとの入力項目定義
 * Web アプリ画面には計算式・内訳は表示しない
 */

export type DeliveryType = "onprem" | "subscription" | "cloud";
export type ContractType = "new" | "license_add" | "option_add";

/** i-Reporter ライセンス数で選択可能な値 */
export const ALLOWED_I_REPORTER_LICENSE_COUNTS = [
  5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  150, 200, 250, 300, 350, 400, 450, 500,
] as const;

/** オプション有無で選べる項目（オンプレ・サブスク・クラウドで一部異なる） */
export const OPTION_ITEMS = {
  webApi: { id: "web_api", labelJa: "Web API", labelEn: "Web API" },
  conmasIoTStandard: { id: "conmas_iot_standard", labelJa: "ConMas IoT standard版", labelEn: "ConMas IoT standard" },
  conmasIoTProfessional: { id: "conmas_iot_professional", labelJa: "ConMas IoT professional版", labelEn: "ConMas IoT professional" },
  conmasIoTMappingTool: { id: "conmas_iot_mapping_tool", labelJa: "ConMas IoT MappingTOOL", labelEn: "ConMas IoT MappingTOOL" },
  iRepoLink: { id: "i_repo_link", labelJa: "i-Repo Link", labelEn: "i-Repo Link" },
  iRepoEdgeOCR: { id: "i_repo_edge_ocr", labelJa: "i-Repo EdgeOCR", labelEn: "i-Repo EdgeOCR", hasLicenseCount: true },
  iRepoFreeDraw: { id: "i_repo_free_draw", labelJa: "i-Repo FreeDraw", labelEn: "i-Repo FreeDraw", hasLicenseCount: true },
  iRepoWorkFlow: { id: "i_repo_workflow", labelJa: "i-Repo WorkFlow", labelEn: "i-Repo WorkFlow", hasLicenseCount: true },
} as const;

/** 契約形態の選択肢（提供形態によって表示するものを制限） */
export function getContractTypesForDelivery(deliveryType: DeliveryType): { value: ContractType; labelJa: string; labelEn: string }[] {
  const all: { value: ContractType; labelJa: string; labelEn: string }[] = [
    { value: "new", labelJa: "新規", labelEn: "New" },
    { value: "license_add", labelJa: "ライセンス追加", labelEn: "License addition" },
    { value: "option_add", labelJa: "オプション追加", labelEn: "Option addition" },
  ];
  if (deliveryType === "onprem") return all;
  if (deliveryType === "subscription") return [{ value: "new", labelJa: "新規", labelEn: "New" }];
  if (deliveryType === "cloud") return [{ value: "new", labelJa: "新規", labelEn: "New" }, { value: "license_add", labelJa: "ライセンス追加", labelEn: "License addition" }];
  return all;
}

/** クラウド新規の場合の課金種別 */
export const CLOUD_NEW_BILLING = [
  { value: "annual", labelJa: "年額", labelEn: "Annual" },
  { value: "period", labelJa: "区切り", labelEn: "Period" },
] as const;

export type FormFieldKind =
  | "text"
  | "number"
  | "year_month"
  | "year_month_pair"
  | "options_check"
  | "option_license_counts";

export interface FormFieldDef {
  id: string;
  labelJa: string;
  labelEn: string;
  kind: FormFieldKind;
  /** オプション系の場合、OPTION_ITEMS のキーまたはキー配列 */
  optionIds?: (keyof typeof OPTION_ITEMS)[];
  required?: boolean;
}

/** 共通：顧客情報（全パターンで先に入力） */
export const CUSTOMER_FIELDS: FormFieldDef[] = [
  { id: "customerName", labelJa: "顧客名", labelEn: "Customer name", kind: "text", required: true },
  { id: "customerAddress", labelJa: "住所", labelEn: "Address", kind: "text", required: false },
];

/** オンプレ 新規 */
export const ONPREM_NEW_FIELDS: FormFieldDef[] = [
  { id: "licenseCount", labelJa: "i-Reporter ライセンス数", labelEn: "i-Reporter license count", kind: "number", required: true },
  {
    id: "options",
    labelJa: "オプション有無",
    labelEn: "Options",
    kind: "options_check",
    optionIds: ["webApi", "conmasIoTStandard", "conmasIoTProfessional", "conmasIoTMappingTool", "iRepoLink"],
    required: false,
  },
];

/** オンプレ ライセンス追加 */
export const ONPREM_LICENSE_ADD_FIELDS: FormFieldDef[] = [
  { id: "existingLicenseCount", labelJa: "既存ライセンス数", labelEn: "Existing license count", kind: "number", required: true },
  { id: "addedLicenseCount", labelJa: "追加後ライセンス数", labelEn: "License count after addition", kind: "number", required: true },
  { id: "existingMaintenanceStart", labelJa: "既存保守開始年月", labelEn: "Existing maintenance start (Y/M)", kind: "year_month", required: true },
  { id: "existingMaintenanceEnd", labelJa: "既存保守終了年月", labelEn: "Existing maintenance end (Y/M)", kind: "year_month", required: true },
  { id: "orderPlanned", labelJa: "発注予定年月", labelEn: "Planned order (Y/M)", kind: "year_month", required: true },
];

/** オンプレ オプション追加 */
export const ONPREM_OPTION_ADD_FIELDS: FormFieldDef[] = [
  {
    id: "options",
    labelJa: "オプション有無",
    labelEn: "Options",
    kind: "options_check",
    optionIds: [
      "webApi",
      "conmasIoTStandard",
      "conmasIoTProfessional",
      "conmasIoTMappingTool",
      "iRepoLink",
      "iRepoEdgeOCR",
      "iRepoFreeDraw",
      "iRepoWorkFlow",
    ],
    required: false,
  },
  {
    id: "optionLicenseCounts",
    labelJa: "オプション別ライセンス数",
    labelEn: "License count per option",
    kind: "option_license_counts",
    optionIds: ["iRepoEdgeOCR", "iRepoFreeDraw", "iRepoWorkFlow"],
    required: false,
  },
  { id: "existingMaintenanceStart", labelJa: "既存保守開始年月", labelEn: "Existing maintenance start (Y/M)", kind: "year_month", required: true },
  { id: "existingMaintenanceEnd", labelJa: "既存保守終了年月", labelEn: "Existing maintenance end (Y/M)", kind: "year_month", required: true },
  { id: "orderPlanned", labelJa: "発注予定年月", labelEn: "Planned order (Y/M)", kind: "year_month", required: true },
];

/** サブスク 新規 */
export const SUBSCRIPTION_NEW_FIELDS: FormFieldDef[] = [
  { id: "licenseCount", labelJa: "ライセンス数", labelEn: "License count", kind: "number", required: true },
  { id: "contractMonths", labelJa: "契約月数", labelEn: "Contract months", kind: "number", required: true },
  {
    id: "options",
    labelJa: "オプション有無",
    labelEn: "Options",
    kind: "options_check",
    optionIds: ["webApi", "conmasIoTStandard", "conmasIoTProfessional", "conmasIoTMappingTool", "iRepoLink"],
    required: false,
  },
];

/** クラウド 新規（年額・区切り共通） */
export const CLOUD_NEW_FIELDS: FormFieldDef[] = [
  { id: "licenseCount", labelJa: "i-Reporter ライセンス数", labelEn: "i-Reporter license count", kind: "number", required: true },
  {
    id: "options",
    labelJa: "オプション有無",
    labelEn: "Options",
    kind: "options_check",
    optionIds: ["webApi", "conmasIoTStandard", "conmasIoTProfessional", "conmasIoTMappingTool"],
    required: false,
  },
];

/** クラウド 追加（ライセンスのみ） */
export const CLOUD_LICENSE_ADD_FIELDS: FormFieldDef[] = [
  { id: "existingLicenseCount", labelJa: "既存ライセンス数", labelEn: "Existing license count", kind: "number", required: true },
  { id: "addedLicenseCount", labelJa: "追加後ライセンス数", labelEn: "License count after addition", kind: "number", required: true },
  { id: "existingMaintenanceStart", labelJa: "既存保守開始年月", labelEn: "Existing maintenance start (Y/M)", kind: "year_month", required: true },
  { id: "existingMaintenanceEnd", labelJa: "既存保守終了年月", labelEn: "Existing maintenance end (Y/M)", kind: "year_month", required: true },
  { id: "orderPlanned", labelJa: "発注予定年月", labelEn: "Planned order (Y/M)", kind: "year_month", required: true },
];

export function getFormFields(
  deliveryType: DeliveryType,
  contractType: ContractType
): FormFieldDef[] {
  if (deliveryType === "onprem") {
    if (contractType === "new") return ONPREM_NEW_FIELDS;
    if (contractType === "license_add") return ONPREM_LICENSE_ADD_FIELDS;
    if (contractType === "option_add") return ONPREM_OPTION_ADD_FIELDS;
  }
  if (deliveryType === "subscription" && contractType === "new") return SUBSCRIPTION_NEW_FIELDS;
  if (deliveryType === "cloud") {
    if (contractType === "new") return CLOUD_NEW_FIELDS;
    if (contractType === "license_add") return CLOUD_LICENSE_ADD_FIELDS;
  }
  return [];
}

/** クラウド新規で「年額/区切り」を選ぶ必要があるか */
export function needsCloudBillingChoice(deliveryType: DeliveryType, contractType: ContractType): boolean {
  return deliveryType === "cloud" && contractType === "new";
}
