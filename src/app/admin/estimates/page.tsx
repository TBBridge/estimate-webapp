"use client";

import { useState, useMemo, useEffect } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useEstimates } from "@/hooks/use-estimates";
import { useAgencies } from "@/hooks/use-agencies";
import type { Estimate, EstimateStatus } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import { mutate } from "swr";
import {
  EstimateCaseDetailModal,
  apiJsonToEstimate,
} from "@/components/estimate-detail/estimate-case-detail-modal";
import {
  buildHubSpotDuplicateConfirmMessage,
  getHubSpotDuplicateFromPayload,
  HUBSPOT_DUPLICATE_CANCELLED,
} from "@/lib/hubspot-approve-feedback";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function statusLabel(locale: "ja" | "en", s: string) {
  const map: Record<string, string> = {
    pending:  t(locale, "admin.estimates.statusPending"),
    approved: t(locale, "admin.estimates.statusApproved"),
    rejected: t(locale, "admin.estimates.statusRejected"),
  };
  return map[s] ?? s;
}

function deliveryLabel(v: string) {
  return DELIVERY_TYPES.find((d) => d.value === v)?.labelJa ?? v;
}
function contractLabel(v: string) {
  return CONTRACT_TYPES.find((c) => c.value === v)?.labelJa ?? v;
}

const selectCls =
  "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40";

// ── メインページ ─────────────────────────────────────────────
export default function AdminEstimatesPage() {
  const { locale } = useLocale();
  const l = (k: string) => t(locale, k);
  const { agencies } = useAgencies();

  const [filters, setFilters] = useState({
    agencyId: "", deliveryType: "", contractType: "",
    status: "", customerName: "", from: "", to: "",
  });
  const setFilter = (k: keyof typeof filters, v: string) =>
    setFilters((prev) => ({ ...prev, [k]: v }));
  const resetFilters = () =>
    setFilters({ agencyId: "", deliveryType: "", contractType: "", status: "", customerName: "", from: "", to: "" });

  const activeFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
    [filters],
  );

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [activeFilters]);
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const { estimates, total, isLoading, error: estimatesError } = useEstimates({
    ...activeFilters,
    page,
    pageSize,
  });
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  type EstimateSortKey = "no" | "agencyName" | "customerName" | "deliveryType" | "contractType" | "status" | "createdAt";
  const [sortKey, setSortKey] = useState<EstimateSortKey>("no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedEstimates = useMemo(() => {
    const list = [...estimates];
    list.sort((a, b) => {
      let va: string | number = (a as Record<string, unknown>)[sortKey] as string | number;
      let vb: string | number = (b as Record<string, unknown>)[sortKey] as string | number;
      if (sortKey === "createdAt" || sortKey === "no") {
        const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      }
      va = String(va ?? ""); vb = String(vb ?? "");
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [estimates, sortKey, sortDir]);

  const toggleSort = (key: EstimateSortKey) => {
    setSortKey(key);
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "desc"));
  };

  const SortTh = ({ colKey, labelKey }: { colKey: EstimateSortKey; labelKey: string }) => (
    <th className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
      <button type="button" onClick={() => toggleSort(colKey)} className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
        {l(labelKey)}
        {sortKey === colKey && (sortDir === "asc" ? " ↑" : " ↓")}
      </button>
    </th>
  );

  async function handleStatusChange(id: string, status: "approved" | "rejected") {
    let confirmHubSpotDuplicate = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`/api/estimates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, confirmHubSpotDuplicate }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        hubspotDuplicate?: unknown;
      };
      if (res.ok) {
        await mutate(() => true, undefined, { revalidate: true });
        return data;
      }
      if (res.status === 409) {
        const dup = getHubSpotDuplicateFromPayload(data);
        if (dup) {
          const msg = buildHubSpotDuplicateConfirmMessage(locale, dup);
          if (confirm(msg)) {
            confirmHubSpotDuplicate = true;
            continue;
          }
          throw new Error(HUBSPOT_DUPLICATE_CANCELLED);
        }
      }
      const errMsg =
        data.error === "pdf_required"
          ? l("admin.estimates.pdfRequiredBeforeAction")
          : typeof data.message === "string" && data.message.trim() !== ""
            ? data.message
            : typeof data.error === "string"
              ? data.error
              : `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    throw new Error(`HTTP retry exceeded`);
  }

  async function refreshEstimateInModal(id: string) {
    const res = await fetch(`/api/estimates/${id}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return;
    setSelectedEstimate(apiJsonToEstimate(data));
  }

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

      {/* フィルタバー */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <select value={filters.agencyId} onChange={(e) => setFilter("agencyId", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterAgency")}: {l("admin.estimates.all")}</option>
            {agencies.map((ag) => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
          </select>
          <select value={filters.deliveryType} onChange={(e) => setFilter("deliveryType", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterDelivery")}: {l("admin.estimates.all")}</option>
            {DELIVERY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.labelJa}</option>)}
          </select>
          <select value={filters.contractType} onChange={(e) => setFilter("contractType", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterContract")}: {l("admin.estimates.all")}</option>
            {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.labelJa}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
            <option value="">{l("admin.estimates.filterStatus")}: {l("admin.estimates.all")}</option>
            <option value="pending">{l("admin.estimates.statusPending")}</option>
            <option value="approved">{l("admin.estimates.statusApproved")}</option>
            <option value="rejected">{l("admin.estimates.statusRejected")}</option>
          </select>
          <input type="text" placeholder={l("admin.estimates.filterCustomer")} value={filters.customerName}
            onChange={(e) => setFilter("customerName", e.target.value)} className={selectCls} />
          <div className="flex items-center gap-2">
            <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className={selectCls} />
            <span className="text-[var(--color-ink-muted)]">〜</span>
            <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className={selectCls} />
          </div>
          <button type="button" onClick={resetFilters}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]">
            {l("admin.estimates.reset")}
          </button>
        </div>
        <p className="mt-2 font-body text-xs text-[var(--color-ink-muted)]">
          {isLoading ? l("common.loading") : `全 ${total} 件（このページ ${estimates.length} 件）`}
        </p>
      </div>

      {estimatesError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          データの取得に失敗しました。DB設定を確認してください。
          <span className="ml-2 font-mono text-xs opacity-70">{String(estimatesError)}</span>
        </div>
      )}

      {/* テーブル */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-sm">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <SortTh colKey="no" labelKey="admin.estimates.no" />
              <SortTh colKey="agencyName" labelKey="admin.estimates.agency" />
              <SortTh colKey="customerName" labelKey="admin.estimates.customer" />
              <SortTh colKey="deliveryType" labelKey="admin.estimates.delivery" />
              <SortTh colKey="contractType" labelKey="admin.estimates.contract" />
              <SortTh colKey="status" labelKey="admin.estimates.status" />
              <SortTh colKey="createdAt" labelKey="admin.estimates.createdAt" />
              <th className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">{l("common.loading")}</td></tr>
            ) : sortedEstimates.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">該当する見積がありません</td></tr>
            ) : sortedEstimates.map((e: Estimate) => (
              <tr key={e.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sub)] cursor-pointer"
                onClick={() => setSelectedEstimate(e)}>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-ink)]">{e.no}</td>
                <td className="px-4 py-3 text-[var(--color-ink)]">{e.agencyName}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{e.customerName}</td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">{deliveryLabel(e.deliveryType)}</td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">{contractLabel(e.contractType)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status] ?? "bg-stone-100 text-stone-600"}`}>
                    {statusLabel(locale, e.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-muted)]">{e.createdAt}</td>
                <td className="px-4 py-3">
                  <button type="button"
                    onClick={(ev) => { ev.stopPropagation(); setSelectedEstimate(e); }}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]">
                    {l("admin.estimates.detail")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3 font-body text-sm text-[var(--color-ink-muted)]">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            ページ {page} / {Math.max(1, Math.ceil(total / pageSize) || 1)}
          </span>
          <label className="inline-flex items-center gap-2">
            <span className="shrink-0">{l("admin.estimates.pageSize")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
              className={selectCls}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)] disabled:opacity-40"
          >
            前へ
          </button>
          <button
            type="button"
            disabled={isLoading || page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)] disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      </div>

      {/* 詳細モーダル */}
      {selectedEstimate && (
        <EstimateCaseDetailModal
          key={selectedEstimate.id}
          estimate={selectedEstimate}
          locale={locale}
          onClose={() => setSelectedEstimate(null)}
          onRefreshEstimate={refreshEstimateInModal}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
