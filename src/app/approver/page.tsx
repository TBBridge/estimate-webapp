"use client";

import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";

export default function ApproverPage() {
  const { locale } = useLocale();
  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
        {t(locale, "approver.title")}
      </h1>
      <p className="mt-2 font-body text-sm text-[var(--color-ink-muted)]">
        {t(locale, "approver.description")}
      </p>
    </div>
  );
}
