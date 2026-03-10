"use client";

import { useState, useMemo } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useEstimates } from "@/hooks/use-estimates";
import { useAgencies } from "@/hooks/use-agencies";
import type { Estimate, EstimateStatus } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import { mutate } from "swr";

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

// ── 詳細モーダル ─────────────────────────────────────────────
type DetailModalProps = {
  estimate: Estimate;
  locale: "ja" | "en";
  onClose: () => void;
  onStatusChange: (id: string, status: "approved" | "rejected") => Promise<void>;
};

function DetailModal({ estimate: e, locale, onClose, onStatusChange }: DetailModalProps) {
  const l = (k: string) => t(locale, k);
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);

  const formInputs = (e as Estimate & { formInputs?: Record<string, unknown> }).formInputs ?? {};

  async function handleAction(status: "approved" | "rejected") {
    const msg = status === "approved" ? l("admin.estimates.confirmApprove") : l("admin.estimates.confirmReject");
    if (!confirm(msg)) return;
    setLoading(status);
    await onStatusChange(e.id, status);
    setLoading(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">{e.no}</p>
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{e.customerName}</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[e.status] ?? ""}`}>
            {statusLabel(locale, e.status)}
          </span>
        </div>

        {/* 申請内容 */}
        <div className="space-y-0 divide-y divide-[var(--color-border)] overflow-y-auto px-6" style={{ maxHeight: "55vh" }}>
          {[
            ["代理店", e.agencyName],
            ["提供形態", deliveryLabel(e.deliveryType)],
            ["契約形態", contractLabel(e.contractType)],
            ["申請日", e.createdAt],
            ["承認日", e.approvedAt ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-3">
              <span className="font-body text-sm text-[var(--color-ink-muted)]">{label}</span>
              <span className="font-body text-sm text-[var(--color-ink)]">{value}</span>
            </div>
          ))}

          {/* フォーム入力内容 */}
          {Object.keys(formInputs).length > 0 && (
            <div className="py-3">
              <p className="mb-2 font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.estimates.formInputs")}</p>
              <div className="rounded-lg bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-ink-muted)] space-y-1">
                {Object.entries(formInputs).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="shrink-0 text-[var(--color-ink-subtle)]">{k}:</span>
                    <span className="text-[var(--color-ink)]">{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* アクション */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]">
            {l("admin.estimates.closeModal")}
          </button>
          {e.status === "pending" && (
            <div className="flex gap-2">
              <button type="button"
                onClick={() => handleAction("rejected")}
                disabled={loading !== null}
                className="rounded-lg border border-red-300 px-4 py-2 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30">
                {loading === "rejected" ? l("admin.estimates.approving") : l("admin.estimates.reject")}
              </button>
              <button type="button"
                onClick={() => handleAction("approved")}
                disabled={loading !== null}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {loading === "approved" ? l("admin.estimates.approving") : l("admin.estimates.approve")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const { estimates, isLoading, error: estimatesError } = useEstimates(activeFilters);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  async function handleStatusChange(id: string, status: "approved" | "rejected") {
    const res = await fetch(`/api/estimates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(await res.text());
    // SWR キャッシュを無効化して再フェッチ
    await mutate(() => true, undefined, { revalidate: true });
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
          {isLoading ? l("common.loading") : `${estimates.length} 件`}
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
              {[
                "admin.estimates.no", "admin.estimates.agency", "admin.estimates.customer",
                "admin.estimates.delivery", "admin.estimates.contract",
                "admin.estimates.status", "admin.estimates.createdAt", "",
              ].map((k, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
                  {k ? l(k) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">{l("common.loading")}</td></tr>
            ) : estimates.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">該当する見積がありません</td></tr>
            ) : estimates.map((e: Estimate) => (
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

      {/* 詳細モーダル */}
      {selectedEstimate && (
        <DetailModal
          estimate={selectedEstimate}
          locale={locale}
          onClose={() => setSelectedEstimate(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
