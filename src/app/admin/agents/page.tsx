"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useAgencies, createAgency, updateAgency, deleteAgency } from "@/hooks/use-agencies";
import type { Agency } from "@/lib/mock-data";

const emptyForm = (): Omit<Agency, "id" | "createdAt"> => ({
  name: "", email: "", loginPassword: "", agencyType: "", approverName: "", approverEmail: "",
});

export default function AdminAgentsPage() {
  const { locale } = useLocale();
  const { agencies, isLoading } = useAgencies();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditId(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (ag: Agency) => {
    setEditId(ag.id);
    setForm({ name: ag.name, email: ag.email, loginPassword: ag.loginPassword ?? "", agencyType: ag.agencyType ?? "", approverName: ag.approverName, approverEmail: ag.approverEmail });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) { await updateAgency(editId, form); }
      else { await createAgency(form); }
      setShowModal(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t(locale, "admin.agents.deleteConfirm"))) return;
    await deleteAgency(id);
  };

  const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800";

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
        <button type="button" onClick={openAdd}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90">
          + {t(locale, "admin.agents.add")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] shadow-sm dark:border-stone-700/80">
        {isLoading ? (
          <div className="px-6 py-8 text-center font-body text-sm text-[var(--color-ink-muted)]">
            {t(locale, "common.loading")}
          </div>
        ) : (
          <table className="w-full font-body text-sm">
            <thead>
              <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
                {["admin.agents.name","admin.agents.agencyType","admin.agents.email","admin.agents.approver","admin.agents.approverEmail","admin.agents.createdAt","admin.agents.actions"].map((k) => (
                  <th key={k} className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">{t(locale, k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agencies.map((ag) => (
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
          <div className="w-full max-w-md rounded-2xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-xl dark:border-stone-700/80">
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
                <p className="mt-1 font-body text-xs text-[var(--color-ink-muted)]">{t(locale, "admin.agents.agencyTypeHint")}</p>
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
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                {t(locale, "admin.agents.cancel")}
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
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
