"use client";

import { useEffect, useState } from "react";
import { buildEstimateApplicationSections } from "@/lib/estimate-form-display";
import type { Estimate } from "@/lib/mock-data";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

type HubSpotDealsClient =
  | { configured: false }
  | {
      configured: true;
      found: boolean;
      deals: Array<{ id: string; dealName: string; customerName?: string }>;
      error?: string;
    };

type Props = {
  estimate: Estimate;
  locale: Locale;
};

export function EstimateApplicationDetail({ estimate, locale }: Props) {
  const [hubspotDeals, setHubspotDeals] = useState<HubSpotDealsClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHubspotDeals(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/estimates/${estimate.id}?includeHubSpotDeals=1&locale=${locale}`
        );
        let data: { hubspotDeals?: HubSpotDealsClient; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (!res.ok) {
          setHubspotDeals({
            configured: true,
            found: false,
            deals: [],
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        if (data.hubspotDeals) setHubspotDeals(data.hubspotDeals);
        else setHubspotDeals({ configured: false });
      } catch {
        if (!cancelled)
          setHubspotDeals({ configured: true, found: false, deals: [], error: "fetch failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estimate.id, locale, estimate.customerName]);

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

  const linkedHubspotDealId = (estimate.hubspotDealId ?? "").trim();

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

      {hubspotDeals === null && (
        <p className="font-body text-xs text-[var(--color-ink-muted)]">
          {t(locale, "admin.estimates.hubspotDealsLoading")}
        </p>
      )}

      {hubspotDeals && hubspotDeals.configured && (
        <div>
          <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {t(locale, "admin.estimates.sectionHubSpotDeals")}
          </h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 space-y-2">
            {linkedHubspotDealId && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4 border-b border-[var(--color-border)] pb-2">
                <span className="shrink-0 font-body text-xs text-[var(--color-ink-muted)] sm:max-w-[42%]">
                  {t(locale, "admin.estimates.hubspotCurrentDealId")}
                </span>
                <span className="min-w-0 font-mono text-sm text-[var(--color-ink)] sm:text-right">
                  {linkedHubspotDealId}
                </span>
              </div>
            )}

            {hubspotDeals.error ? (
              <p className="font-body text-sm text-amber-800 dark:text-amber-200">{hubspotDeals.error}</p>
            ) : hubspotDeals.found && hubspotDeals.deals.length > 0 ? (
              <>
                <p className="font-body text-xs text-[var(--color-ink-muted)]">
                  {t(locale, "admin.estimates.hubspotDealsFound", {
                    count: String(hubspotDeals.deals.length),
                  })}
                </p>
                <div className="divide-y divide-[var(--color-border)]">
                  {hubspotDeals.deals.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <span className="shrink-0 font-mono text-xs text-[var(--color-ink-muted)] sm:max-w-[42%]">
                        {t(locale, "admin.estimates.hubspotDealId")}: {d.id}
                      </span>
                      <span className="min-w-0 font-body text-sm text-[var(--color-ink)] whitespace-pre-wrap break-words sm:text-right">
                        {d.dealName || d.customerName || "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="font-body text-sm text-[var(--color-ink-muted)]">
                {t(locale, "admin.estimates.hubspotDealsNoDeal")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
