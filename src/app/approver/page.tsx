"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/translations";
import { useEstimates } from "@/hooks/use-estimates";
import type { Estimate } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import { mutate } from "swr";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function deliveryLabel(v: string) {
  return DELIVERY_TYPES.find((d) => d.value === v)?.labelJa ?? v;
}
function contractLabel(v: string) {
  return CONTRACT_TYPES.find((c) => c.value === v)?.labelJa ?? v;
}

// ── 詳細モーダル ─────────────────────────────────────────────
type DetailModalProps = {
  estimate: Estimate;
  locale: "ja" | "en";
  onClose: () => void;
  onAction: (id: string, status: "approved" | "rejected") => Promise<void>;
};

function DetailModal({ estimate: e, locale, onClose, onAction }: DetailModalProps) {
  const l = (k: string) => t(locale, k);
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const formInputs = (e as Estimate & { formInputs?: Record<string, unknown> }).formInputs ?? {};

  async function handle(status: "approved" | "rejected") {
    const msg = status === "approved" ? l("admin.estimates.confirmApprove") : l("admin.estimates.confirmReject");
    if (!confirm(msg)) return;
    setLoading(status);
    try {
      await onAction(e.id, status);
      onClose();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">{e.no}</p>
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{e.customerName}</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[e.status] ?? ""}`}>
            {t(locale, `admin.estimates.status${e.status.charAt(0).toUpperCase()}${e.status.slice(1)}`)}
          </span>
        </div>

        <div className="divide-y divide-[var(--color-border)] overflow-y-auto px-6" style={{ maxHeight: "52vh" }}>
          {[
            ["代理店", e.agencyName],
            ["顧客名", e.customerName],
            ["提供形態", deliveryLabel(e.deliveryType)],
            ["契約形態", contractLabel(e.contractType)],
            ["申請日", e.createdAt],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-3">
              <span className="font-body text-sm text-[var(--color-ink-muted)]">{label}</span>
              <span className="font-body text-sm text-[var(--color-ink)]">{value}</span>
            </div>
          ))}

          {Object.keys(formInputs).length > 0 && (
            <div className="py-3">
              <p className="mb-2 font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.estimates.formInputs")}</p>
              <div className="rounded-lg bg-[var(--color-surface)] p-3 space-y-1">
                {Object.entries(formInputs).map(([k, v]) => (
                  <div key={k} className="flex gap-2 font-mono text-xs">
                    <span className="shrink-0 text-[var(--color-ink-subtle)]">{k}:</span>
                    <span className="text-[var(--color-ink)]">{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 見積書ダウンロード */}
          {(e as Estimate & { excelUrl?: string }).excelUrl && (
            <div className="py-3">
              <a
                href={(e as Estimate & { excelUrl?: string }).excelUrl}
                download
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {l("admin.estimates.downloadExcel")}
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]">
            {l("admin.estimates.closeModal")}
          </button>
          {e.status === "pending" && (
            <div className="flex gap-2">
              <button type="button" onClick={() => handle("rejected")} disabled={loading !== null}
                className="rounded-lg border border-red-300 px-4 py-2 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400">
                {loading === "rejected" ? l("admin.estimates.approving") : l("admin.estimates.reject")}
              </button>
              <button type="button" onClick={() => handle("approved")} disabled={loading !== null}
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
export default function ApproverPage() {
  const { locale } = useLocale();
  const { user } = useAuth();
  const l = (k: string) => t(locale, k);

  // 承認者は自分の agencyId に紐づく見積のみ表示
  const { estimates, isLoading, error } = useEstimates(
    user?.agencyId ? { agencyId: user.agencyId } : {},
  );

  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [selected, setSelected] = useState<Estimate | null>(null);

  const displayed = tab === "pending"
    ? estimates.filter((e) => e.status === "pending")
    : estimates;

  async function handleAction(id: string, status: "approved" | "rejected") {
    const res = await fetch(`/api/estimates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(await res.text());
    await mutate(() => true, undefined, { revalidate: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {l("approver.title")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {l("approver.description")}
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sub)] p-1 w-fit">
        {(["pending", "all"] as const).map((v) => (
          <button key={v} type="button"
            onClick={() => setTab(v)}
            className={`rounded-lg px-4 py-1.5 font-body text-sm transition ${
              tab === v
                ? "bg-[var(--color-surface-elevated)] font-medium text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}>
            {v === "pending" ? l("admin.estimates.statusPending") : "すべて"}
            {v === "pending" && !isLoading && estimates.filter((e) => e.status === "pending").length > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs text-white">
                {estimates.filter((e) => e.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          データの取得に失敗しました。
        </div>
      )}

      {/* 一覧 */}
      {isLoading ? (
        <div className="py-12 text-center font-body text-sm text-[var(--color-ink-muted)]">{l("common.loading")}</div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-12 text-center">
          <p className="font-body text-sm text-[var(--color-ink-muted)]">{l("approver.noPending")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((e) => (
            <div key={e.id}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-4 hover:bg-[var(--color-surface-sub)] cursor-pointer transition"
              onClick={() => setSelected(e)}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--color-ink-muted)]">{e.no}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status] ?? ""}`}>
                    {t(locale, `admin.estimates.status${e.status.charAt(0).toUpperCase()}${e.status.slice(1)}`)}
                  </span>
                </div>
                <p className="font-body text-sm font-medium text-[var(--color-ink)]">{e.customerName}</p>
                <p className="font-body text-xs text-[var(--color-ink-muted)]">
                  {deliveryLabel(e.deliveryType)} / {contractLabel(e.contractType)} — {e.createdAt}
                </p>
              </div>
              {e.status === "pending" && (
                <div className="flex gap-2 shrink-0 ml-4">
                  <button type="button"
                    onClick={(ev) => { ev.stopPropagation(); if (confirm(l("admin.estimates.confirmReject"))) handleAction(e.id, "rejected"); }}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400">
                    {l("admin.estimates.reject")}
                  </button>
                  <button type="button"
                    onClick={(ev) => { ev.stopPropagation(); if (confirm(l("admin.estimates.confirmApprove"))) handleAction(e.id, "approved"); }}
                    className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {l("admin.estimates.approve")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          estimate={selected}
          locale={locale}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
