/**
 * 見積申請の formInputs を、estimate-schema のラベル付きで一覧表示用に整形する（管理者・承認者モーダル用）
 */
import { t, type Locale } from "@/lib/translations";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "@/lib/phone-codes";
import {
  APPLICATION_DETAIL_EXTRA_FIELDS,
  CLOUD_NEW_BILLING,
  END_USER_COMPANY_FIELDS,
  SALES_AGENCY_CONTACT_FIELDS,
  getFormFields,
  needsCloudBillingChoice,
  OPTION_ITEMS,
  type ContractType,
  type DeliveryType,
  type FormFieldDef,
} from "@/lib/estimate-schema";
import { CONTRACT_TYPES, DELIVERY_TYPES } from "@/lib/constants";

export type EstimateFormDisplaySection = {
  title: string;
  rows: { label: string; value: string }[];
};

function fieldLabel(f: FormFieldDef, locale: Locale): string {
  return locale === "en" ? f.labelEn : f.labelJa;
}

function deliveryLabel(locale: Locale, v: string): string {
  const d = DELIVERY_TYPES.find((x) => x.value === v);
  if (!d) return v;
  return locale === "en" ? d.labelEn : d.labelJa;
}

function contractLabel(locale: Locale, v: string): string {
  const c = CONTRACT_TYPES.find((x) => x.value === v);
  if (!c) return v;
  return locale === "en" ? c.labelEn : c.labelJa;
}

function cloudBillingLabel(locale: Locale, v: string): string {
  const b = CLOUD_NEW_BILLING.find((x) => x.value === v);
  if (!b) return v;
  return locale === "en" ? b.labelEn : b.labelJa;
}

function formatYearMonth(v: unknown, locale: Locale): string {
  const o = v as { year?: number; month?: number } | null | undefined;
  if (!o || (o.year == null && o.month == null)) return locale === "en" ? "—" : "—";
  if (o.year != null && o.month != null) {
    return locale === "en" ? `${o.year}-${String(o.month).padStart(2, "0")}` : `${o.year}年${o.month}月`;
  }
  return String(v);
}

function formatOptionsCheck(f: FormFieldDef, v: unknown, locale: Locale): string {
  const data = (v as Record<string, boolean>) ?? {};
  const hasOptions = data.hasOptions === true;
  if (!hasOptions) return locale === "en" ? "None" : "無";
  const optionIds = f.optionIds ?? [];
  const names = optionIds
    .filter((k) => data[k] === true)
    .map((k) => {
      const opt = OPTION_ITEMS[k];
      return opt ? (locale === "en" ? opt.labelEn : opt.labelJa) : String(k);
    });
  if (names.length === 0) return locale === "en" ? "Yes (no option selected)" : "有（オプション未選択）";
  return names.join(locale === "en" ? "; " : "、");
}

function formatOptionLicenseCounts(f: FormFieldDef, v: unknown, locale: Locale): string {
  const counts = (v as Record<string, number | undefined>) ?? {};
  const lines: string[] = [];
  for (const key of f.optionIds ?? []) {
    const opt = OPTION_ITEMS[key];
    if (!opt || !("hasLicenseCount" in opt)) continue;
    const c = counts[key];
    if (c != null && c !== ("" as unknown)) {
      const name = locale === "en" ? opt.labelEn : opt.labelJa;
      lines.push(`${name}: ${c}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "—";
}

function formatRadio(f: FormFieldDef, v: unknown, locale: Locale): string {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  const opt = f.radioOptions?.find((o) => o.value === s);
  if (opt) return locale === "en" ? opt.labelEn : opt.labelJa;
  return s;
}

function formatPhoneCountry(f: FormFieldDef, values: Record<string, unknown>, locale: Locale): string {
  if (f.kind !== "phone_country" || !f.dialField || !f.localField) return "—";
  const dial = String(values[f.dialField] ?? DEFAULT_DIAL_CODE);
  const local = String(values[f.localField] ?? "").trim();
  const code = COUNTRY_DIAL_CODES.find((c) => c.value === dial);
  const dialLabel = code ? (locale === "en" ? code.labelEn : code.labelJa) : dial;
  if (!local) return dialLabel || "—";
  return `${dialLabel} ${local}`;
}

function rowForField(f: FormFieldDef, values: Record<string, unknown>, locale: Locale): { label: string; value: string } {
  if (f.kind === "phone_country") {
    return { label: fieldLabel(f, locale), value: formatPhoneCountry(f, values, locale) };
  }
  if (f.kind === "options_check") {
    return { label: fieldLabel(f, locale), value: formatOptionsCheck(f, values[f.id], locale) };
  }
  if (f.kind === "option_license_counts") {
    return { label: fieldLabel(f, locale), value: formatOptionLicenseCounts(f, values[f.id], locale) };
  }
  if (f.kind === "year_month") {
    const raw = values[f.id];
    return { label: fieldLabel(f, locale), value: formatYearMonth(raw, locale) };
  }
  if (f.kind === "radio") {
    return { label: fieldLabel(f, locale), value: formatRadio(f, values[f.id], locale) };
  }

  const raw = values[f.id];
  if (f.kind === "number") {
    if (raw === undefined || raw === null || raw === "") {
      return { label: fieldLabel(f, locale), value: "—" };
    }
    return { label: fieldLabel(f, locale), value: String(raw) };
  }
  if (f.kind === "textarea" || f.kind === "text" || f.kind === "email") {
    const s = String(raw ?? "").trim();
    return { label: fieldLabel(f, locale), value: s || "—" };
  }

  const s = raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  return { label: fieldLabel(f, locale), value: s.trim() || "—" };
}

function collectKeysFromFields(fields: FormFieldDef[]): Set<string> {
  const s = new Set<string>();
  for (const f of fields) {
    s.add(f.id);
    if (f.kind === "phone_country" && f.dialField && f.localField) {
      s.add(f.dialField);
      s.add(f.localField);
    }
  }
  return s;
}

function sectionFromFields(
  title: string,
  fields: FormFieldDef[],
  values: Record<string, unknown>,
  locale: Locale
): EstimateFormDisplaySection {
  return {
    title,
    rows: fields.map((f) => rowForField(f, values, locale)),
  };
}

export type EstimateLikeForDisplay = {
  agencyName: string;
  customerName: string;
  deliveryType: DeliveryType;
  contractType: ContractType;
  cloudBilling?: string;
  amount: number;
  maintenanceFee: number;
  createdAt: string;
  approvedAt?: string;
  formInputs?: Record<string, unknown>;
};

/**
 * 管理者・承認者向け: 基本情報＋申請フォームの全項目をセクション化
 */
export function buildEstimateApplicationSections(
  e: EstimateLikeForDisplay,
  locale: Locale
): EstimateFormDisplaySection[] {
  const titles = {
    meta: t(locale, "admin.estimates.sectionMeta"),
    endUser: t(locale, "admin.estimates.sectionEndUser"),
    estimateContent: t(locale, "admin.estimates.sectionEstimateContent"),
    salesAgency: t(locale, "admin.estimates.sectionSalesAgency"),
    applicationExtra: t(locale, "admin.estimates.sectionApplicationExtra"),
    other: t(locale, "admin.estimates.sectionOther"),
    noSavedInputs: t(locale, "admin.estimates.sectionNoSavedForm"),
  };

  const values = (e.formInputs ?? {}) as Record<string, unknown>;
  const dash = "—";

  const metaRows: { label: string; value: string }[] = [
    { label: locale === "en" ? "Agency" : "代理店", value: e.agencyName || dash },
    { label: locale === "en" ? "Customer (saved name)" : "顧客名（保存値）", value: e.customerName || dash },
    { label: locale === "en" ? "Delivery type" : "提供形態", value: deliveryLabel(locale, e.deliveryType) },
    { label: locale === "en" ? "Contract type" : "契約形態", value: contractLabel(locale, e.contractType) },
  ];
  if (needsCloudBillingChoice(e.deliveryType, e.contractType) && e.cloudBilling) {
    metaRows.push({
      label: locale === "en" ? "Cloud billing" : "クラウド課金種別",
      value: cloudBillingLabel(locale, e.cloudBilling),
    });
  }
  metaRows.push(
    { label: locale === "en" ? "Estimate amount (JPY)" : "見積額（円）", value: String(e.amount ?? 0) },
    {
      label: locale === "en" ? "Maintenance fee (JPY)" : "保守料等（円）",
      value: String(e.maintenanceFee ?? 0),
    },
    { label: locale === "en" ? "Submitted" : "申請日", value: e.createdAt || dash },
    { label: locale === "en" ? "Approved" : "承認日", value: e.approvedAt?.trim() ? e.approvedAt : dash }
  );

  const sections: EstimateFormDisplaySection[] = [{ title: titles.meta, rows: metaRows }];

  if (Object.keys(values).length === 0) {
    sections.push({
      title: titles.noSavedInputs,
      rows: [{ label: "", value: t(locale, "admin.estimates.noSavedFormHint") }],
    });
    return sections;
  }

  const allFieldGroups: FormFieldDef[][] = [
    END_USER_COMPANY_FIELDS,
    getFormFields(e.deliveryType, e.contractType),
    SALES_AGENCY_CONTACT_FIELDS,
    APPLICATION_DETAIL_EXTRA_FIELDS,
  ];

  sections.push(sectionFromFields(titles.endUser, END_USER_COMPANY_FIELDS, values, locale));

  const dynamicFields = getFormFields(e.deliveryType, e.contractType);
  if (dynamicFields.length > 0) {
    sections.push(sectionFromFields(titles.estimateContent, dynamicFields, values, locale));
  }

  sections.push(sectionFromFields(titles.salesAgency, SALES_AGENCY_CONTACT_FIELDS, values, locale));
  sections.push(sectionFromFields(titles.applicationExtra, APPLICATION_DETAIL_EXTRA_FIELDS, values, locale));

  const consumed = new Set<string>();
  for (const group of allFieldGroups) {
    for (const k of collectKeysFromFields(group)) consumed.add(k);
  }

  const extraKeys = Object.keys(values).filter((k) => !consumed.has(k));
  if (extraKeys.length > 0) {
    sections.push({
      title: titles.other,
      rows: extraKeys.sort().map((k) => ({
        label: k,
        value:
          typeof values[k] === "object"
            ? JSON.stringify(values[k])
            : String(values[k] ?? ""),
      })),
    });
  }

  return sections;
}
