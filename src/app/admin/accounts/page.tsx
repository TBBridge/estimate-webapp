"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";

type SystemUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "approver";
  createdAt: string;
};

type FormData = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "approver";
};

const KEY = "/api/system-users";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

const emptyForm = (): FormData => ({ name: "", email: "", password: "", role: "approver" });

export default function AdminAccountsPage() {
  const { locale } = useLocale();
  const { data: users = [], isLoading } = useSWR<SystemUser[]>(KEY, fetcher);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800";

  const openAdd = () => { setEditId(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (u: SystemUser) => {
    setEditId(u.id);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = editId
        ? await fetch(`${KEY}/${editId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        : await fetch(KEY, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
      if (!res.ok) throw new Error(await res.text());
      await mutate(KEY);
      setShowModal(false);
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t(locale, "admin.accounts.deleteConfirm"))) return;
    await fetch(`${KEY}/${id}`, { method: "DELETE" });
    await mutate(KEY);
  };

  const roleLabel = (role: string) =>
    role === "admin"
      ? t(locale, "admin.accounts.role.admin")
      : t(locale, "admin.accounts.role.approver");

  const roleBadgeCls = (role: string) =>
    role === "admin"
      ? "inline-flex items-center rounded-full bg-[var(--color-brand-muted)] px-2 py-0.5 font-body text-xs font-medium text-[var(--color-brand)]"
      : "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-body text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
            {t(locale, "admin.accountsTitle")}
          </h1>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
            {t(locale, "admin.accountsDescription")}
          </p>
        </div>
        <button type="button" onClick={openAdd}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90">
          + {t(locale, "admin.accounts.add")}
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
                {[
                  "admin.accounts.name",
                  "admin.accounts.email",
                  "admin.accounts.role",
                  "admin.accounts.createdAt",
                  "admin.accounts.actions",
                ].map((k) => (
                  <th key={k} className="px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
                    {t(locale, k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{u.name}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={roleBadgeCls(u.role)}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">{u.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(u)}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs text-[var(--color-ink)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                        {t(locale, "admin.accounts.edit")}
                      </button>
                      <button type="button" onClick={() => handleDelete(u.id)}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                        {t(locale, "admin.accounts.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">
                    アカウントがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-xl dark:border-stone-700/80">
            <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-ink)]">
              {editId ? t(locale, "admin.accounts.edit") : t(locale, "admin.accounts.add")}
            </h2>
            <div className="space-y-3">
              {/* 氏名 */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">
                  {t(locale, "admin.accounts.name")}
                </label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* メールアドレス */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">
                  {t(locale, "admin.accounts.email")}
                </label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* パスワード */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">
                  {t(locale, "admin.accounts.password")}
                </label>
                <input type="password" value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  className={inputCls} placeholder="••••••••" />
                {editId && (
                  <p className="mt-1 font-body text-xs text-[var(--color-ink-muted)]">
                    {t(locale, "admin.accounts.passwordHint")}
                  </p>
                )}
              </div>
              {/* ロール */}
              <div>
                <label className="mb-1 block font-body text-sm text-[var(--color-ink-muted)]">
                  {t(locale, "admin.accounts.role")}
                </label>
                <select value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as "admin" | "approver" }))}
                  className={inputCls}>
                  <option value="admin">{t(locale, "admin.accounts.role.admin")}</option>
                  <option value="approver">{t(locale, "admin.accounts.role.approver")}</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                {t(locale, "admin.accounts.cancel")}
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                {saving ? t(locale, "common.loading") : t(locale, "admin.accounts.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
