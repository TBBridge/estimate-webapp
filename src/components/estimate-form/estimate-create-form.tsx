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
  ALLOWED_I_REPORTER_LICENSE_COUNTS,
  resolveCustomerDisplayName,
  SALES_AGENCY_PRESERVED_KEYS,
  type DeliveryType,
  type ContractType,
} from "@/lib/estimate-schema";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "@/lib/phone-codes";
import { isValidEmail } from "@/lib/validation";
import { FormFieldRenderer, type FormFieldValues } from "@/components/estimate-form/form-field-renderer";

type FormValues = FormFieldValues;
type SubmitState = "idle" | "submitting" | "done" | "error";
type KintoneLookupState = "idle" | "loading";

/** kintone 候補（lookup-license API の candidates と一致） */
type KintoneLicenseCandidate = {
  recordId: string;
  customerDisplay: string;
  existingLicenseCount?: number;
  existingMaintenanceStart?: { year: number; month: number };
  existingMaintenanceEnd?: { year: number; month: number };
};

const KINTONE_LOOKUP_DEBOUNCE_MS = 600;

function stripKintoneFilledFields(prev: FormValues): FormValues {
  const next = { ...prev };
  delete next.existingLicenseCount;
  delete next.existingMaintenanceStart;
  delete next.existingMaintenanceEnd;
  return next;
}

function mergeKintoneCandidate(
  prev: FormValues,
  c: KintoneLicenseCandidate,
): FormValues {
  const next = { ...prev };
  if (c.existingLicenseCount != null && !Number.isNaN(Number(c.existingLicenseCount))) {
    next.existingLicenseCount = c.existingLicenseCount;
  }
  if (c.existingMaintenanceStart?.year != null && c.existingMaintenanceStart?.month != null) {
    next.existingMaintenanceStart = {
      year: c.existingMaintenanceStart.year,
      month: c.existingMaintenanceStart.month,
    };
  }
  if (c.existingMaintenanceEnd?.year != null && c.existingMaintenanceEnd?.month != null) {
    next.existingMaintenanceEnd = {
      year: c.existingMaintenanceEnd.year,
      month: c.existingMaintenanceEnd.month,
    };
  }
  return next;
}

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
  const [kintoneCandidates, setKintoneCandidates] = useState<KintoneLicenseCandidate[]>([]);
  const [kintonePickedId, setKintonePickedId] = useState<string | null>(null);
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
      setKintoneCandidates([]);
      setKintonePickedId(null);
      return;
    }

    const nameJa = String(values.userCompanyNameJa ?? "").trim();
    const customerSearch = nameJa;

    if (!customerSearch) {
      setKintoneMsg("");
      setKintoneMsgIsError(false);
      setKintoneLookupState("idle");
      setKintoneCandidates([]);
      setKintonePickedId(null);
      setValues((prev) => stripKintoneFilledFields(prev));
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
            matchCount?: number;
            candidates?: KintoneLicenseCandidate[];
            requiresSelection?: boolean;
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
            setKintoneCandidates([]);
            setKintonePickedId(null);
            setKintoneMsg(t(locale, "estimate.kintoneNotConfigured"));
            setKintoneMsgIsError(true);
            setKintoneLookupState("idle");
            return;
          }

          if (!res.ok) {
            setKintoneCandidates([]);
            setKintonePickedId(null);
            setKintoneMsg(data.error ?? `HTTP ${res.status}`);
            setKintoneMsgIsError(true);
            setValues((prev) => stripKintoneFilledFields(prev));
            setKintoneLookupState("idle");
            return;
          }

          const candidates = Array.isArray(data.candidates) ? data.candidates : [];

          if (!data.found || candidates.length === 0) {
            setKintoneCandidates([]);
            setKintonePickedId(null);
            setKintoneMsg(data.message?.trim() || t(locale, "estimate.kintoneNotFound"));
            setKintoneMsgIsError(false);
            setValues((prev) => stripKintoneFilledFields(prev));
            setKintoneLookupState("idle");
            return;
          }

          if (candidates.length > 1) {
            setKintoneCandidates(candidates);
            setKintonePickedId(candidates[0]?.recordId ?? null);
            setValues((prev) => stripKintoneFilledFields(prev));
            setKintoneMsg(t(locale, "estimate.kintonePickPrompt"));
            setKintoneMsgIsError(false);
            setKintoneLookupState("idle");
            return;
          }

          const only = candidates[0];
          setKintoneCandidates([]);
          setKintonePickedId(null);
          setValues((prev) => mergeKintoneCandidate(prev, only));
          setKintoneMsg(t(locale, "estimate.kintoneLookupSuccess"));
        } catch (err) {
          if (seq !== kintoneSeqRef.current) return;
          console.error("[kintone lookup]", err);
          setKintoneCandidates([]);
          setKintonePickedId(null);
          setKintoneMsg(isEn ? "Search failed. Please try again." : "検索に失敗しました。しばらくしてから再度お試しください。");
          setKintoneMsgIsError(true);
          setValues((prev) => stripKintoneFilledFields(prev));
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
    setValues((prev) => {
      const next: FormValues = { ...prev, [id]: value };
      if (id === "userReleaseSubscription" && value === "no") {
        delete next.userReleaseLanguage;
      }
      if (id === "salesReleaseSubscription" && value === "no") {
        delete next.salesReleaseLanguage;
      }
      return next;
    });
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
    setKintoneCandidates([]);
    setKintonePickedId(null);
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
                <FormFieldRenderer
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
                <FormFieldRenderer
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
                <FormFieldRenderer
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
                <FormFieldRenderer
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

            {kintoneCandidates.length > 1 && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="kintone-pick-title"
              >
                <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-stone-200 bg-[var(--color-surface)] shadow-lg dark:border-stone-600">
                  <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-600">
                    <h2
                      id="kintone-pick-title"
                      className="font-body text-sm font-semibold text-[var(--color-ink)]"
                    >
                      {t(locale, "estimate.kintonePickPrompt")}
                    </h2>
                  </div>
                  <ul className="max-h-[50vh] overflow-y-auto p-3 font-body text-sm">
                    {kintoneCandidates.map((c) => (
                      <li key={c.recordId} className="border-b border-stone-100 py-2 last:border-0 dark:border-stone-700">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="radio"
                            name="kintonePick"
                            className="mt-1"
                            checked={kintonePickedId === c.recordId}
                            onChange={() => setKintonePickedId(c.recordId)}
                          />
                          <span className="text-[var(--color-ink)]">
                            <span className="font-medium">{c.customerDisplay || c.recordId}</span>
                            {c.existingLicenseCount != null && (
                              <span className="ml-1 text-stone-500 dark:text-stone-400">
                                ({t(locale, "estimate.licenses")}: {c.existingLicenseCount})
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-600">
                    <button
                      type="button"
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-[var(--color-ink)] hover:bg-stone-50 dark:border-stone-600 dark:hover:bg-stone-800"
                      onClick={() => {
                        setKintoneCandidates([]);
                        setKintonePickedId(null);
                        setValues((prev) => stripKintoneFilledFields(prev));
                        setKintoneMsg("");
                      }}
                    >
                      {t(locale, "estimate.kintonePickCancel")}
                    </button>
                    <button
                      type="button"
                      disabled={!kintonePickedId}
                      className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      onClick={() => {
                        const c = kintoneCandidates.find((x) => x.recordId === kintonePickedId);
                        if (!c) return;
                        setValues((prev) => mergeKintoneCandidate(prev, c));
                        setKintoneCandidates([]);
                        setKintonePickedId(null);
                        setKintoneMsg(t(locale, "estimate.kintoneLookupSuccess"));
                        setKintoneMsgIsError(false);
                      }}
                    >
                      {t(locale, "estimate.kintonePickApply")}
                    </button>
                  </div>
                </div>
              </div>
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
