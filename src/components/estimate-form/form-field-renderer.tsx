"use client";

import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";
import {
  ALLOWED_I_REPORTER_LICENSE_COUNTS,
  isFormFieldVisible,
  isValidLicenseCountValue,
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

  if (kind === "number" && id === "licenseCount") {
    const allowed = ALLOWED_I_REPORTER_LICENSE_COUNTS as readonly number[];
    const n =
      value !== undefined && value !== null && value !== "" && typeof value === "number"
        ? value
        : value !== undefined && value !== null && value !== "" && typeof value === "string"
          ? Number(value)
          : NaN;
    const strVal =
      value === undefined || value === null || value === ""
        ? ""
        : Number.isInteger(n) && allowed.includes(n)
          ? String(n)
          : "";
    const showLicenseCountError =
      value !== undefined && value !== null && value !== "" && !isValidLicenseCountValue(value);
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <select
          value={strVal}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange(id, undefined);
            else onChange(id, Number(raw));
          }}
          required={required}
          className={`mt-1 w-full max-w-xs rounded-lg border px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 dark:bg-stone-800 ${
            showLicenseCountError
              ? "border-red-500 bg-red-50 focus:ring-red-500/40 dark:bg-red-950/20"
              : "border-stone-300 bg-white focus:ring-[var(--color-brand)]/40 dark:border-stone-600"
          }`}
        >
          <option value="">{t(locale, "common.selectPlaceholder")}</option>
          {allowed.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="mt-1.5 font-body text-xs text-[var(--color-ink-muted)]">
          {t(locale, "estimate.licenseCountOver500Note")}
        </p>
        {showLicenseCountError && (
          <p className="mt-1.5 font-body text-sm text-red-600 dark:text-red-400" role="alert">
            {t(locale, "estimate.licenseCountError", { list: allowed.join(", ") })}
          </p>
        )}
      </div>
    );
  }

  if (kind === "number") {
    return (
      <div>
        <label className="block font-body text-sm text-[var(--color-ink-muted)]">
          {label}
          {required && " *"}
        </label>
        <input
          type="number"
          min={0}
          value={(value as number) ?? ""}
          onChange={(e) => onChange(id, e.target.value === "" ? undefined : Number(e.target.value))}
          required={required}
          className="mt-1 w-full max-w-[160px] rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
        />
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
    // defaultHasOptions が指定されたフィールド（オプション追加）は未入力時「有」を既定にする
    const hasOptions = data.hasOptions === true || (field.defaultHasOptions === true && data.hasOptions === undefined);
    const checked = { ...data } as Record<string, boolean>;
    const countsFieldId = field.licenseCountsField;
    const counts = countsFieldId
      ? ((formValues[countsFieldId] as Record<string, number | undefined>) ?? {})
      : {};
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
                onChange={() => {
                  onChange(
                    id,
                    Object.fromEntries([
                      ["hasOptions", false],
                      ...optionIds.map((k) => [k, false]),
                    ])
                  );
                  // 「無」を選んだらインラインで入力したライセンス数もクリアする
                  if (countsFieldId) onChange(countsFieldId, {});
                }}
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
              const hasLicenseCount = "hasLicenseCount" in opt && opt.hasLicenseCount;
              const isChecked = !!checked[key];
              return (
                <div key={key} className="flex flex-wrap items-center gap-2" id={`${id}_${key}`}>
                  <label className="flex items-center gap-2 font-body text-sm">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        onChange(id, { ...checked, [key]: e.target.checked });
                        // チェックを外したらそのオプションのライセンス数もクリア
                        if (!e.target.checked && hasLicenseCount && countsFieldId) {
                          onChange(countsFieldId, { ...counts, [key]: undefined });
                        }
                      }}
                    />
                    {locale === "en" ? opt.labelEn : opt.labelJa}
                  </label>
                  {hasLicenseCount && countsFieldId && isChecked && (
                    <span className="flex items-center gap-1">
                      <span className="font-body text-xs text-[var(--color-ink-muted)]">
                        {t(locale, "estimate.licenses")}{locale === "en" ? ": " : "："}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={counts[key] ?? ""}
                        onChange={(e) =>
                          onChange(countsFieldId, {
                            ...counts,
                            [key]: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        aria-label={`${locale === "en" ? opt.labelEn : opt.labelJa} ${t(locale, "estimate.licenses")}`}
                        className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-body text-sm dark:border-stone-600 dark:bg-stone-800"
                      />
                    </span>
                  )}
                </div>
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

  // オプション別ライセンス数は options_check 内にチェックボックスの右側へインライン表示するため、
  // 単独フィールドとしては描画しない（保存先 optionLicenseCounts は一覧・Excel・詳細表示で参照）。
  if (kind === "option_license_counts") {
    return null;
  }

  return null;
}
