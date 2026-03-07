"use client";

import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import EstimateCreateForm from "@/components/estimate-form/estimate-create-form";

export default function AgencyEstimatesPage() {
  const { locale } = useLocale();
  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
        {t(locale, "agencyEstimates.heading")}
      </h1>
      <p className="mt-2 font-body text-sm text-[var(--color-ink-muted)]">
        {t(locale, "agencyEstimates.description")}
      </p>
      <div className="mt-8">
        <EstimateCreateForm />
      </div>
    </div>
  );
}
