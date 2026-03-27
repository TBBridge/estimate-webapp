"use client";

import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";
import {
  ALLOWED_I_REPORTER_LICENSE_COUNTS,
  isFormFieldVisible,
  OPTION_ITEMS,
  type FormFieldDef,
} from "@/lib/estimate-schema";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "@/lib/phone-codes";
import { isValidEmail } from "@/lib/validation";

export type FormFieldValues = Record<string, unknown>;

type Props = {
  field: FormFieldDef;
  value: unknown;
  formValues: FormFieldValues;
  onChange: (fieldId: string, v: unknown) => void;
  locale: Locale;
};

export function FormFieldRenderer({ field, value, formValues, onChange, locale }: Props) {
  if (!isFormFieldVisible(field, formValues)) return null;

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
          <span className="block font-body text-sm text-[var(--color-ink-muted)] mb-2">{label}</span>
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

  if (kind === "select" && field.radioOptions) {
    const opts = field.radioOptions;
    const str = String(value ?? "");
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <select
          value={str}
          onChange={(e) => onChange(id, e.target.value === "" ? undefined : e.target.value)}
          required={required}
          className="mt-1 w-full max-w-md rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
        >
          <option value="">{t(locale, "common.selectPlaceholder")}</option>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {locale === "en" ? opt.labelEn : opt.labelJa}
            </option>
          ))}
        </select>
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
        <span className="block font-body text-sm text-[var(--color-ink-muted)]">{label}</span>
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
