"use client";

import { useState, useEffect, useRef } from "react";
import { DELIVERY_TYPES } from "@/lib/constants";
import { useLocale } from "@/lib/locale-context";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/translations";
import {
  getContractTypesForDelivery,
  getFormFields,
  CLOUD_NEW_BILLING,
  END_USER_COMPANY_FIELDS,
  SALES_AGENCY_CONTACT_FIELDS,
  APPLICATION_DETAIL_EXTRA_FIELDS,
  OPTION_ITEMS,
  ALLOWED_I_REPORTER_LICENSE_COUNTS,
  resolveCustomerDisplayName,
  SALES_AGENCY_PRESERVED_KEYS,
  type DeliveryType,
  type ContractType,
} from "@/lib/estimate-schema";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "@/lib/phone-codes";
import { isValidEmail } from "@/lib/validation";

type FormValues = Record<string, unknown>;
type SubmitState = "idle" | "submitting" | "done" | "error";
type KintoneLookupState = "idle" | "loading";

const KINTONE_LOOKUP_DEBOUNCE_MS = 600;

export default function EstimateCreateForm() {
  const { locale } = useLocale();
  const { user } = useAuth();
  const isEn = locale === "en";
  const [deliveryType, setDeliveryType] = useState<DeliveryType | "">("");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [cloudBilling, setCloudBilling] = useState<"annual" | "period" | "">("");
  const [values, setValues] = useState<FormValues>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [resultNo, setResultNo] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [kintoneLookupState, setKintoneLookupState] = useState<KintoneLookupState>("idle");
  const [kintoneMsg, setKintoneMsg] = useState<string>("");
  const [kintoneMsgIsError, setKintoneMsgIsError] = useState(false);
  const kintoneSeqRef = useRef(0);

  const contractOptions = deliveryType ? getContractTypesForDelivery(deliveryType as DeliveryType) : [];
  const showCloudBilling = deliveryType === "cloud" && contractType === "new";
  const formFields = deliveryType && contractType
    ? getFormFields(deliveryType as DeliveryType, contractType as ContractType)
    : [];

  const showMainForm = Boolean(
    deliveryType &&
    contractType &&
    (!showCloudBilling || cloudBilling)
  );

  const showKintoneLookup =
    showMainForm &&
    (contractType === "license_add" || contractType === "option_add") &&
    (deliveryType === "onprem" || deliveryType === "cloud");

  /** 代理店ログイン時：マスタから販売代理店欄を初期入力（編集可能） */
  useEffect(() => {
    if (!showMainForm || user?.role !== "agency" || !user?.agencyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agencies/${user.agencyId}`);
        if (!res.ok || cancelled) return;
        const ag = (await res.json()) as {
          name?: string;
          contactName?: string;
          department?: string;
          email?: string;
          phoneCountryCode?: string;
          phoneLocal?: string;
          faxCountryCode?: string;
          faxLocal?: string;
        };
        setValues((prev) => {
          const next = { ...prev };
          if (prev.salesAgencyName === undefined) next.salesAgencyName = ag.name ?? "";
          if (prev.salesAgencyContactName === undefined) next.salesAgencyContactName = ag.contactName ?? "";
          if (prev.salesAgencyDepartment === undefined) next.salesAgencyDepartment = ag.department ?? "";
          if (prev.salesAgencyEmail === undefined) next.salesAgencyEmail = ag.email ?? "";
          if (prev.salesAgencyPhoneDial === undefined) next.salesAgencyPhoneDial = ag.phoneCountryCode ?? DEFAULT_DIAL_CODE;
          if (prev.salesAgencyPhoneLocal === undefined) next.salesAgencyPhoneLocal = ag.phoneLocal ?? "";
          if (prev.salesAgencyFaxDial === undefined) next.salesAgencyFaxDial = ag.faxCountryCode ?? DEFAULT_DIAL_CODE;
          if (prev.salesAgencyFaxLocal === undefined) next.salesAgencyFaxLocal = ag.faxLocal ?? "";
          return next;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMainForm, user?.agencyId, user?.role]);

  /** 会社名入力に連動して kintone を検索（ライセンス追加・オプション追加時） */
  useEffect(() => {
    if (!showKintoneLookup || user?.role !== "agency" || !user?.agencyId) {
      setKintoneMsg("");
      setKintoneMsgIsError(false);
      setKintoneLookupState("idle");
      return;
    }

    const nameJa = String(values.userCompanyNameJa ?? "").trim();
    const nameZh = String(values.userCompanyNameZh ?? "").trim();
    const customerSearch = nameJa || nameZh;

    if (!customerSearch) {
      setKintoneMsg("");
      setKintoneMsgIsError(false);
      setKintoneLookupState("idle");
      setValues((prev) => {
        const next = { ...prev };
        delete next.existingLicenseCount;
        delete next.existingMaintenanceStart;
        delete next.existingMaintenanceEnd;
        return next;
      });
      return;
    }

    const timer = window.setTimeout(() => {
      const seq = ++kintoneSeqRef.current;
      setKintoneLookupState("loading");
      setKintoneMsg("");
      setKintoneMsgIsError(false);

      void (async () => {
        try {
          const res = await fetch("/api/kintone/lookup-license", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agencyId: user.agencyId,
              userCompanyNameJa: values.userCompanyNameJa,
              userCompanyNameZh: values.userCompanyNameZh,
              contractType,
              deliveryType,
            }),
          });
          const data = (await res.json()) as {
            found?: boolean;
            message?: string;
            error?: string;
            detail?: string;
            configured?: boolean;
            existingLicenseCount?: number;
            existingMaintenanceStart?: { year: number; month: number };
            existingMaintenanceEnd?: { year: number; month: number };
          };

          if (seq !== kintoneSeqRef.current) return;

          if (res.status === 503 && data.configured === false) {
            setKintoneMsg(t(locale, "estimate.kintoneNotConfigured"));
            setKintoneMsgIsError(true);
            setKintoneLookupState("idle");
            return;
          }

          if (!res.ok) {
            setKintoneMsg(data.error ?? `HTTP ${res.status}`);
            setKintoneMsgIsError(true);
            setValues((prev) => {
              const next = { ...prev };
              delete next.existingLicenseCount;
              delete next.existingMaintenanceStart;
              delete next.existingMaintenanceEnd;
              return next;
            });
            setKintoneLookupState("idle");
            return;
          }

          if (!data.found) {
            setKintoneMsg(t(locale, "estimate.kintoneNotFound"));
            setKintoneMsgIsError(false);
            setValues((prev) => {
              const next = { ...prev };
              delete next.existingLicenseCount;
              delete next.existingMaintenanceStart;
              delete next.existingMaintenanceEnd;
              return next;
            });
            setKintoneLookupState("idle");
            return;
          }

          setValues((prev) => {
            const next = { ...prev };
            if (data.existingLicenseCount != null && !Number.isNaN(Number(data.existingLicenseCount))) {
              next.existingLicenseCount = data.existingLicenseCount;
            }
            if (data.existingMaintenanceStart?.year != null && data.existingMaintenanceStart?.month != null) {
              next.existingMaintenanceStart = {
                year: data.existingMaintenanceStart.year,
                month: data.existingMaintenanceStart.month,
              };
            }
            if (data.existingMaintenanceEnd?.year != null && data.existingMaintenanceEnd?.month != null) {
              next.existingMaintenanceEnd = {
                year: data.existingMaintenanceEnd.year,
                month: data.existingMaintenanceEnd.month,
              };
            }
            return next;
          });
          setKintoneMsg(t(locale, "estimate.kintoneLookupSuccess"));
        } catch (err) {
          if (seq !== kintoneSeqRef.current) return;
          console.error("[kintone lookup]", err);
          setKintoneMsg(isEn ? "Search failed. Please try again." : "検索に失敗しました。しばらくしてから再度お試しください。");
          setValues((prev) => {
            const next = { ...prev };
            delete next.existingLicenseCount;
            delete next.existingMaintenanceStart;
            delete next.existingMaintenanceEnd;
            return next;
          });
        } finally {
          if (seq === kintoneSeqRef.current) {
            setKintoneLookupState("idle");
          }
        }
      })();
    }, KINTONE_LOOKUP_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    showKintoneLookup,
    user?.agencyId,
    user?.role,
    values.userCompanyNameJa,
    values.userCompanyNameZh,
    contractType,
    deliveryType,
    locale,
    isEn,
  ]);

  const handleDeliveryChange = (v: string) => {
    setDeliveryType(v ? (v as DeliveryType) : "");
    setContractType("");
    setCloudBilling("");
    setValues((prev) => {
      const next: FormValues = {};
      for (const key of SALES_AGENCY_PRESERVED_KEYS) {
        if (key in prev && prev[key] !== undefined) {
          next[key] = prev[key];
        }
      }
      return next;
    });
  };

  const handleContractChange = (v: string) => {
    setContractType(v ? (v as ContractType) : "");
    if (deliveryType !== "cloud" || v !== "new") setCloudBilling("");
    // 見積内容だけリセットし、ログイン代理店から入った販売代理店欄は維持する
    setValues((prev) => {
      const next: FormValues = {};
      for (const key of SALES_AGENCY_PRESERVED_KEYS) {
        if (key in prev && prev[key] !== undefined) {
          next[key] = prev[key];
        }
      }
      return next;
    });
  };

  const update = (id: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const resetForm = () => {
    setDeliveryType("");
    setContractType("");
    setCloudBilling("");
    setValues({});
    setSubmitState("idle");
    setResultNo("");
    setErrorMsg("");
    setKintoneLookupState("idle");
    setKintoneMsg("");
    setKintoneMsgIsError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ライセンス数バリデーション
    const licenseCount = values.licenseCount;
    if (
      licenseCount !== undefined &&
      licenseCount !== "" &&
      !(ALLOWED_I_REPORTER_LICENSE_COUNTS as readonly number[]).includes(Number(licenseCount))
    ) {
      return;
    }

    const emailsToCheck = [
      String(values.userEmail ?? "").trim(),
      String(values.salesAgencyEmail ?? "").trim(),
    ].filter(Boolean);
    for (const em of emailsToCheck) {
      if (!isValidEmail(em)) {
        setErrorMsg(t(locale, "estimate.emailInvalid"));
        return;
      }
    }

    setSubmitState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/estimates/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId:    user?.agencyId ?? "unknown",
          agencyName:  user?.name ?? "不明",
          customerName: resolveCustomerDisplayName(values as Record<string, unknown>),
          deliveryType,
          contractType,
          cloudBilling: cloudBilling || undefined,
          formInputs: values,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) errMsg = parsed.error;
        } catch {
          if (text) errMsg = text.slice(0, 200);
        }
        throw new Error(errMsg);
      }

      const data = await res.json() as { no: string };
      setResultNo(data.no);
      setSubmitState("done");
    } catch (err) {
      console.error("[submit]", err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setSubmitState("error");
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        {t(locale, "estimate.title")}
      </h2>

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        <div>
          <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
            {t(locale, "estimate.deliveryType")}
          </label>
          <select
            value={deliveryType}
            onChange={(e) => handleDeliveryChange(e.target.value)}
            required
            className="mt-1.5 w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
          >
            <option value="">{t(locale, "common.selectPlaceholder")}</option>
            {DELIVERY_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {isEn ? d.labelEn : d.labelJa}
              </option>
            ))}
          </select>
        </div>

        {deliveryType && (
          <div>
            <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
              {t(locale, "estimate.contractType")}
            </label>
            <select
              value={contractType}
              onChange={(e) => handleContractChange(e.target.value)}
              required
              className="mt-1.5 w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
            >
              <option value="">{t(locale, "common.selectPlaceholder")}</option>
              {contractOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {isEn ? c.labelEn : c.labelJa}
                </option>
              ))}
            </select>
          </div>
        )}

        {showCloudBilling && (
          <div className="space-y-4">
            <div>
              <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
                {t(locale, "estimate.billingType")}
              </label>
              <div className="mt-2 flex gap-4">
                {CLOUD_NEW_BILLING.map((b) => (
                  <label key={b.value} className="flex items-center gap-2 font-body text-sm">
                    <input
                      type="radio"
                      name="cloudBilling"
                      value={b.value}
                      checked={cloudBilling === b.value}
                      onChange={() => setCloudBilling(b.value)}
                    />
                    {isEn ? b.labelEn : b.labelJa}
                  </label>
                ))}
              </div>
            </div>
            {cloudBilling === "period" && (
              <div>
                <label className="block font-body text-sm text-[var(--color-ink-muted)]">
                  {t(locale, "estimate.periodMonths")} *
                </label>
                <input
                  type="number"
                  min={1}
                  value={(values.periodMonths as number) ?? ""}
                  onChange={(e) =>
                    update("periodMonths", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  required={cloudBilling === "period"}
                  className="mt-1 w-full max-w-[160px] rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
                />
              </div>
            )}
          </div>
        )}

        {/* 顧客情報 + 動的項目 */}
        {showMainForm && (
          <>
            <div className="space-y-4 rounded-lg border border-stone-200/80 bg-[var(--color-surface-elevated)] p-4 dark:border-stone-700/80">
              <h3 className="font-body text-sm font-medium text-[var(--color-ink)]">
                {t(locale, "estimate.sectionEndUserCompany")}
              </h3>
              <p className="font-body text-xs text-[var(--color-ink-muted)]">
                {t(locale, "estimate.sectionEndUserCompanyHint")}
              </p>
              {END_USER_COMPANY_FIELDS.map((f) => (
                <FieldRenderer
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  formValues={values}
                  onChange={(id, v) => update(id, v)}
                  locale={locale}
                />
              ))}
            </div>

            <div className="space-y-4 rounded-lg border border-stone-200/80 bg-[var(--color-surface-elevated)] p-4 dark:border-stone-700/80">
              <h3 className="font-body text-sm font-medium text-[var(--color-ink)]">
                {t(locale, "estimate.sectionSalesAgency")}
              </h3>
              <p className="font-body text-xs text-[var(--color-ink-muted)]">
                {t(locale, "estimate.sectionSalesAgencyHint")}
              </p>
              {SALES_AGENCY_CONTACT_FIELDS.map((f) => (
                <FieldRenderer
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  formValues={values}
                  onChange={(id, v) => update(id, v)}
                  locale={locale}
                />
              ))}
            </div>

            <div className="space-y-4 rounded-lg border border-stone-200/80 bg-[var(--color-surface-elevated)] p-4 dark:border-stone-700/80">
              <h3 className="font-body text-sm font-medium text-[var(--color-ink)]">
                {t(locale, "estimate.contentSection")}
              </h3>
              {showKintoneLookup && (
                <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-600 dark:bg-stone-900/40">
                  <p className="font-body text-xs text-[var(--color-ink-muted)]">
                    {t(locale, "estimate.kintoneAutoHint")}
                  </p>
                  {!user?.agencyId && (
                    <p className="mt-2 font-body text-xs text-amber-700 dark:text-amber-300">
                      {t(locale, "estimate.kintoneLookupNoAgency")}
                    </p>
                  )}
                  {user?.agencyId && kintoneLookupState === "loading" && (
                    <p className="mt-2 font-body text-xs text-[var(--color-ink-muted)]" role="status" aria-live="polite">
                      {t(locale, "estimate.kintoneLookupLoading")}
                    </p>
                  )}
                  {user?.agencyId && kintoneLookupState !== "loading" && kintoneMsg && (
                    <p
                      className={`mt-2 font-body text-xs ${kintoneMsgIsError ? "text-red-700 dark:text-red-300" : "text-[var(--color-ink)]"}`}
                      role="status"
                      aria-live="polite"
                    >
                      {kintoneMsg}
                    </p>
                  )}
                </div>
              )}
              {formFields.map((f) => (
                <FieldRenderer
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  formValues={values}
                  onChange={(id, v) => update(id, v)}
                  locale={locale}
                />
              ))}
            </div>

            <div className="space-y-4 rounded-lg border border-stone-200/80 bg-[var(--color-surface-elevated)] p-4 dark:border-stone-700/80">
              <h3 className="font-body text-sm font-medium text-[var(--color-ink)]">
                {t(locale, "estimate.sectionApplicationExtra")}
              </h3>
              {APPLICATION_DETAIL_EXTRA_FIELDS.map((f) => (
                <FieldRenderer
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  formValues={values}
                  onChange={(id, v) => update(id, v)}
                  locale={locale}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-body text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/50 disabled:opacity-60"
              >
                {submitState === "submitting"
                  ? t(locale, "estimate.submitting")
                  : t(locale, "estimate.submit")}
              </button>
            </div>

            {submitState === "error" && (
              <p className="font-body text-sm text-red-600 dark:text-red-400" role="alert">
                {errorMsg || t(locale, "estimate.submitError")}
              </p>
            )}
          </>
        )}
      </form>

      {/* 申請完了画面 */}
      {submitState === "done" && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800/60 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div className="space-y-1">
              <p className="font-body text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {t(locale, "estimate.submitted")}
              </p>
              <p className="font-body text-sm text-emerald-700 dark:text-emerald-300">
                {t(locale, "estimate.submittedNo")}：<span className="font-mono font-semibold">{resultNo}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="mt-4 rounded-lg border border-emerald-400 px-4 py-2 font-body text-sm text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
          >
            {t(locale, "estimate.backToNew")}
          </button>
        </div>
      )}
    </div>
  );
}

type Locale = "ja" | "en";

function FieldRenderer({
  field,
  value,
  formValues,
  onChange,
  locale,
}: {
  field: import("@/lib/estimate-schema").FormFieldDef;
  value: unknown;
  formValues: FormValues;
  onChange: (fieldId: string, v: unknown) => void;
  locale: Locale;
}) {
  const { id, labelJa, labelEn, kind, optionIds, required } = field;
  const label = locale === "en" ? labelEn : labelJa;

  if (kind === "text") {
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(id, e.target.value)}
          required={required}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
        />
      </div>
    );
  }

  if (kind === "email") {
    const str = (value as string) ?? "";
    const showErr = str.trim() !== "" && !isValidEmail(str);
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={str}
          onChange={(e) => onChange(id, e.target.value)}
          required={required}
          className={`mt-1 w-full rounded-lg border px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 dark:bg-stone-800 ${
            showErr
              ? "border-red-500 bg-red-50 focus:ring-red-500/40 dark:bg-red-950/20"
              : "border-stone-300 bg-white focus:ring-[var(--color-brand)]/40 dark:border-stone-600"
          }`}
        />
        {showErr && (
          <p className="mt-1 font-body text-xs text-red-600 dark:text-red-400">{t(locale, "estimate.emailInvalid")}</p>
        )}
      </div>
    );
  }

  if (kind === "phone_country" && field.dialField && field.localField) {
    const dial = (formValues[field.dialField] as string) || DEFAULT_DIAL_CODE;
    const local = (formValues[field.localField] as string) ?? "";
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <select
            value={dial}
            onChange={(e) => onChange(field.dialField!, e.target.value)}
            className="w-full max-w-[200px] shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
            aria-label={label}
          >
            {COUNTRY_DIAL_CODES.map((o) => (
              <option key={o.value} value={o.value}>
                {locale === "en" ? o.labelEn : o.labelJa}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={local}
            onChange={(e) => onChange(field.localField!, e.target.value)}
            required={required}
            placeholder={t(locale, "estimate.phoneLocalHint")}
            className="min-w-[12rem] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
          />
        </div>
      </div>
    );
  }

  if (kind === "number") {
    const isLicenseCount = id === "licenseCount";
    const numValue = value === undefined || value === "" ? undefined : Number(value);
    const showLicenseCountError =
      isLicenseCount &&
      numValue !== undefined &&
      !(ALLOWED_I_REPORTER_LICENSE_COUNTS as readonly number[]).includes(numValue);

    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <input
          type="number"
          min={isLicenseCount ? Math.min(...ALLOWED_I_REPORTER_LICENSE_COUNTS) : 0}
          value={(value as number) ?? ""}
          onChange={(e) => onChange(id, e.target.value === "" ? undefined : Number(e.target.value))}
          required={required}
          className={`mt-1 w-full max-w-[160px] rounded-lg border px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 dark:bg-stone-800 ${
            showLicenseCountError
              ? "border-red-500 bg-red-50 focus:ring-red-500/40 dark:bg-red-950/20"
              : "border-stone-300 bg-white focus:ring-[var(--color-brand)]/40 dark:border-stone-600"
          }`}
        />
        {showLicenseCountError && (
          <p className="mt-1.5 font-body text-sm text-red-600 dark:text-red-400" role="alert">
            {t(locale, "estimate.licenseCountError", { list: ALLOWED_I_REPORTER_LICENSE_COUNTS.join(", ") })}
          </p>
        )}
      </div>
    );
  }

  if (kind === "year_month") {
    const ym = (value as { year?: number; month?: number }) ?? {};
    return (
      <div className="flex flex-wrap items-end gap-3">
        <span className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </span>
        <input
          type="number"
          min={2000}
          max={2100}
          placeholder={t(locale, "estimate.year")}
          value={ym.year ?? ""}
          onChange={(e) =>
            onChange(id, {
              ...ym,
              year: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-body text-sm dark:border-stone-600 dark:bg-stone-800"
        />
        <input
          type="number"
          min={1}
          max={12}
          placeholder={t(locale, "estimate.month")}
          value={ym.month ?? ""}
          onChange={(e) =>
            onChange(id, {
              ...ym,
              month: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-body text-sm dark:border-stone-600 dark:bg-stone-800"
        />
      </div>
    );
  }

  if (kind === "options_check" && optionIds) {
    const data = (value as Record<string, boolean | unknown>) ?? {};
    const hasOptions = data.hasOptions === true;
    const checked = { ...data } as Record<string, boolean>;
    return (
      <div className="space-y-3">
        <div>
          <span className="block font-body text-sm text-[var(--color-ink-muted)] mb-2">
            {label}
          </span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 font-body text-sm">
              <input
                type="radio"
                name={`${id}_hasOptions`}
                checked={!hasOptions}
                onChange={() =>
                  onChange(
                    id,
                    Object.fromEntries([
                      ["hasOptions", false],
                      ...optionIds.map((k) => [k, false]),
                    ])
                  )}
                />
                {t(locale, "estimate.optionNone")}
              </label>
              <label className="flex items-center gap-2 font-body text-sm">
                <input
                  type="radio"
                  name={`${id}_hasOptions`}
                  checked={hasOptions}
                  onChange={() =>
                    onChange(id, {
                      ...Object.fromEntries(optionIds.map((k) => [k, checked[k] ?? false])),
                      hasOptions: true,
                    })
                  }
                />
                {t(locale, "estimate.optionYes")}
              </label>
            </div>
          </div>
        {hasOptions && (
          <div className="ml-6 flex flex-col gap-2 border-l-2 border-stone-200 pl-4 dark:border-stone-600">
            {optionIds.map((key) => {
              const opt = OPTION_ITEMS[key];
              if (!opt) return null;
              return (
                <label key={key} className="flex items-center gap-2 font-body text-sm" id={`${id}_${key}`}>
                  <input
                    type="checkbox"
                    checked={!!checked[key]}
                    onChange={(e) => onChange(id, { ...checked, [key]: e.target.checked })}
                  />
                  {locale === "en" ? opt.labelEn : opt.labelJa}
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (kind === "textarea") {
    const rows = field.rows ?? 3;
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <textarea
          rows={rows}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(id, e.target.value)}
          required={required}
          className="mt-1 w-full min-h-[4rem] rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
        />
      </div>
    );
  }

  if (kind === "radio" && field.radioOptions) {
    const opts = field.radioOptions;
    return (
      <div>
        <span className="block font-body text-sm text-[var(--color-ink-muted)] mb-2">
          {label}
          {required && " *"}
        </span>
        <div className="flex flex-wrap gap-4">
          {opts.map((opt, idx) => (
            <label key={opt.value} className="flex items-center gap-2 font-body text-sm">
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(id, opt.value)}
                required={required && idx === 0}
              />
              {locale === "en" ? opt.labelEn : opt.labelJa}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "option_license_counts" && optionIds) {
    const counts = (value as Record<string, number>) ?? {};
    return (
      <div className="space-y-2">
        <span className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
        </span>
        {optionIds.map((key) => {
          const opt = OPTION_ITEMS[key];
          if (!opt || !("hasLicenseCount" in opt)) return null;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-40 font-body text-sm text-[var(--color-ink)]">
                {locale === "en" ? opt.labelEn : opt.labelJa}
              </span>
              <input
                type="number"
                min={0}
                value={counts[key] ?? ""}
                onChange={(e) =>
                  onChange(id, {
                    ...counts,
                    [key]: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-body text-sm dark:border-stone-600 dark:bg-stone-800"
              />
              <span className="font-body text-xs text-[var(--color-ink-muted)]">{t(locale, "estimate.licenses")}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
