"use client";

import { useState, useMemo } from "react";
import { mutate } from "swr";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useAgencies, createAgency, updateAgency, deleteAgency } from "@/hooks/use-agencies";
import type { Agency } from "@/lib/mock-data";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "@/lib/phone-codes";

const emptyForm = (): Omit<Agency, "id" | "createdAt"> => ({
  name: "",
  email: "",
  loginPassword: "",
  agencyType: "",
  contactName: "",
  department: "",
  phoneCountryCode: DEFAULT_DIAL_CODE,
  phoneLocal: "",
  approverName: "",
  approverEmail: "",
});

export default function AdminAgentsPage() {
  const { locale } = useLocale();
  const isEn = locale === "en";
  const { agencies, isLoading } = useAgencies();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);

  type AgentSortKey = "name" | "agencyType" | "email" | "approverName" | "approverEmail" | "createdAt";
  const [sortKey, setSortKey] = useState<AgentSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedAgencies = useMemo(() => {
    const list = [...agencies];
    list.sort((a, b) => {
      const va = String((a as Record<string, unknown>)[sortKey] ?? "");
      const vb = String((b as Record<string, unknown>)[sortKey] ?? "");
      const cmp = va.localeCompare(vb, undefined, { numeric: sortKey === "createdAt" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [agencies, sortKey, sortDir]);

  const toggleSort = (key: AgentSortKey) => {
    setSortKey(key);
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
  };

  const SortTh = ({ colKey, labelKey }: { colKey: AgentSortKey; labelKey: string }) => (
    <th className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
      <button type="button" onClick={() => toggleSort(colKey)} className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
        {t(locale, labelKey)}
        {sortKey === colKey && (sortDir === "asc" ? " ↑" : " ↓")}
      </button>
    </th>
  );

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm());
    setSaveError("");
    setShowModal(true);
  };
  const openEdit = (ag: Agency) => {
    setEditId(ag.id);
    setForm({
      name: ag.name,
      email: ag.email,
      loginPassword: ag.loginPassword ?? "",
      agencyType: ag.agencyType ?? "",
      contactName: ag.contactName ?? "",
      department: ag.department ?? "",
      phoneCountryCode: ag.phoneCountryCode ?? DEFAULT_DIAL_CODE,
      phoneLocal: ag.phoneLocal ?? "",
      approverName: ag.approverName,
      approverEmail: ag.approverEmail,
    });
    setSaveError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaveError("");
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email) {
      setSaveError(t(locale, "admin.agents.validationRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateAgency(editId, { ...form, name, email });
      } else {
        await createAgency({ ...form, name, email });
      }
      setShowModal(false);
    } catch (e) {
      console.error("[admin/agents save]", e);
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t(locale, "admin.agents.deleteConfirm"))) return;
    try {
      await deleteAgency(id);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m === "delete_blocked_estimates") {
        alert(t(locale, "admin.agents.deleteBlockedEstimates"));
      } else if (m === "agency_delete_failed") {
        alert(t(locale, "admin.agents.deleteFailed"));
      } else {
        alert(m);
      }
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadBusy(true);
    try {
      const res = await fetch("/api/agencies/export-csv");
      if (!res.ok) {
        alert(`CSV ${t(locale, "admin.agents.csvDownload")}: HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agencies_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(String(err));
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/agencies/import-csv", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        created?: number;
        errors?: { line: number; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        setImportMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const errN = data.errors?.length ?? 0;
      setImportMsg(`登録 ${data.created ?? 0} 件、エラー ${errN} 件`);
      await mutate("/api/agencies");
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  };

  const inputBaseCls =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800";
  const inputCls = `w-full ${inputBaseCls}`;
  /** 国番号＋ローカル番号行（flex 内で w-full を二重に付けない） */
  const dialSelectCls = `${inputBaseCls} max-w-[min(100%,12rem)] shrink-0`;
  const localPhoneCls = `${inputBaseCls} min-w-0 flex-1 basis-0`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
            {t(locale, "admin.agentsTitle")}
          </h1>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
            {t(locale, "admin.agentsDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadCsv()}
            disabled={downloadBusy}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)] disabled:opacity-50"
          >
            {downloadBusy ? "…" : t(locale, "admin.agents.csvDownload")}
          </button>
          <label className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)]">
            {importBusy ? "…" : "CSVインポート"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importBusy}
              onChange={handleCsvImport}
            />
          </label>
          <button type="button" onClick={openAdd}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90">
            + {t(locale, "admin.agents.add")}
          </button>
        </div>
      </div>
      {importMsg && (
        <p className="font-body text-xs text-[var(--color-ink-muted)]">{importMsg}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] shadow-sm dark:border-stone-700/80">
        {isLoading ? (
          <div className="px-6 py-8 text-center font-body text-sm text-[var(--color-ink-muted)]">
            {t(locale, "common.loading")}
          </div>
        ) : (
          <table className="w-full font-body text-sm">
            <thead>
              <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
                <SortTh colKey="name" labelKey="admin.agents.name" />
                <SortTh colKey="agencyType" labelKey="admin.agents.agencyType" />
                <SortTh colKey="email" labelKey="admin.agents.email" />
                <SortTh colKey="approverName" labelKey="admin.agents.approver" />
                <SortTh colKey="approverEmail" labelKey="admin.agents.approverEmail" />
                <SortTh colKey="createdAt" labelKey="admin.agents.createdAt" />
                <th className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">{t(locale, "admin.agents.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgencies.map((ag) => (
                <tr key={ag.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{ag.name}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{ag.agencyType ?? ""}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{ag.email}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]">{ag.approverName}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{ag.approverEmail}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{ag.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(ag)}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs text-[var(--color-ink)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                        {t(locale, "admin.agents.edit")}
                      </button>
                      <button type="button" onClick={() => handleDelete(ag.id)}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                        {t(locale, "admin.agents.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-xl dark:border-stone-700/80">
            <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-ink)]">
              {editId ? t(locale, "admin.agents.edit") : t(locale, "admin.agents.add")}
            </h2>
            <div className="space-y-3">
              {/* 代理店名 */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.name")}</label>
                <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
              </div>
              {/* ログインメール */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.email")}</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
              {/* ログインパスワード */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.loginPassword")}</label>
                <input type="password" value={form.loginPassword ?? ""} onChange={(e) => setForm((p) => ({ ...p, loginPassword: e.target.value }))} className={inputCls} placeholder="••••••••" />
                <p className="mt-1 font-body text-xs text-[var(--color-ink-muted)]">{t(locale, "admin.agents.loginPasswordHint")}</p>
              </div>
              {/* 代理店種別 */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.agencyType")}</label>
                <input type="text" value={form.agencyType ?? ""} onChange={(e) => setForm((p) => ({ ...p, agencyType: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.contactName")}</label>
                <input type="text" value={form.contactName ?? ""} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.department")}</label>
                <input type="text" value={form.department ?? ""} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className={inputCls} />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.phone")}</label>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <select
                    value={form.phoneCountryCode ?? DEFAULT_DIAL_CODE}
                    onChange={(e) => setForm((p) => ({ ...p, phoneCountryCode: e.target.value }))}
                    className={dialSelectCls}
                    aria-label={t(locale, "admin.agents.phone")}
                  >
                    {COUNTRY_DIAL_CODES.map((o) => (
                      <option key={o.value} value={o.value}>{isEn ? o.labelEn : o.labelJa}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={form.phoneLocal ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, phoneLocal: e.target.value }))}
                    className={localPhoneCls}
                    placeholder="3-1234-5678"
                  />
                </div>
              </div>
              {/* 承認者名 */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.approver")}</label>
                <input type="text" value={form.approverName} onChange={(e) => setForm((p) => ({ ...p, approverName: e.target.value }))} className={inputCls} />
              </div>
              {/* 承認者メール */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">{t(locale, "admin.agents.approverEmail")}</label>
                <input type="email" value={form.approverEmail} onChange={(e) => setForm((p) => ({ ...p, approverEmail: e.target.value }))} className={inputCls} />
              </div>
            </div>
            {saveError && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                {saveError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setSaveError("");
                }}
                className="rounded-lg border border-stone-300 px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
              >
                {t(locale, "admin.agents.cancel")}
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                {saving ? t(locale, "common.loading") : t(locale, "admin.agents.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
