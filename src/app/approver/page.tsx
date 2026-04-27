"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/translations";
import { useEstimates } from "@/hooks/use-estimates";
import type { Estimate } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import { mutate } from "swr";
import {
  alertHubSpotSyncAfterApprove,
  buildHubSpotDuplicateConfirmMessage,
  getHubSpotDuplicateFromPayload,
  HUBSPOT_DUPLICATE_CANCELLED,
} from "@/lib/hubspot-approve-feedback";
import {
  EstimateCaseDetailModal,
  apiJsonToEstimate,
} from "@/components/estimate-detail/estimate-case-detail-modal";

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
    setSelected(apiJsonToEstimate(data));
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
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (!e.pdfUrl?.trim()) {
                        alert(l("admin.estimates.pdfRequiredBeforeAction"));
                        return;
                      }
                      if (!confirm(l("admin.estimates.confirmReject"))) return;
                      void handleAction(e.id, "rejected").catch((err) => alert(String(err)));
                    }}
                    disabled={!e.pdfUrl?.trim()}
                    title={!e.pdfUrl?.trim() ? l("admin.estimates.approveRejectDisabledNoPdf") : undefined}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-400">
                    {l("admin.estimates.reject")}
                  </button>
                  <button type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (!e.pdfUrl?.trim()) {
                        alert(l("admin.estimates.pdfRequiredBeforeAction"));
                        return;
                      }
                      if (!confirm(l("admin.estimates.confirmApprove"))) return;
                      void handleAction(e.id, "approved")
                        .then((payload) => alertHubSpotSyncAfterApprove(locale, "approved", payload))
                        .catch((err) => {
                          const m = err instanceof Error ? err.message : String(err);
                          if (m !== HUBSPOT_DUPLICATE_CANCELLED) alert(m);
                        });
                    }}
                    disabled={!e.pdfUrl?.trim()}
                    title={!e.pdfUrl?.trim() ? l("admin.estimates.approveRejectDisabledNoPdf") : undefined}
                    className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {l("admin.estimates.approve")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <EstimateCaseDetailModal
          key={selected.id}
          estimate={selected}
          locale={locale}
          onClose={() => setSelected(null)}
          onRefreshEstimate={refreshEstimateInModal}
          onStatusChange={handleAction}
        />
      )}
    </div>
  );
}
