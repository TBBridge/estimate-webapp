/**
 * テンプレート別セル割り当て（提供形態 × 契約形態）
 * キー: "deliveryType_contractType" または "cloud_new_annual" / "cloud_new_period"
 */

export type TemplateKey =
  | "onprem_new"
  | "onprem_license_add"
  | "onprem_option_add"
  | "subscription_new"
  | "cloud_new"
  | "cloud_license_add";

export type CellMapping = Record<string, string>;

export const TEMPLATE_CELLS: Record<TemplateKey, CellMapping> = {
  onprem_new: {
    agencyName: "C4",
    customerName: "C5",
    licenseCount: "C18",
    option1: "C21",
    option2: "C24",
    estimateDate: "C3",
  },
  onprem_license_add: {
    agencyName: "C4",
    customerName: "C5",
    existingLicenseCount: "C18",
    addedLicenseCount: "C21",
    existingMaintenanceStartYear: "C26",
    existingMaintenanceStartMonth: "C27",
    existingMaintenanceEndYear: "C28",
    existingMaintenanceEndMonth: "C29",
    orderPlannedYear: "C30",
    orderPlannedMonth: "C31",
    estimateDate: "C3",
  },
  onprem_option_add: {
    agencyName: "C4",
    customerName: "C5",
    option: "C18",
    optionLicenseCount: "C19",
    estimateDate: "C3",
  },
  subscription_new: {
    agencyName: "C4",
    customerName: "C5",
    licenseCount: "C18",
    option1: "C21",
    option2: "C24",
    estimateDate: "C3",
  },
  cloud_new: {
    agencyName: "C4",
    customerName: "C5",
    licenseCount: "C18",
    option1: "C21",
    option2: "C24",
    estimateDate: "C3",
  },
  cloud_license_add: {
    agencyName: "C4",
    customerName: "C5",
    existingLicenseCount: "C18",
    addedLicenseCount: "C21",
    existingMaintenanceStartYear: "C26",
    existingMaintenanceStartMonth: "C27",
    existingMaintenanceEndYear: "C28",
    existingMaintenanceEndMonth: "C29",
    orderPlannedYear: "C30",
    orderPlannedMonth: "C31",
    estimateDate: "C3",
  },
};

export function getTemplateKey(
  deliveryType: string,
  contractType: string,
  cloudBilling?: "annual" | "period"
): TemplateKey {
  if (deliveryType === "onprem") {
    if (contractType === "new") return "onprem_new";
    if (contractType === "license_add") return "onprem_license_add";
    if (contractType === "option_add") return "onprem_option_add";
  }
  if (deliveryType === "subscription" && contractType === "new") return "subscription_new";
  if (deliveryType === "cloud") {
    if (contractType === "new") return "cloud_new";
    if (contractType === "license_add") return "cloud_license_add";
  }
  return "onprem_new";
}
