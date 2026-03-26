"use client";

import { useState, useEffect, useRef } from "react";
import { mutate } from "swr";
import type { Estimate } from "@/lib/mock-data";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";
import { EstimateApplicationDetail } from "@/components/estimate-detail/estimate-application-detail";
import { alertKintoneSalesSyncAfterApprove } from "@/lib/kintone-approve-feedback";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function statusLabel(locale: Locale, s: string) {
  const map: Record<string, string> = {
    pending: t(locale, "admin.estimates.statusPending"),
    approved: t(locale, "admin.estimates.statusApproved"),
    rejected: t(locale, "admin.estimates.statusRejected"),
  };
  return map[s] ?? s;
}

export function apiJsonToEstimate(d: Record<string, unknown>): Estimate {
  return {
    id: String(d.id),
    no: String(d.no),
    agencyId: String(d.agencyId),
    agencyName: String(d.agencyName),
    customerName: String(d.customerName),
    deliveryType: d.deliveryType as Estimate["deliveryType"],
    contractType: d.contractType as Estimate["contractType"],
    cloudBilling: d.cloudBilling ? String(d.cloudBilling) : undefined,
    amount: Number(d.amount),
    maintenanceFee: Number(d.maintenanceFee),
    formInputs: (d.formInputs as Record<string, unknown>) ?? {},
    excelUrl: String(d.excelUrl ?? ""),
    pdfUrl: String(d.pdfUrl ?? ""),
    status: d.status as Estimate["status"],
    createdAt: String(d.createdAt),
    approvedAt: d.approvedAt ? String(d.approvedAt) : undefined,
  };
}

type Props = {
  estimate: Estimate;
  locale: Locale;
  onClose: () => void;
  /** 詳細を GET で取り直して親の selected を更新する */
  onRefreshEstimate: (id: string) => Promise<void>;
  onStatusChange?: (id: string, status: "approved" | "rejected") => Promise<unknown>;
};

export function EstimateCaseDetailModal({
  estimate: e,
  locale,
  onClose,
  onRefreshEstimate,
  onStatusChange,
}: Props) {
  const l = (k: string) => t(locale, k);
  const pdfFromRow = e.pdfUrl && String(e.pdfUrl).trim() ? String(e.pdfUrl) : undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<"approved" | "rejected" | null>(null);
  const [customerName, setCustomerName] = useState(e.customerName);
  const [agencyName, setAgencyName] = useState(e.agencyName);
  const [amountStr, setAmountStr] = useState(String(e.amount));
  const [maintStr, setMaintStr] = useState(String(e.maintenanceFee));
  const [formJson, setFormJson] = useState(() => JSON.stringify(e.formInputs ?? {}, null, 2));
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [pdfState, setPdfState] = useState<{
    url?: string;
    generating: boolean;
    error?: string;
  }>({ url: pdfFromRow || undefined, generating: false });

  const [excelBusy, setExcelBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPdfState((prev) => {
      if (prev.generating) return prev;
      const u = pdfFromRow;
      return { url: u, generating: false, error: u ? undefined : prev.error };
    });
  }, [e.id, e.excelUrl, pdfFromRow]);

  useEffect(() => {
    if (editOpen) {
      setCustomerName(e.customerName);
      setAgencyName(e.agencyName);
      setAmountStr(String(e.amount));
      setMaintStr(String(e.maintenanceFee));
      setFormJson(JSON.stringify(e.formInputs ?? {}, null, 2));
      setEditError("");
    }
  }, [editOpen, e.id, e.customerName, e.agencyName, e.amount, e.maintenanceFee, e.formInputs]);

  async function handleGeneratePdf() {
    setPdfState({ generating: true, error: undefined });
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
        await onRefreshEstimate(e.id);
        await mutate(() => true, undefined, { revalidate: true });
      }
    } catch (err) {
      setPdfState({ generating: false, error: String(err) });
    }
  }

  async function saveEdit() {
    let formInputs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(formJson) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setEditError(l("admin.estimates.editFormJsonInvalid"));
        return;
      }
      formInputs = parsed as Record<string, unknown>;
    } catch {
      setEditError(l("admin.estimates.editFormJsonInvalid"));
      return;
    }

    const amount = Math.floor(Number(amountStr));
    const maintenanceFee = Math.floor(Number(maintStr));
    if (!Number.isFinite(amount) || amount < 0) {
      setEditError(l("admin.estimates.editAmountInvalid"));
      return;
    }
    if (!Number.isFinite(maintenanceFee) || maintenanceFee < 0) {
      setEditError(l("admin.estimates.editMaintInvalid"));
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(`/api/estimates/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          agencyName: agencyName.trim(),
          amount,
          maintenanceFee,
          formInputs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
        return;
      }
      await onRefreshEstimate(e.id);
      await mutate(() => true, undefined, { revalidate: true });
      setEditOpen(false);
    } catch (err) {
      setEditError(String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleExcelSelected(file: File | undefined) {
    if (!file) return;
    setExcelBusy(true);
    setPdfState({ url: undefined, generating: true, error: undefined });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/estimates/${e.id}/upload-excel`, { method: "POST", body: fd });
      const data = (await res.json()) as { excelUrl?: string; pdfUrl?: string; pdfError?: string; error?: string };
      if (!res.ok) {
        setPdfState({ generating: false, error: data.error ?? l("admin.estimates.excelUploadError") });
        return;
      }
      await onRefreshEstimate(e.id);
      await mutate(() => true, undefined, { revalidate: true });
      if (data.pdfUrl) {
        setPdfState({ url: data.pdfUrl, generating: false });
      } else {
        setPdfState({
          generating: false,
          error: data.pdfError ?? l("admin.estimates.pdfRegenFailed"),
        });
      }
    } catch (err) {
      setPdfState({ generating: false, error: String(err) });
    } finally {
      setExcelBusy(false);
    }
  }

  async function handleAction(status: "approved" | "rejected") {
    if (!onStatusChange) return;
    const msg =
      status === "approved" ? l("admin.estimates.confirmApprove") : l("admin.estimates.confirmReject");
    if (!confirm(msg)) return;
    setActionLoading(status);
    try {
      const payload = await onStatusChange(e.id, status);
      alertKintoneSalesSyncAfterApprove(locale, status, payload);
    } finally {
      setActionLoading(null);
      onClose();
    }
  }

  const excelUrl = e.excelUrl && String(e.excelUrl).trim() ? String(e.excelUrl) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-6 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">{e.no}</p>
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{e.customerName}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)]"
            >
              {editOpen ? l("admin.estimates.editCancel") : l("admin.estimates.editOpen")}
            </button>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[e.status] ?? ""}`}>
              {statusLabel(locale, e.status)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {editOpen ? (
            <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.estimates.editSectionTitle")}</p>
              <label className="block">
                <span className="font-body text-xs text-[var(--color-ink-muted)]">{l("admin.estimates.customer")}</span>
                <input
                  value={customerName}
                  onChange={(ev) => setCustomerName(ev.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 font-body text-sm"
                />
              </label>
              <label className="block">
                <span className="font-body text-xs text-[var(--color-ink-muted)]">{l("admin.estimates.agency")}</span>
                <input
                  value={agencyName}
                  onChange={(ev) => setAgencyName(ev.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 font-body text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="block flex-1 min-w-[8rem]">
                  <span className="font-body text-xs text-[var(--color-ink-muted)]">{l("admin.estimates.amount")}</span>
                  <input
                    type="number"
                    min={0}
                    value={amountStr}
                    onChange={(ev) => setAmountStr(ev.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 font-body text-sm"
                  />
                </label>
                <label className="block flex-1 min-w-[8rem]">
                  <span className="font-body text-xs text-[var(--color-ink-muted)]">
                    {l("admin.estimates.maintenanceFeeShort")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={maintStr}
                    onChange={(ev) => setMaintStr(ev.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 font-body text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="font-body text-xs text-[var(--color-ink-muted)]">{l("admin.estimates.editFormJsonLabel")}</span>
                <textarea
                  value={formJson}
                  onChange={(ev) => setFormJson(ev.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-stone-950/5 px-3 py-2 font-mono text-xs text-[var(--color-ink)] dark:bg-stone-950/40"
                />
              </label>
              {editError && <p className="font-body text-sm text-red-600">{editError}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={saveEdit}
                  className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingEdit ? l("common.loading") : l("admin.estimates.editSave")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink-muted)]"
                >
                  {l("admin.estimates.editCancel")}
                </button>
              </div>
            </div>
          ) : (
            <EstimateApplicationDetail estimate={e} locale={locale} />
          )}
        </div>

        <div className="shrink-0 space-y-0 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] px-6">
          {excelUrl ? (
            <div className="py-3">
              <p className="mb-2 font-body text-xs font-medium text-[var(--color-ink-muted)]">
                {l("admin.estimates.estimateDocuments")}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  void handleExcelSelected(f);
                  ev.target.value = "";
                }}
              />
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={excelBusy || pdfState.generating}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 px-3 py-1.5 font-body text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-950/30"
                >
                  {excelBusy ? l("admin.estimates.excelUploading") : l("admin.estimates.replaceExcel")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={excelUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 px-3 py-1.5 font-body text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {l("admin.estimates.downloadExcel")}
                </a>

                {pdfState.url && !pdfState.generating ? (
                  <a
                    href={pdfState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    {l("admin.estimates.downloadPdf")}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={pdfState.generating || excelBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 disabled:opacity-50"
                  >
                    {pdfState.generating ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        {l("admin.estimates.generatingPdf")}
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        {l("admin.estimates.generatePdf")}
                      </>
                    )}
                  </button>
                )}
                {pdfState.error && (
                  <p className="w-full font-body text-xs text-red-600 dark:text-red-400">{pdfState.error}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]"
          >
            {l("admin.estimates.closeModal")}
          </button>
          {onStatusChange && e.status === "pending" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAction("rejected")}
                disabled={savingEdit || excelBusy || pdfState.generating || actionLoading !== null}
                className="rounded-lg border border-red-300 px-4 py-2 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                {actionLoading === "rejected" ? l("admin.estimates.approving") : l("admin.estimates.reject")}
              </button>
              <button
                type="button"
                onClick={() => void handleAction("approved")}
                disabled={savingEdit || excelBusy || pdfState.generating || actionLoading !== null}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === "approved" ? l("admin.estimates.approving") : l("admin.estimates.approve")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
