"use client";

import { buildEstimateApplicationSections } from "@/lib/estimate-form-display";
import type { Estimate } from "@/lib/mock-data";
import type { Locale } from "@/lib/translations";

type Props = {
  estimate: Estimate;
  locale: Locale;
};

export function EstimateApplicationDetail({ estimate, locale }: Props) {
  const sections = buildEstimateApplicationSections(
    {
      agencyName: estimate.agencyName,
      customerName: estimate.customerName,
      deliveryType: estimate.deliveryType,
      contractType: estimate.contractType,
      cloudBilling: estimate.cloudBilling,
      amount: estimate.amount,
      maintenanceFee: estimate.maintenanceFee,
      createdAt: estimate.createdAt,
      approvedAt: estimate.approvedAt,
      formInputs: estimate.formInputs,
    },
    locale
  );

  return (
    <div className="space-y-4">
      {sections.map((sec, i) => (
        <div key={`${sec.title}-${i}`}>
          <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {sec.title}
          </h3>
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            {sec.rows.map((r, j) =>
              r.label === "" ? (
                <div
                  key={j}
                  className="px-3 py-2.5 font-body text-sm text-[var(--color-ink-muted)] leading-relaxed"
                >
                  {r.value}
                </div>
              ) : (
                <div
                  key={j}
                  className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span className="shrink-0 font-body text-xs text-[var(--color-ink-muted)] sm:max-w-[42%]">
                    {r.label}
                  </span>
                  <span className="min-w-0 font-body text-sm text-[var(--color-ink)] whitespace-pre-wrap break-words sm:text-right">
                    {r.value}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
