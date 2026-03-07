"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";

export default function AgencyHomePage() {
  const { locale } = useLocale();
  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
        {t(locale, "agency.homeTitle")}
      </h1>
      <p className="mt-2 font-body text-sm text-[var(--color-ink-muted)]">
        {t(locale, "agency.homeDescription")}
      </p>
      <Link
        href="/agency/estimates"
        className="mt-4 inline-block rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90"
      >
        {t(locale, "agency.estimatesCta")}
      </Link>
    </div>
  );
}
