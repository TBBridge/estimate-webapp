"use client";

import { useState } from "react";
import { mutate } from "swr";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { useMarginRates, updateMarginRate, createMarginRate, deleteMarginRate } from "@/hooks/use-margin-rates";
import { useMaintenanceRates, updateMaintenanceRate, createMaintenanceRate, deleteMaintenanceRate } from "@/hooks/use-maintenance-rates";
import { useUnitPrices, updateUnitPriceTiers } from "@/hooks/use-unit-prices";
import { useAgencies } from "@/hooks/use-agencies";
import { type PriceTier } from "@/lib/mock-data";
import { PRODUCTS, type UnitPrice } from "@/lib/mock-data";
import { useTemplates, uploadTemplate, deleteTemplate, type TemplateMeta } from "@/hooks/use-templates";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

type Tab = "margin" | "maintenance" | "unitPrice" | "template";

// 本製品タブの列定義: 製品 × 製品ごとの提供形態
type ColDef = { productId: string; deliveryType: string; label: string };

const DELIVERY_LABEL: Record<string, string> = {
  onprem: "オンプレ",
  subscription: "サブスク",
  cloud: "クラウド",
};

const MARGIN_COLS: ColDef[] = (
  PRODUCTS as readonly { id: string; nameJa: string; deliveryTypes: readonly string[] }[]
).flatMap((p) =>
  p.deliveryTypes.map((dt) => ({
    productId: p.id,
    deliveryType: dt,
    label: `${p.nameJa}\n(${DELIVERY_LABEL[dt] ?? dt})`,
  }))
);

// 保守タブの列定義: 保守仕切り率を持つ製品のみ（提供形態なし）
const MAINTENANCE_COLS: { productId: string; label: string }[] = (
  PRODUCTS as readonly { id: string; nameJa: string; hasMaintenanceRate: boolean }[]
)
  .filter((p) => p.hasMaintenanceRate)
  .map((p) => ({
    productId: p.id,
    label: p.nameJa,
  }));

// ── インライン編集セル ─────────────────────────────
type CellKey = string; // `${agencyId}__${productId}__${deliveryType}`

function rateDisplay(rate: number) {
  return `${Math.round(rate * 1000) / 10}%`;
}

// ── 仕切り率（本製品）グリッド ────────────────────
function MarginGrid({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { marginRates, isLoading: ratesLoading } = useMarginRates();
  const { agencies, isLoading: agenciesLoading } = useAgencies();
  const isLoading = ratesLoading || agenciesLoading;

  // editKey: `${agencyId}__${productId}__${deliveryType}` | null
  const [editKey, setEditKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // 検索フィルタ
  const [search, setSearch] = useState("");
  const filteredAgencies = agencies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const rateMap = new Map(
    marginRates.map((r) => [`${r.agencyId}__${r.productId}__${r.deliveryType}`, r])
  );

  const startEdit = (key: CellKey, currentRate: number | null) => {
    setEditKey(key);
    setEditValue(currentRate !== null ? String(Math.round(currentRate * 1000) / 10) : "70");
  };

  const saveCell = async (agencyId: string, agencyName: string, productId: string, deliveryType: string) => {
    const key = `${agencyId}__${productId}__${deliveryType}`;
    const existing = rateMap.get(key);
    const rate = Number(editValue) / 100;
    setSaving(true);
    try {
      if (existing) {
        await updateMarginRate(existing.id, rate);
      } else {
        await createMarginRate(agencyId, agencyName, productId, deliveryType, rate);
      }
      setEditKey(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteCell = async (key: CellKey) => {
    const existing = rateMap.get(key);
    if (!existing) return;
    if (!confirm(l("admin.masters.confirmDeleteRate"))) return;
    setSaving(true);
    try { await deleteMarginRate(existing.id); setEditKey(null); }
    finally { setSaving(false); }
  };

  if (isLoading) return (
    <div className="px-4 py-12 text-center font-body text-sm text-[var(--color-ink-muted)]">読み込み中…</div>
  );

  return (
    <div>
      {/* 検索バー */}
      <div className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-3 dark:border-stone-700/80">
        <input
          type="text"
          placeholder="代理店名で絞り込み…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
        />
        <span className="font-body text-xs text-[var(--color-ink-muted)]">
          {filteredAgencies.length} 社
        </span>
        {saving && <span className="font-body text-xs text-[var(--color-ink-muted)]">保存中…</span>}
      </div>

      {/* グリッドテーブル（横スクロール） */}
      <div className="overflow-x-auto">
        <table className="min-w-max font-body text-xs">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              {/* 代理店名列（固定） */}
              <th className="sticky left-0 z-10 min-w-[160px] bg-[var(--color-surface-elevated)] px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
                代理店
              </th>
              {MARGIN_COLS.map((col) => (
                <th key={`${col.productId}__${col.deliveryType}`}
                  className="min-w-[90px] whitespace-pre-line px-2 py-2 text-center font-medium text-[var(--color-ink-muted)] leading-tight">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAgencies.length === 0 ? (
              <tr>
                <td colSpan={MARGIN_COLS.length + 1} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">
                  代理店が登録されていません
                </td>
              </tr>
            ) : filteredAgencies.map((ag) => (
              <tr key={ag.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60 dark:border-stone-800 dark:hover:bg-stone-800/20">
                {/* 代理店名（固定列） */}
                <td className="sticky left-0 z-10 bg-[var(--color-surface-elevated)] px-4 py-2 font-medium text-[var(--color-ink)]">
                  {ag.name}
                </td>
                {MARGIN_COLS.map((col) => {
                  const key = `${ag.id}__${col.productId}__${col.deliveryType}`;
                  const existing = rateMap.get(key);
                  const isEditing = editKey === key;

                  return (
                    <td key={key} className="px-1 py-1 text-center">
                      {isEditing ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={0} max={100} step={0.1}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              className="w-16 rounded border border-[var(--color-brand)] px-1.5 py-1 text-center text-xs outline-none dark:bg-stone-800"
                            />
                            <span className="text-[var(--color-ink-muted)]">%</span>
                          </div>
                          <div className="flex gap-1">
                            <button type="button"
                              onClick={() => saveCell(ag.id, ag.name, col.productId, col.deliveryType)}
                              disabled={saving}
                              className="rounded bg-[var(--color-brand)] px-2 py-0.5 text-xs text-white hover:opacity-90 disabled:opacity-50">
                              保存
                            </button>
                            <button type="button" onClick={() => setEditKey(null)}
                              className="rounded border border-stone-300 px-2 py-0.5 text-xs dark:border-stone-600">
                              ×
                            </button>
                            {existing && (
                              <button type="button" onClick={() => deleteCell(key)} disabled={saving}
                                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:border-red-800">
                                削除
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(key, existing?.rate ?? null)}
                          className={`w-full rounded px-2 py-1.5 text-xs transition hover:ring-2 hover:ring-[var(--color-brand)]/30 ${
                            existing
                              ? "font-medium text-[var(--color-ink)]"
                              : "text-stone-300 dark:text-stone-600"
                          }`}>
                          {existing ? rateDisplay(existing.rate) : "—"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 仕切り率（保守）グリッド ──────────────────────
function MaintenanceGrid({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { maintenanceRates, isLoading: ratesLoading } = useMaintenanceRates();
  const { agencies, isLoading: agenciesLoading } = useAgencies();
  const isLoading = ratesLoading || agenciesLoading;

  const [editKey, setEditKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredAgencies = agencies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  // key: `${agencyId}__${productId}`
  const rateMap = new Map(
    maintenanceRates.map((r) => [`${r.agencyId}__${r.productId}`, r])
  );

  const startEdit = (key: CellKey, currentRate: number | null) => {
    setEditKey(key);
    setEditValue(currentRate !== null ? String(Math.round(currentRate * 1000) / 10) : "70");
  };

  const saveCell = async (agencyId: string, agencyName: string, productId: string) => {
    const key = `${agencyId}__${productId}`;
    const existing = rateMap.get(key);
    const rate = Number(editValue) / 100;
    setSaving(true);
    try {
      if (existing) {
        await updateMaintenanceRate(existing.id, rate);
      } else {
        await createMaintenanceRate(agencyId, agencyName, productId, rate);
      }
      setEditKey(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteCell = async (key: CellKey) => {
    const existing = rateMap.get(key);
    if (!existing) return;
    if (!confirm(l("admin.masters.confirmDeleteRate"))) return;
    setSaving(true);
    try { await deleteMaintenanceRate(existing.id); setEditKey(null); }
    finally { setSaving(false); }
  };

  if (isLoading) return (
    <div className="px-4 py-12 text-center font-body text-sm text-[var(--color-ink-muted)]">読み込み中…</div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-3 dark:border-stone-700/80">
        <input
          type="text"
          placeholder="代理店名で絞り込み…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
        />
        <span className="font-body text-xs text-[var(--color-ink-muted)]">{filteredAgencies.length} 社</span>
        {saving && <span className="font-body text-xs text-[var(--color-ink-muted)]">保存中…</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-max font-body text-xs">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              <th className="sticky left-0 z-10 min-w-[160px] bg-[var(--color-surface-elevated)] px-4 py-3 text-left font-medium text-[var(--color-ink-muted)]">
                代理店
              </th>
              {MAINTENANCE_COLS.map((col) => (
                <th key={col.productId}
                  className="min-w-[90px] px-2 py-2 text-center font-medium text-[var(--color-ink-muted)]">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAgencies.length === 0 ? (
              <tr>
                <td colSpan={MAINTENANCE_COLS.length + 1} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">
                  代理店が登録されていません
                </td>
              </tr>
            ) : filteredAgencies.map((ag) => (
              <tr key={ag.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60 dark:border-stone-800 dark:hover:bg-stone-800/20">
                <td className="sticky left-0 z-10 bg-[var(--color-surface-elevated)] px-4 py-2 font-medium text-[var(--color-ink)]">
                  {ag.name}
                </td>
                {MAINTENANCE_COLS.map((col) => {
                  const key = `${ag.id}__${col.productId}`;
                  const existing = rateMap.get(key);
                  const isEditing = editKey === key;

                  return (
                    <td key={key} className="px-1 py-1 text-center">
                      {isEditing ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={0} max={100} step={0.1}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              className="w-16 rounded border border-[var(--color-brand)] px-1.5 py-1 text-center text-xs outline-none dark:bg-stone-800"
                            />
                            <span className="text-[var(--color-ink-muted)]">%</span>
                          </div>
                          <div className="flex gap-1">
                            <button type="button"
                              onClick={() => saveCell(ag.id, ag.name, col.productId)}
                              disabled={saving}
                              className="rounded bg-[var(--color-brand)] px-2 py-0.5 text-xs text-white hover:opacity-90 disabled:opacity-50">
                              保存
                            </button>
                            <button type="button" onClick={() => setEditKey(null)}
                              className="rounded border border-stone-300 px-2 py-0.5 text-xs dark:border-stone-600">
                              ×
                            </button>
                            {existing && (
                              <button type="button" onClick={() => deleteCell(key)} disabled={saving}
                                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:border-red-800">
                                削除
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(key, existing?.rate ?? null)}
                          className={`w-full rounded px-2 py-1.5 text-xs transition hover:ring-2 hover:ring-[var(--color-brand)]/30 ${
                            existing
                              ? "font-medium text-[var(--color-ink)]"
                              : "text-stone-300 dark:text-stone-600"
                          }`}>
                          {existing ? rateDisplay(existing.rate) : "—"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const l = (k: string) => t(locale as "ja" | "en", k);
  const { templates, isLoading, error } = useTemplates();

  // uploadState: { [id]: "idle" | "uploading" | "done" | "error" }
  const [uploadStates, setUploadStates] = useState<Record<string, { state: string; msg?: string }>>({});

  const setUploadState = (id: string, state: string, msg?: string) =>
    setUploadStates((prev) => ({ ...prev, [id]: { state, msg } }));

  const handleFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // リセット（同じファイルの再選択を許可）
    setUploadState(id, "uploading");
    try {
      await uploadTemplate(id, file);
      setUploadState(id, "done");
      setTimeout(() => setUploadState(id, "idle"), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadState(id, "error", msg);
    }
  };

  const handleDelete = async (tpl: TemplateMeta) => {
    if (!confirm(l("admin.masters.confirmDeleteFile"))) return;
    setUploadState(tpl.id, "uploading");
    try {
      await deleteTemplate(tpl.id);
      setUploadState(tpl.id, "idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadState(tpl.id, "error", msg);
    }
  };

  const subTypeLabel = (s?: string) => {
    if (s === "annual") return "年額";
    if (s === "period") return "区切り";
    return "—";
  };

  return (
    <div>
      {/* Blob 未設定の警告 */}
      {error && String(error).includes("503") && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-body text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          {l("admin.masters.blobNotConfigured")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              {[
                "admin.masters.deliveryType",
                "admin.masters.contractType",
                "admin.masters.subType",
                "admin.masters.fileName",
                "admin.masters.uploadedAt",
                "admin.masters.upload",
              ].map((k) => (
                <th key={k} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  {l(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">読み込み中…</td>
              </tr>
            ) : templates.map((tpl) => {
              const us = uploadStates[tpl.id] ?? { state: "idle" };
              const hasFile = !!tpl.blobUrl;

              return (
                <tr key={tpl.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                  {/* 提供形態 */}
                  <td className="px-4 py-3">
                    {DELIVERY_TYPES.find((d) => d.value === tpl.deliveryType)?.labelJa}
                  </td>
                  {/* 契約形態 */}
                  <td className="px-4 py-3">
                    {CONTRACT_TYPES.find((c) => c.value === tpl.contractType)?.labelJa}
                  </td>
                  {/* サブ種別 */}
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                    {subTypeLabel(tpl.subType)}
                  </td>
                  {/* ファイル名 */}
                  <td className="px-4 py-3">
                    {hasFile ? (
                      <a
                        href={tpl.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs text-[var(--color-brand)] hover:underline dark:bg-stone-800"
                        title={l("admin.masters.download")}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {tpl.fileName}
                      </a>
                    ) : (
                      <span className="font-body text-xs text-stone-400 dark:text-stone-600">
                        {l("admin.masters.noFile")}
                      </span>
                    )}
                  </td>
                  {/* 更新日 */}
                  <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                    {hasFile ? tpl.uploadedAt : "—"}
                  </td>
                  {/* 操作 */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* アップロードボタン */}
                      {us.state === "uploading" ? (
                        <span className="font-body text-xs text-[var(--color-ink-muted)]">
                          {l("admin.masters.uploading")}
                        </span>
                      ) : us.state === "done" ? (
                        <span className="font-body text-xs text-emerald-600 dark:text-emerald-400">
                          ✓ {l("admin.masters.uploadSuccess")}
                        </span>
                      ) : (
                        <label className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)] dark:hover:bg-stone-700">
                          {hasFile ? l("admin.masters.upload") : `+ ${l("admin.masters.upload")}`}
                          <input
                            type="file"
                            accept=".xlsx"
                            className="hidden"
                            onChange={(e) => handleFileChange(tpl.id, e)}
                          />
                        </label>
                      )}

                      {/* 削除ボタン（ファイルがある場合のみ） */}
                      {hasFile && us.state !== "uploading" && (
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl)}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                        >
                          {l("admin.masters.deleteFile")}
                        </button>
                      )}

                      {/* エラー表示 */}
                      {us.state === "error" && (
                        <div className="w-full mt-1">
                          <p className="font-body text-xs text-red-600 dark:text-red-400">
                            {l("admin.masters.uploadError")}: {us.msg}
                          </p>
                          {us.msg?.includes("BLOB_READ_WRITE_TOKEN") && (
                            <p className="mt-1 font-body text-xs text-amber-700 dark:text-amber-400">
                              {l("admin.masters.blobNotConfigured")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MastersCsvImportBar({
  kind,
  locale,
}: {
  kind: "margin" | "maintenance" | "unitPrices";
  locale: "ja" | "en";
}) {
  const l = (k: string) => t(locale, k);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const swrKey =
    kind === "margin"
      ? "/api/margin-rates"
      : kind === "maintenance"
        ? "/api/maintenance-rates"
        : "/api/unit-prices";

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/masters/import-csv", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        upserted?: number;
        errors?: { line: number; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        setMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const errN = data.errors?.length ?? 0;
      setMsg(`反映 ${data.upserted ?? 0} 行、エラー ${errN} 行`);
      await mutate(swrKey);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setDownloadBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/masters/export-csv?kind=${encodeURIComponent(kind)}`);
      if (!res.ok) {
        setMsg(`HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base =
        kind === "margin" ? "margin_rates" : kind === "maintenance" ? "maintenance_rates" : "unit_prices";
      a.download = `${base}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadBusy(false);
    }
  };

  const hint =
    kind === "margin"
      ? "agency_id または agency_email, product_id, delivery_type, rate（0.7 または 70）"
      : kind === "maintenance"
        ? "agency_id または agency_email, product_id（任意）, rate"
        : "product_id, product_name, delivery_type, tiers（JSON 配列）";

  return (
    <div className="border-b border-stone-200/80 px-4 py-3 dark:border-stone-700/80">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloadBusy}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-body text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)] disabled:opacity-50"
        >
          {downloadBusy ? "…" : l("admin.masters.csvDownload")}
        </button>
        <span className="font-body text-sm font-medium text-[var(--color-ink)]">CSVインポート</span>
        <label className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-body text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)]">
          {busy ? "処理中…" : "ファイル選択"}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={onChange} />
        </label>
        {msg && <span className="font-body text-xs text-[var(--color-ink-muted)]">{msg}</span>}
      </div>
      <p className="mt-1 font-body text-xs text-[var(--color-ink-muted)]">{hint}</p>
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
        {tab === "margin" && (
          <>
            <MastersCsvImportBar kind="margin" locale={locale} />
            <MarginGrid locale={locale} />
          </>
        )}
        {tab === "maintenance" && (
          <>
            <MastersCsvImportBar kind="maintenance" locale={locale} />
            <MaintenanceGrid locale={locale} />
          </>
        )}
        {tab === "unitPrice" && (
          <>
            <MastersCsvImportBar kind="unitPrices" locale={locale} />
            <UnitPriceTab locale={locale} />
          </>
        )}
        {tab === "template" && <TemplateTab locale={locale} />}
      </div>
    </div>
  );
}
