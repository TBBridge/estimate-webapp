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
  webApi: { id: "web_api", labelJa: "Web API Module Set (for external system coordination)", labelEn: "Web API Module Set (for external system coordination)" },
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
  | "option_license_counts"
  | "textarea"
  | "radio"
  | "email"
  | "phone_country";

export interface RadioOptionDef {
  value: string;
  labelJa: string;
  labelEn: string;
}

export interface FormFieldDef {
  id: string;
  labelJa: string;
  labelEn: string;
  kind: FormFieldKind;
  /** オプション系の場合、OPTION_ITEMS のキーまたはキー配列 */
  optionIds?: (keyof typeof OPTION_ITEMS)[];
  required?: boolean;
  /** textarea の行数 */
  rows?: number;
  /** kind === "radio" のとき */
  radioOptions?: RadioOptionDef[];
  /** kind === "phone_country" のとき（values のキー） */
  dialField?: string;
  localField?: string;
}

/** ユーザー会社名・提供先（エンドユーザー）情報 */
export const END_USER_COMPANY_FIELDS: FormFieldDef[] = [
  { id: "userCompanyNameZh", labelJa: "会社名（中国語名）", labelEn: "Company name (Chinese)", kind: "text", required: false },
  { id: "userCompanyNameJa", labelJa: "会社名（日本語名）", labelEn: "Company name (Japanese)", kind: "text", required: true },
  { id: "userCompanyNameReading", labelJa: "会社名（略称のよみがな）", labelEn: "Company name (abbreviation reading)", kind: "text", required: false },
  { id: "userContactLastName", labelJa: "担当者氏名（姓）", labelEn: "Contact last name", kind: "text", required: false },
  { id: "userContactFirstName", labelJa: "担当者氏名（名）", labelEn: "Contact first name", kind: "text", required: false },
  { id: "userDepartment", labelJa: "部署名", labelEn: "Department", kind: "text", required: false },
  { id: "userAddress", labelJa: "住所", labelEn: "Address", kind: "text", required: false },
  { id: "userEmail", labelJa: "メールアドレス", labelEn: "Email address", kind: "email", required: false },
  {
    id: "userPhone",
    labelJa: "電話番号",
    labelEn: "Phone number",
    kind: "phone_country",
    dialField: "userPhoneDial",
    localField: "userPhoneLocal",
    required: false,
  },
  {
    id: "userFax",
    labelJa: "FAX番号",
    labelEn: "FAX number",
    kind: "phone_country",
    dialField: "userFaxDial",
    localField: "userFaxLocal",
    required: false,
  },
  {
    id: "userReleaseSubscription",
    labelJa: "リリース配信登録（ユーザー）",
    labelEn: "Release notification registration (end user)",
    kind: "radio",
    required: true,
    radioOptions: [
      { value: "yes", labelJa: "する", labelEn: "Yes" },
      { value: "no", labelJa: "しない", labelEn: "No" },
    ],
  },
  {
    id: "userReleaseLanguage",
    labelJa: "リリース案内言語（ユーザー）",
    labelEn: "Release notice language (end user)",
    kind: "radio",
    required: true,
    radioOptions: [
      { value: "zh", labelJa: "中国語", labelEn: "Chinese" },
      { value: "ja", labelJa: "日本語", labelEn: "Japanese" },
      { value: "en", labelJa: "英語", labelEn: "English" },
    ],
  },
];

/** 販売代理店情報（申請書面上の連絡先） */
export const SALES_AGENCY_CONTACT_FIELDS: FormFieldDef[] = [
  { id: "salesAgencyName", labelJa: "代理店名", labelEn: "Agency name", kind: "text", required: false },
  { id: "salesAgencyContactName", labelJa: "担当者氏名", labelEn: "Contact person name", kind: "text", required: false },
  { id: "salesAgencyDepartment", labelJa: "部署名", labelEn: "Department", kind: "text", required: false },
  { id: "salesAgencyEmail", labelJa: "メールアドレス", labelEn: "Email address", kind: "email", required: false },
  {
    id: "salesAgencyPhone",
    labelJa: "電話番号",
    labelEn: "Phone number",
    kind: "phone_country",
    dialField: "salesAgencyPhoneDial",
    localField: "salesAgencyPhoneLocal",
    required: false,
  },
  {
    id: "salesAgencyFax",
    labelJa: "FAX番号",
    labelEn: "FAX number",
    kind: "phone_country",
    dialField: "salesAgencyFaxDial",
    localField: "salesAgencyFaxLocal",
    required: false,
  },
  {
    id: "salesReleaseSubscription",
    labelJa: "リリース配信登録（代理店）",
    labelEn: "Release notification registration (agency)",
    kind: "radio",
    required: true,
    radioOptions: [
      { value: "yes", labelJa: "する", labelEn: "Yes" },
      { value: "no", labelJa: "しない", labelEn: "No" },
    ],
  },
  {
    id: "salesReleaseLanguage",
    labelJa: "リリース案内言語（代理店）",
    labelEn: "Release notice language (agency)",
    kind: "radio",
    required: true,
    radioOptions: [
      { value: "zh", labelJa: "中国語", labelEn: "Chinese" },
      { value: "ja", labelJa: "日本語", labelEn: "Japanese" },
      { value: "en", labelJa: "英語", labelEn: "English" },
    ],
  },
];

/** お申込内容の追加項目（用途・備考など） */
export const APPLICATION_DETAIL_EXTRA_FIELDS: FormFieldDef[] = [
  {
    id: "osType",
    labelJa: "OS",
    labelEn: "OS",
    kind: "radio",
    required: false,
    radioOptions: [
      { value: "ios", labelJa: "iOS", labelEn: "iOS" },
      { value: "windows", labelJa: "Windows", labelEn: "Windows" },
      { value: "both", labelJa: "両方", labelEn: "Both" },
    ],
  },
  {
    id: "externalSystemApi",
    labelJa: "外部システム連携API",
    labelEn: "External system integration API",
    kind: "radio",
    required: false,
    radioOptions: [
      { value: "yes", labelJa: "あり", labelEn: "Yes" },
      { value: "no", labelJa: "なし", labelEn: "No" },
    ],
  },
  { id: "applicationPurpose", labelJa: "用途", labelEn: "Purpose of use", kind: "textarea", rows: 3, required: false },
  { id: "applicationIndustry", labelJa: "業種", labelEn: "Industry", kind: "text", required: false },
  { id: "applicationRemarks", labelJa: "備考", labelEn: "Remarks", kind: "textarea", rows: 3, required: false },
];

/** 一覧・Excel「For:」用の顧客表示名（日本語名 → 中国語名 → 旧フィールド） */
export function resolveCustomerDisplayName(formInputs: Record<string, unknown>): string {
  const ja = String(formInputs.userCompanyNameJa ?? "").trim();
  const zh = String(formInputs.userCompanyNameZh ?? "").trim();
  const legacy = String(formInputs.customerName ?? "").trim();
  return ja || zh || legacy;
}

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
