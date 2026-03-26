"use client";

import { useEffect, useState } from "react";
import { buildEstimateApplicationSections } from "@/lib/estimate-form-display";
import type { Estimate } from "@/lib/mock-data";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

type KintoneSalesClient =
  | { configured: false }
  | {
      configured: true;
      found: boolean;
      recordId?: string;
      rows: { label: string; value: string }[];
      error?: string;
    };

type Props = {
  estimate: Estimate;
  locale: Locale;
};

export function EstimateApplicationDetail({ estimate, locale }: Props) {
  const [kintoneSales, setKintoneSales] = useState<KintoneSalesClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKintoneSales(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/estimates/${estimate.id}?includeKintoneSales=1&locale=${locale}`
        );
        let data: { kintoneSales?: KintoneSalesClient; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (!res.ok) {
          setKintoneSales({
            configured: true,
            found: false,
            rows: [],
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        if (data.kintoneSales) setKintoneSales(data.kintoneSales);
      } catch {
        if (!cancelled) setKintoneSales({ configured: true, found: false, rows: [], error: "fetch failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    estimate.id,
    locale,
    estimate.customerName,
    estimate.agencyName,
    estimate.amount,
    estimate.maintenanceFee,
    estimate.formInputs,
    estimate.excelUrl,
    estimate.pdfUrl,
  ]);

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

      {kintoneSales === null && (
        <p className="font-body text-xs text-[var(--color-ink-muted)]">{t(locale, "admin.estimates.kintoneSalesLoading")}</p>
      )}

      {kintoneSales && kintoneSales.configured && (
        <div>
          <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {t(locale, "admin.estimates.sectionKintoneSales")}
          </h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
            {kintoneSales.error ? (
              <p className="font-body text-sm text-amber-800 dark:text-amber-200">{kintoneSales.error}</p>
            ) : kintoneSales.found && kintoneSales.rows.length > 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {kintoneSales.rows.map((r, j) => (
                  <div
                    key={j}
                    className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <span className="shrink-0 font-body text-xs text-[var(--color-ink-muted)] sm:max-w-[42%]">
                      {r.label}
                    </span>
                    <span className="min-w-0 font-body text-sm text-[var(--color-ink)] whitespace-pre-wrap break-words sm:text-right">
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body text-sm text-[var(--color-ink-muted)]">
                {t(locale, "admin.estimates.kintoneSalesNoRecord")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
