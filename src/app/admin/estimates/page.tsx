"use client";

import { useState, useMemo } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { MOCK_ESTIMATES, MOCK_AGENCIES, type Estimate, type EstimateStatus } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

const STATUS_BADGE: Record<EstimateStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function statusLabel(locale: "ja" | "en", s: EstimateStatus) {
  return t(locale, `admin.estimates.status${s.charAt(0).toUpperCase()}${s.slice(1)}` as never);
}

const selectCls = "rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800";
const inputCls = `${selectCls}`;

export default function AdminEstimatesPage() {
  const { locale } = useLocale();
  const l = (k: string) => t(locale, k);

  const [filters, setFilters] = useState({
    agencyId: "",
    deliveryType: "",
    contractType: "",
    status: "",
    customerName: "",
    from: "",
    to: "",
  });

  const setFilter = (k: keyof typeof filters, v: string) =>
    setFilters((prev) => ({ ...prev, [k]: v }));

  const resetFilters = () =>
    setFilters({ agencyId: "", deliveryType: "", contractType: "", status: "", customerName: "", from: "", to: "" });

  const filtered = useMemo(() => {
    return MOCK_ESTIMATES.filter((e) => {
      if (filters.agencyId && e.agencyId !== filters.agencyId) return false;
      if (filters.deliveryType && e.deliveryType !== filters.deliveryType) return false;
      if (filters.contractType && e.contractType !== filters.contractType) return false;
      if (filters.status && e.status !== filters.status) return false;
      if (filters.customerName && !e.customerName.includes(filters.customerName)) return false;
      if (filters.from && e.createdAt < filters.from) return false;
      if (filters.to && e.createdAt > filters.to) return false;
      return true;
    });
  }, [filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {l("admin.estimatesTitle")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {l("admin.estimatesDescription")}
        </p>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-4 shadow-sm dark:border-stone-700/80">
        <div className="flex flex-wrap gap-3">
          {/* 代理店 */}
          <select value={filters.agencyId} onChange={(e) => setFilter("agencyId", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterAgency")}: {l("admin.estimates.all")}</option>
            {MOCK_AGENCIES.map((ag) => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
          </select>
          {/* 提供形態 */}
          <select value={filters.deliveryType} onChange={(e) => setFilter("deliveryType", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterDelivery")}: {l("admin.estimates.all")}</option>
            {DELIVERY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.labelJa}</option>)}
          </select>
          {/* 契約形態 */}
          <select value={filters.contractType} onChange={(e) => setFilter("contractType", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterContract")}: {l("admin.estimates.all")}</option>
            {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.labelJa}</option>)}
          </select>
          {/* 承認状態 */}
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterStatus")}: {l("admin.estimates.all")}</option>
            <option value="pending">{l("admin.estimates.statusPending")}</option>
            <option value="approved">{l("admin.estimates.statusApproved")}</option>
            <option value="rejected">{l("admin.estimates.statusRejected")}</option>
          </select>
          {/* 顧客名 */}
          <input
            type="text"
            placeholder={l("admin.estimates.filterCustomer")}
            value={filters.customerName}
            onChange={(e) => setFilter("customerName", e.target.value)}
            className={inputCls}
          />
          {/* 期間 */}
          <div className="flex items-center gap-2">
            <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className={inputCls} />
            <span className="text-[var(--color-ink-muted)]">〜</span>
            <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className={inputCls} />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-stone-300 px-3 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
          >
            {l("admin.estimates.reset")}
          </button>
        </div>
        <p className="mt-2 font-body text-xs text-[var(--color-ink-muted)]">
          {filtered.length} 件
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] shadow-sm dark:border-stone-700/80">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              {[
                "admin.estimates.no",
                "admin.estimates.agency",
                "admin.estimates.customer",
                "admin.estimates.delivery",
                "admin.estimates.contract",
                "admin.estimates.amount",
                "admin.estimates.status",
                "admin.estimates.createdAt",
              ].map((k) => <th key={k} className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">{l(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">
                  該当する見積がありません
                </td>
              </tr>
            ) : filtered.map((e: Estimate) => (
              <tr key={e.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-ink)]">{e.no}</td>
                <td className="px-4 py-3 text-[var(--color-ink)]">{e.agencyName}</td>
                <td className="px-4 py-3 text-[var(--color-ink)]">{e.customerName}</td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                  {DELIVERY_TYPES.find((d) => d.value === e.deliveryType)?.labelJa}
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                  {CONTRACT_TYPES.find((c) => c.value === e.contractType)?.labelJa}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[var(--color-ink)]">
                  ¥{(e.amount + e.maintenanceFee).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}>
                    {statusLabel(locale, e.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">{e.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
