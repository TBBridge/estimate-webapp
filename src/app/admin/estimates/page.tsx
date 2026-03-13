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
  const [pdfState, setPdfState] = useState<{ url?: string; generating: boolean; error?: string }>({
    url: (e as Estimate & { pdfUrl?: string }).pdfUrl,
    generating: false,
  });

  const formInputs = (e as Estimate & { formInputs?: Record<string, unknown> }).formInputs ?? {};

  async function handleGeneratePdf() {
    setPdfState({ generating: true });
    try {
      const res = await fetch(`/api/estimates/${e.id}/generate-pdf`, { method: "POST" });
      const text = await res.text();
      let data: { pdfUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        setPdfState({ generating: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` });
        return;
      }
      if (!res.ok || !data.pdfUrl) {
        setPdfState({ generating: false, error: data.error ?? l("admin.estimates.generatePdfError") });
      } else {
        setPdfState({ url: data.pdfUrl, generating: false });
        await mutate(() => true, undefined, { revalidate: true });
      }
    } catch (err) {
      setPdfState({ generating: false, error: String(err) });
    }
  }

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

          {/* 見積書ダウンロード（管理者: Excel + PDF 両方） */}
          {(e as Estimate & { excelUrl?: string }).excelUrl && (
            <div className="py-3">
              <p className="mb-2 font-body text-xs font-medium text-[var(--color-ink-muted)]">見積書</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={(e as Estimate & { excelUrl?: string }).excelUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 px-3 py-1.5 font-body text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {l("admin.estimates.downloadExcel")}
                </a>

                {pdfState.url ? (
                  <a
                    href={pdfState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {l("admin.estimates.downloadPdf")}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={pdfState.generating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 disabled:opacity-50"
                  >
                    {pdfState.generating ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {l("admin.estimates.generatingPdf")}
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {l("admin.estimates.generatePdf")}
                      </>
                    )}
                  </button>
                )}
                {pdfState.error && (
                  <p className="w-full font-body text-xs text-red-600">{pdfState.error}</p>
                )}
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

  type EstimateSortKey = "no" | "agencyName" | "customerName" | "deliveryType" | "contractType" | "status" | "createdAt";
  const [sortKey, setSortKey] = useState<EstimateSortKey>("createdAt");
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
