"use client";

import { useLocale } from "@/lib/locale-context";

const GlobeIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const LOCALES = [
  { value: "ja", code: "JA", label: "日本語" },
  { value: "en", code: "EN", label: "English" },
] as const;

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale } = useLocale();
  const current = LOCALES.find((l) => l.value === locale) ?? LOCALES[0];

  return (
    <div className={`relative flex items-center ${className}`}>
      <label className="sr-only">Language</label>
      <div className="pointer-events-none absolute left-2 flex items-center text-[var(--color-ink-muted)]">
        <GlobeIcon />
      </div>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as "ja" | "en")}
        className="appearance-none rounded-lg border border-stone-200 bg-[var(--color-surface-elevated)] py-1.5 pl-7 pr-6 font-body text-sm text-[var(--color-ink)] outline-none transition hover:border-stone-300 focus:ring-2 focus:ring-[var(--color-brand)]/30 dark:border-stone-700 dark:hover:border-stone-600 cursor-pointer"
        aria-label="言語選択"
      >
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.code} {l.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2 flex items-center text-[var(--color-ink-muted)]">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>
  );
}
