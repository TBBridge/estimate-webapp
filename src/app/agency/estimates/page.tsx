"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/translations";
import EstimateCreateForm from "@/components/estimate-form/estimate-create-form";
import { useEstimates } from "@/hooks/use-estimates";
import type { Estimate } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_KEY: Record<string, string> = {
  pending:  "agency.estimates.statusPending",
  approved: "agency.estimates.statusApproved",
  rejected: "agency.estimates.statusRejected",
};

function deliveryLabel(v: string) {
  return DELIVERY_TYPES.find((d) => d.value === v)?.labelJa ?? v;
}
function contractLabel(v: string) {
  return CONTRACT_TYPES.find((c) => c.value === v)?.labelJa ?? v;
}

type Tab = "new" | "list";

export default function AgencyEstimatesPage() {
  const { locale } = useLocale();
  const { user } = useAuth();
  const l = (k: string) => t(locale, k);
  const [tab, setTab] = useState<Tab>("new");

  // 自分の代理店IDでフィルタ
  const { estimates, isLoading, error } = useEstimates(
    user?.agencyId ? { agencyId: user.agencyId } : {},
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {l("agencyEstimates.heading")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {l("agencyEstimates.description")}
        </p>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sub)] p-1 w-fit">
        {(["new", "list"] as Tab[]).map((v) => (
          <button key={v} type="button"
            onClick={() => setTab(v)}
            className={`rounded-lg px-5 py-1.5 font-body text-sm transition ${
              tab === v
                ? "bg-[var(--color-surface-elevated)] font-medium text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}>
            {v === "new" ? l("agency.estimates.newEstimate") : l("agency.estimates.myList")}
            {v === "list" && !isLoading && estimates.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--color-brand)]/15 px-1.5 py-0.5 text-xs text-[var(--color-brand)]">
                {estimates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 新規作成タブ */}
      {tab === "new" && (
        <EstimateCreateForm />
      )}

      {/* 自分の案件一覧タブ */}
      {tab === "list" && (
        <div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
              データの取得に失敗しました。
            </div>
          )}
          {isLoading ? (
            <div className="py-12 text-center font-body text-sm text-[var(--color-ink-muted)]">{l("common.loading")}</div>
          ) : estimates.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-12 text-center">
              <p className="font-body text-sm text-[var(--color-ink-muted)]">{l("agency.estimates.noEstimates")}</p>
              <button type="button" onClick={() => setTab("new")}
                className="mt-4 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90">
                {l("agency.estimates.newEstimate")}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-sm">
              <table className="w-full font-body text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["見積番号", "顧客名", "提供形態", "契約形態", "ステータス", "申請日"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((e: Estimate) => (
                    <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sub)]">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-ink)]">{e.no}</td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{e.customerName}</td>
                      <td className="px-4 py-3 text-[var(--color-ink-muted)]">{deliveryLabel(e.deliveryType)}</td>
                      <td className="px-4 py-3 text-[var(--color-ink-muted)]">{contractLabel(e.contractType)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status] ?? ""}`}>
                          {l(STATUS_KEY[e.status] ?? "")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-muted)]">{e.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
