"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useMarginRates, updateMarginRate, createMarginRate, deleteMarginRate } from "@/hooks/use-margin-rates";
import { useMaintenanceRates, updateMaintenanceRate, createMaintenanceRate, deleteMaintenanceRate } from "@/hooks/use-maintenance-rates";
import { useUnitPrices, updateUnitPriceTiers } from "@/hooks/use-unit-prices";
import { useAgencies } from "@/hooks/use-agencies";
import { MOCK_TEMPLATES, type TemplateDef, type PriceTier } from "@/lib/mock-data";
import { PRODUCTS, type MarginRate, type MaintenanceRate, type UnitPrice } from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

type Tab = "margin" | "maintenance" | "unitPrice" | "template";

const thCls = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]";
const tdCls = "px-4 py-3";

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center font-body text-sm text-[var(--color-ink-muted)]">
        読み込み中…
      </td>
    </tr>
  );
}

// ── 仕切り率（本製品）──────────────────────────────────
function MarginTab({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { marginRates, isLoading: ratesLoading } = useMarginRates();
  const { agencies, isLoading: agenciesLoading } = useAgencies();

  const [activeAgencyId, setActiveAgencyId] = useState<string>("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [saving, setSaving] = useState(false);

  // 新規追加モーダル用
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductId, setNewProductId] = useState<string>(PRODUCTS[0].id);
  const [newDeliveryType, setNewDeliveryType] = useState("onprem");
  const [newRate, setNewRate] = useState("70");

  const isLoading = ratesLoading || agenciesLoading;
  const currentAgencyId = activeAgencyId || agencies[0]?.id || "";
  const currentAgency = agencies.find((a) => a.id === currentAgencyId);
  const agencyRows = marginRates.filter((r) => r.agencyId === currentAgencyId);

  const productOf = (id: string) => PRODUCTS.find((p) => p.id === id);
  const deliveryLabel = (dt: string) => DELIVERY_TYPES.find((d) => d.value === dt)?.labelJa ?? dt;

  const startEdit = (r: MarginRate) => {
    setEditId(r.id);
    setEditRate(String(Math.round(r.rate * 1000) / 10));
  };

  const save = async (id: string) => {
    setSaving(true);
    try { await updateMarginRate(id, Number(editRate) / 100); setEditId(null); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(l("admin.masters.confirmDeleteRate"))) return;
    setSaving(true);
    try { await deleteMarginRate(id); }
    finally { setSaving(false); }
  };

  const handleAddAllProducts = async () => {
    if (!currentAgency) return;
    if (!confirm(`${currentAgency.name} の全製品×提供形態の仕切り率を一括追加しますか？（既存は上書きされません）`)) return;
    setSaving(true);
    try {
      for (const p of PRODUCTS) {
        const deliveryTypes = p.isOption ? ["onprem"] : ["onprem", "subscription", "cloud"];
        for (const dt of deliveryTypes) {
          const exists = marginRates.find(
            (r) => r.agencyId === currentAgencyId && r.productId === p.id && r.deliveryType === dt
          );
          if (!exists) {
            await createMarginRate(currentAgencyId, currentAgency.name, p.id, dt, 0.70);
          }
        }
      }
    } finally { setSaving(false); }
  };

  const handleAddSingle = async () => {
    if (!currentAgency) return;
    setSaving(true);
    try {
      await createMarginRate(currentAgencyId, currentAgency.name, newProductId, newDeliveryType, Number(newRate) / 100);
      setShowAddModal(false);
    } finally { setSaving(false); }
  };

  return (
    <div>
      {/* 代理店タブ */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-stone-200/80 px-4 pt-4 dark:border-stone-700/80">
        {isLoading ? (
          <span className="px-4 py-2 font-body text-sm text-[var(--color-ink-muted)]">読み込み中…</span>
        ) : agencies.length === 0 ? (
          <span className="px-4 py-2 font-body text-sm text-[var(--color-ink-muted)]">代理店が登録されていません</span>
        ) : agencies.map((ag) => (
          <button key={ag.id} type="button"
            onClick={() => { setActiveAgencyId(ag.id); setEditId(null); setShowAddModal(false); }}
            className={`shrink-0 rounded-t-lg px-4 py-2 font-body text-sm transition ${
              currentAgencyId === ag.id
                ? "border-b-2 border-[var(--color-brand)] font-medium text-[var(--color-brand)]"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}>
            {ag.name}
          </button>
        ))}
      </div>

      {/* ツールバー */}
      {currentAgency && (
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-body text-xs text-[var(--color-ink-muted)]">
            {agencyRows.length} 件設定済み
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleAddAllProducts} disabled={saving}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 font-body text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)] disabled:opacity-50">
              {l("admin.masters.addAllProducts")}
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} disabled={saving}
              className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 font-body text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
              + {l("admin.masters.addRate")}
            </button>
          </div>
        </div>
      )}

      {/* 新規追加モーダル */}
      {showAddModal && currentAgency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-xl">
            <h3 className="mb-4 font-display text-base font-semibold text-[var(--color-ink)]">
              仕切り率を追加 — {currentAgency.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block font-body text-sm text-[var(--color-ink-muted)]">製品</label>
                <select value={newProductId} onChange={(e) => setNewProductId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40">
                  {PRODUCTS.map((p) => (
                    <option key={p.id} value={p.id}>{p.nameJa}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-body text-sm text-[var(--color-ink-muted)]">提供形態</label>
                <select value={newDeliveryType} onChange={(e) => setNewDeliveryType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40">
                  {DELIVERY_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.labelJa}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-body text-sm text-[var(--color-ink-muted)]">{l("admin.masters.ratePercent")}</label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="number" min={0} max={100} step={0.1} value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40" />
                  <span className="font-body text-sm text-[var(--color-ink-muted)]">%</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]">
                {l("admin.masters.cancel")}
              </button>
              <button type="button" onClick={handleAddSingle} disabled={saving}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "保存中…" : l("admin.masters.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              {["admin.masters.product","admin.masters.deliveryType","admin.masters.rate","admin.masters.edit",""].map((k, i) => (
                <th key={i} className={thCls}>{k ? l(k) : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <LoadingRow cols={5} /> :
             agencyRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center font-body text-sm text-[var(--color-ink-muted)]">
                  仕切り率が設定されていません。「全製品を一括追加」または「＋ 仕切り率を追加」で設定してください。
                </td>
              </tr>
            ) : agencyRows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                <td className={tdCls}>
                  <span className={`inline-flex items-center gap-1 font-medium text-[var(--color-ink)] ${productOf(r.productId)?.isOption ? "pl-3" : ""}`}>
                    {productOf(r.productId)?.isOption && <span className="text-[var(--color-ink-muted)]">└</span>}
                    {productOf(r.productId)?.nameJa ?? r.productId}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs dark:bg-stone-800">{deliveryLabel(r.deliveryType)}</span>
                </td>
                <td className={tdCls}>
                  {editId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} step={0.1} value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        className="w-20 rounded-lg border border-stone-300 px-2 py-1 font-body text-sm dark:border-stone-600 dark:bg-stone-800" />
                      <span className="text-[var(--color-ink-muted)]">%</span>
                    </div>
                  ) : <span className="font-medium">{Math.round(r.rate * 1000) / 10} %</span>}
                </td>
                <td className={tdCls}>
                  {editId === r.id ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => save(r.id)}
                        className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-60">
                        {l("admin.masters.save")}
                      </button>
                      <button type="button" onClick={() => setEditId(null)}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                        {l("admin.masters.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startEdit(r)}
                      className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                      {l("admin.masters.edit")}
                    </button>
                  )}
                </td>
                <td className={tdCls}>
                  <button type="button" onClick={() => handleDelete(r.id)} disabled={saving}
                    className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20">
                    {l("admin.masters.deleteRate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 仕切り率（保守）──────────────────────────────────
function MaintenanceTab({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { maintenanceRates, isLoading: ratesLoading } = useMaintenanceRates();
  const { agencies, isLoading: agenciesLoading } = useAgencies();

  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [saving, setSaving] = useState(false);

  // 新規追加用
  const [addingAgencyId, setAddingAgencyId] = useState<string | null>(null);
  const [newRate, setNewRate] = useState("70");

  const isLoading = ratesLoading || agenciesLoading;

  const rateByAgency = new Map(maintenanceRates.map((r) => [r.agencyId, r]));

  const startEdit = (r: MaintenanceRate) => {
    setEditId(r.id);
    setEditRate(String(Math.round(r.rate * 1000) / 10));
  };

  const save = async (id: string) => {
    setSaving(true);
    try { await updateMaintenanceRate(id, Number(editRate) / 100); setEditId(null); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(l("admin.masters.confirmDeleteRate"))) return;
    setSaving(true);
    try { await deleteMaintenanceRate(id); }
    finally { setSaving(false); }
  };

  const handleAdd = async (agencyId: string, agencyName: string) => {
    setSaving(true);
    try {
      await createMaintenanceRate(agencyId, agencyName, Number(newRate) / 100);
      setAddingAgencyId(null);
      setNewRate("70");
    } finally { setSaving(false); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
            {["admin.masters.agency", "admin.masters.rate", "admin.masters.edit", ""].map((k, i) => (
              <th key={i} className={thCls}>{k ? l(k) : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? <LoadingRow cols={4} /> : agencies.map((ag) => {
            const existing = rateByAgency.get(ag.id);
            const isEditing = existing && editId === existing.id;
            const isAdding = !existing && addingAgencyId === ag.id;

            return (
              <tr key={ag.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                <td className={`${tdCls} font-medium text-[var(--color-ink)]`}>{ag.name}</td>
                <td className={tdCls}>
                  {existing ? (
                    isEditing ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} max={100} step={0.1} value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-20 rounded-lg border border-stone-300 px-2 py-1 font-body text-sm dark:border-stone-600 dark:bg-stone-800" />
                        <span className="text-[var(--color-ink-muted)]">%</span>
                      </div>
                    ) : (
                      <span className="font-medium">{Math.round(existing.rate * 1000) / 10} %</span>
                    )
                  ) : isAdding ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} step={0.1} value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        className="w-20 rounded-lg border border-[var(--color-brand)] px-2 py-1 font-body text-sm dark:bg-stone-800" />
                      <span className="text-[var(--color-ink-muted)]">%</span>
                    </div>
                  ) : (
                    <span className="font-body text-xs text-[var(--color-ink-muted)]">{l("admin.masters.notSet")}</span>
                  )}
                </td>
                <td className={tdCls}>
                  {existing ? (
                    isEditing ? (
                      <div className="flex gap-2">
                        <button type="button" disabled={saving} onClick={() => save(existing.id)}
                          className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-60">
                          {l("admin.masters.save")}
                        </button>
                        <button type="button" onClick={() => setEditId(null)}
                          className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                          {l("admin.masters.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startEdit(existing)}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                        {l("admin.masters.edit")}
                      </button>
                    )
                  ) : isAdding ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => handleAdd(ag.id, ag.name)}
                        className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-60">
                        {l("admin.masters.save")}
                      </button>
                      <button type="button" onClick={() => setAddingAgencyId(null)}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                        {l("admin.masters.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => { setAddingAgencyId(ag.id); setNewRate("70"); }}
                      className="rounded-md border border-[var(--color-brand)]/50 px-3 py-1 text-xs text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5">
                      + {l("admin.masters.addRate")}
                    </button>
                  )}
                </td>
                <td className={tdCls}>
                  {existing && !isEditing && (
                    <button type="button" onClick={() => handleDelete(existing.id)} disabled={saving}
                      className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20">
                      {l("admin.masters.deleteRate")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 製品単価（ティア）────────────────────────────────
type TierEditState = { rowId: string; tierIdx: number; minLicenses: string; price: string };

function UnitPriceTab({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { unitPrices, isLoading } = useUnitPrices();
  const [localPrices, setLocalPrices] = useState<UnitPrice[] | null>(null);
  const rows: UnitPrice[] = localPrices ?? unitPrices;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<TierEditState | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setEditState(null);
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const startEdit = (rowId: string, tierIdx: number, tier: PriceTier) =>
    setEditState({ rowId, tierIdx, minLicenses: String(tier.minLicenses), price: String(tier.price) });

  const saveTier = async () => {
    if (!editState) return;
    const { rowId, tierIdx, minLicenses, price } = editState;
    const updatedRows = rows.map((r) => {
      if (r.id !== rowId) return r;
      const tiers = r.tiers.map((tier, i) =>
        i === tierIdx ? { minLicenses: Number(minLicenses), price: Number(price) } : tier
      );
      tiers.sort((a, b) => a.minLicenses - b.minLicenses);
      return { ...r, tiers };
    });
    setLocalPrices(updatedRows);
    setEditState(null);
    setSaving(true);
    try {
      const target = updatedRows.find((r) => r.id === rowId)!;
      await updateUnitPriceTiers(rowId, target.tiers);
    } finally { setSaving(false); }
  };

  const addTier = (rowId: string) => {
    setLocalPrices(rows.map((r) => {
      if (r.id !== rowId) return r;
      const maxMin = Math.max(...r.tiers.map((tier) => tier.minLicenses), 0);
      return { ...r, tiers: [...r.tiers, { minLicenses: maxMin + 10, price: 0 }] };
    }));
  };

  const deleteTier = async (rowId: string, tierIdx: number) => {
    const updatedRows = rows.map((r) => {
      if (r.id !== rowId || r.tiers.length <= 1) return r;
      return { ...r, tiers: r.tiers.filter((_, i) => i !== tierIdx) };
    });
    setLocalPrices(updatedRows);
    if (editState?.rowId === rowId) setEditState(null);
    const target = updatedRows.find((r) => r.id === rowId)!;
    await updateUnitPriceTiers(rowId, target.tiers);
  };

  const deliveryLabel = (dt: string) => DELIVERY_TYPES.find((d) => d.value === dt)?.labelJa ?? dt;

  if (isLoading) return (
    <div className="px-4 py-8 text-center font-body text-sm text-[var(--color-ink-muted)]">読み込み中…</div>
  );

  return (
    <div className="divide-y divide-stone-100 dark:divide-stone-800">
      {saving && <div className="px-4 py-2 font-body text-xs text-[var(--color-ink-muted)]">保存中…</div>}
      {rows.map((r) => {
        const isOpen = expanded.has(r.id);
        return (
          <div key={r.id}>
            <div className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/40" onClick={() => toggle(r.id)}>
              <span className={`text-xs text-[var(--color-ink-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span className="flex-1 font-body text-sm font-medium text-[var(--color-ink)]">{r.productName}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 font-body text-xs dark:bg-stone-800">{deliveryLabel(r.deliveryType)}</span>
            </div>
            {isOpen && (
              <div className="bg-stone-50/60 px-8 pb-4 pt-1 dark:bg-stone-800/20">
                <table className="w-full font-body text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]">{l("admin.masters.minLicenses")}</th>
                      <th className="py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]">{l("admin.masters.price")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.tiers.map((tier, ti) => {
                      const isEditing = editState?.rowId === r.id && editState.tierIdx === ti;
                      return (
                        <tr key={ti} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                          <td className="py-2 pr-4 text-[var(--color-ink)]">
                            {isEditing ? (
                              <input type="number" min={1} value={editState!.minLicenses}
                                onChange={(e) => setEditState((s) => s && ({ ...s, minLicenses: e.target.value }))}
                                className="w-24 rounded-lg border border-[var(--color-brand)] px-2 py-1 text-sm outline-none dark:bg-stone-800" />
                            ) : <span>{tier.minLicenses}</span>}
                          </td>
                          <td className="py-2 pr-4 text-[var(--color-ink)]">
                            {isEditing ? (
                              <input type="number" min={0} value={editState!.price}
                                onChange={(e) => setEditState((s) => s && ({ ...s, price: e.target.value }))}
                                className="w-28 rounded-lg border border-[var(--color-brand)] px-2 py-1 text-sm outline-none dark:bg-stone-800" />
                            ) : <span>¥{tier.price.toLocaleString()}</span>}
                          </td>
                          <td className="py-2">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <button type="button" onClick={saveTier}
                                  className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90">
                                  {l("admin.masters.save")}
                                </button>
                                <button type="button" onClick={() => setEditState(null)}
                                  className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                                  {l("admin.masters.cancel")}
                                </button>
                                <button type="button" disabled={r.tiers.length <= 1}
                                  onClick={() => { deleteTier(r.id, ti); }}
                                  className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-30 dark:border-red-800 dark:hover:bg-red-950/20">
                                  {l("admin.masters.deleteTier")}
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => startEdit(r.id, ti, tier)}
                                className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                                {l("admin.masters.edit")}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={() => addTier(r.id)}
                  className="mt-3 rounded-md border border-stone-300 px-3 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                  + {l("admin.masters.addTier")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── テンプレート ──────────────────────────────────────
function TemplateTab({ locale }: { locale: string }) {
  const [rows] = useState<TemplateDef[]>(MOCK_TEMPLATES);
  const l = (k: string) => t(locale as "ja" | "en", k);
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
            {["admin.masters.deliveryType","admin.masters.contractType","admin.masters.subType","admin.masters.fileName","admin.masters.uploadedAt","admin.masters.upload"].map((k) => (
              <th key={k} className={thCls}>{l(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
              <td className={tdCls}>{DELIVERY_TYPES.find((d) => d.value === r.deliveryType)?.labelJa}</td>
              <td className={tdCls}>{CONTRACT_TYPES.find((c) => c.value === r.contractType)?.labelJa}</td>
              <td className={tdCls}>{r.subType ?? "—"}</td>
              <td className={tdCls}>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs dark:bg-stone-800">{r.fileName}</span>
              </td>
              <td className={tdCls}>{r.uploadedAt}</td>
              <td className={tdCls}>
                <label className="cursor-pointer rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                  {l("admin.masters.upload")}
                  <input type="file" accept=".xlsx" className="hidden" onChange={() => alert("ファイルアップロードは API 連携後に実装します。")} />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ページ本体 ────────────────────────────────────────
export default function AdminMastersPage() {
  const { locale } = useLocale();
  const [tab, setTab] = useState<Tab>("margin");

  const tabs: { key: Tab; label: string }[] = [
    { key: "margin",      label: t(locale, "admin.masters.tab.margin") },
    { key: "maintenance", label: t(locale, "admin.masters.tab.maintenance") },
    { key: "unitPrice",   label: t(locale, "admin.masters.tab.unitPrice") },
    { key: "template",    label: t(locale, "admin.masters.tab.template") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {t(locale, "admin.mastersTitle")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {t(locale, "admin.mastersDescription")}
        </p>
      </div>
      <div className="flex gap-1 rounded-xl border border-stone-200/80 bg-stone-100/60 p-1 dark:border-stone-700/80 dark:bg-stone-800/40">
        {tabs.map((tb) => (
          <button key={tb.key} type="button" onClick={() => setTab(tb.key)}
            className={`flex-1 rounded-lg px-3 py-2 font-body text-sm transition ${
              tab === tb.key
                ? "bg-[var(--color-surface-elevated)] font-medium text-[var(--color-brand)] shadow-sm"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] shadow-sm dark:border-stone-700/80">
        {tab === "margin"      && <MarginTab      locale={locale} />}
        {tab === "maintenance" && <MaintenanceTab locale={locale} />}
        {tab === "unitPrice"   && <UnitPriceTab   locale={locale} />}
        {tab === "template"    && <TemplateTab    locale={locale} />}
      </div>
    </div>
  );
}
