"use client";

import { useLocale } from "@/lib/locale-context";

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={`flex items-center gap-1 font-body text-sm ${className}`}>
      <button
        type="button"
        onClick={() => setLocale("ja")}
        className={`rounded px-2 py-1 transition ${
          locale === "ja"
            ? "bg-[var(--color-brand-muted)] font-medium text-[var(--color-brand)]"
            : "text-[var(--color-ink-muted)] hover:bg-stone-100 hover:text-[var(--color-ink)] dark:hover:bg-stone-800"
        }`}
        aria-pressed={locale === "ja"}
        aria-label="日本語"
      >
        JA
      </button>
      <span className="text-[var(--color-ink-muted)]">|</span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded px-2 py-1 transition ${
          locale === "en"
            ? "bg-[var(--color-brand-muted)] font-medium text-[var(--color-brand)]"
            : "text-[var(--color-ink-muted)] hover:bg-stone-100 hover:text-[var(--color-ink)] dark:hover:bg-stone-800"
        }`}
        aria-pressed={locale === "en"}
        aria-label="English"
      >
        EN
      </button>
    </div>
  );
}
