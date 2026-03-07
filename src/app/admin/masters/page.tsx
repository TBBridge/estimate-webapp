"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import {
  MOCK_MARGIN_RATES, MOCK_MAINTENANCE_RATES, MOCK_UNIT_PRICES, MOCK_TEMPLATES,
  PRODUCTS,
  type MarginRate, type MaintenanceRate, type UnitPrice, type PriceTier, type TemplateDef,
} from "@/lib/mock-data";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

type Tab = "margin" | "maintenance" | "unitPrice" | "template";

const thCls = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]";
const tdCls = "px-4 py-3";

// ─────────────────────────────────────────────────────────
// 仕切り率（本製品）
// キー：代理店 × 製品 × 提供形態
// ─────────────────────────────────────────────────────────
function MarginTab({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const [rows, setRows] = useState<MarginRate[]>(MOCK_MARGIN_RATES);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  // 代理店ごとにグループ化
  const agencies = Array.from(new Set(rows.map((r) => r.agencyId))).map((id) => ({
    id,
    name: rows.find((r) => r.agencyId === id)!.agencyName,
  }));

  const [openAgency, setOpenAgency] = useState<string>(agencies[0]?.id ?? "");

  const startEdit = (r: MarginRate) => { setEditId(r.id); setEditRate(String(Math.round(r.rate * 100))); };
  const save = (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, rate: Number(editRate) / 100 } : r));
    setEditId(null);
  };

  const agencyRows = rows.filter((r) => r.agencyId === openAgency);
  const productOf = (id: string) => PRODUCTS.find((p) => p.id === id);
  const deliveryLabel = (dt: string) => DELIVERY_TYPES.find((d) => d.value === dt)?.labelJa ?? dt;

  return (
    <div>
      {/* 代理店タブ */}
      <div className="flex gap-1 overflow-x-auto border-b border-stone-200/80 px-4 pt-4 dark:border-stone-700/80">
        {agencies.map((ag) => (
          <button
            key={ag.id}
            type="button"
            onClick={() => { setOpenAgency(ag.id); setEditId(null); }}
            className={`shrink-0 rounded-t-lg px-4 py-2 font-body text-sm transition ${
              openAgency === ag.id
                ? "border-b-2 border-[var(--color-brand)] font-medium text-[var(--color-brand)]"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {ag.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
              <th className={thCls}>{l("admin.masters.product")}</th>
              <th className={thCls}>{l("admin.masters.deliveryType")}</th>
              <th className={thCls}>{l("admin.masters.rate")}</th>
              <th className={thCls}>{l("admin.masters.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {agencyRows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
                <td className={tdCls}>
                  <span className={`inline-flex items-center gap-1 font-medium text-[var(--color-ink)] ${productOf(r.productId)?.isOption ? "pl-3" : ""}`}>
                    {productOf(r.productId)?.isOption && (
                      <span className="text-[var(--color-ink-muted)]">└</span>
                    )}
                    {productOf(r.productId)?.nameJa ?? r.productId}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs dark:bg-stone-800">
                    {deliveryLabel(r.deliveryType)}
                  </span>
                </td>
                <td className={tdCls}>
                  {editId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} max={100} step={0.1}
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        className="w-20 rounded-lg border border-stone-300 px-2 py-1 font-body text-sm dark:border-stone-600 dark:bg-stone-800"
                      />
                      <span className="text-[var(--color-ink-muted)]">%</span>
                    </div>
                  ) : (
                    <span className="font-medium">{Math.round(r.rate * 1000) / 10} %</span>
                  )}
                </td>
                <td className={tdCls}>
                  {editId === r.id ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => save(r.id)} className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90">
                        {l("admin.masters.save")}
                      </button>
                      <button type="button" onClick={() => setEditId(null)} className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                        {l("admin.masters.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startEdit(r)} className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">
                      {l("admin.masters.edit")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 仕切り率（保守）
// ─────────────────────────────────────────────────────────
function MaintenanceTab({ locale }: { locale: string }) {
  const [rows, setRows] = useState<MaintenanceRate[]>(MOCK_MAINTENANCE_RATES);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const l = (k: string) => t(locale as "ja" | "en", k);

  const startEdit = (r: MaintenanceRate) => { setEditId(r.id); setEditRate(String(Math.round(r.rate * 100))); };
  const save = (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, rate: Number(editRate) / 100 } : r));
    setEditId(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
            <th className={thCls}>{l("admin.masters.agency")}</th>
            <th className={thCls}>{l("admin.masters.rate")}</th>
            <th className={thCls}>{l("admin.masters.edit")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40">
              <td className={`${tdCls} font-medium text-[var(--color-ink)]`}>{r.agencyName}</td>
              <td className={tdCls}>
                {editId === r.id ? (
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} step={0.1} value={editRate} onChange={(e) => setEditRate(e.target.value)} className="w-20 rounded-lg border border-stone-300 px-2 py-1 font-body text-sm dark:border-stone-600 dark:bg-stone-800" />
                    <span className="text-[var(--color-ink-muted)]">%</span>
                  </div>
                ) : <span className="font-medium">{Math.round(r.rate * 1000) / 10} %</span>}
              </td>
              <td className={tdCls}>
                {editId === r.id ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => save(r.id)} className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90">{l("admin.masters.save")}</button>
                    <button type="button" onClick={() => setEditId(null)} className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">{l("admin.masters.cancel")}</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEdit(r)} className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700">{l("admin.masters.edit")}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 製品単価（ティア展開）
// ─────────────────────────────────────────────────────────
type UnitPriceRowState = UnitPrice & { tiers: PriceTier[] };

type TierEditState = {
  rowId: string;
  tierIdx: number;
  minLicenses: string;
  price: string;
};

function UnitPriceTab({ locale }: { locale: string }) {
  const l = (k: string) => t(locale as "ja" | "en", k);
  const [rows, setRows] = useState<UnitPriceRowState[]>(
    MOCK_UNIT_PRICES.map((u) => ({ ...u, tiers: u.tiers.map((tier) => ({ ...tier })) }))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<TierEditState | null>(null);

  const toggle = (id: string) => {
    setEditState(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (rowId: string, tierIdx: number, tier: PriceTier) => {
    setEditState({ rowId, tierIdx, minLicenses: String(tier.minLicenses), price: String(tier.price) });
  };

  const saveTier = () => {
    if (!editState) return;
    const { rowId, tierIdx, minLicenses, price } = editState;
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const tiers = r.tiers.map((tier, i) =>
        i === tierIdx ? { minLicenses: Number(minLicenses), price: Number(price) } : tier
      );
      tiers.sort((a, b) => a.minLicenses - b.minLicenses);
      return { ...r, tiers };
    }));
    setEditState(null);
  };

  const cancelEdit = () => setEditState(null);

  const addTier = (rowId: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const maxMin = Math.max(...r.tiers.map((tier) => tier.minLicenses), 0);
      return { ...r, tiers: [...r.tiers, { minLicenses: maxMin + 10, price: 0 }] };
    }));
  };

  const deleteTier = (rowId: string, tierIdx: number) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (r.tiers.length <= 1) return r;
      return { ...r, tiers: r.tiers.filter((_, i) => i !== tierIdx) };
    }));
  };

  const deliveryLabel = (dt: string) => DELIVERY_TYPES.find((d) => d.value === dt)?.labelJa ?? dt;

  return (
    <div className="divide-y divide-stone-100 dark:divide-stone-800">
      {rows.map((r) => {
        const isOpen = expanded.has(r.id);
        return (
          <div key={r.id}>
            {/* 製品行 */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/40"
              onClick={() => toggle(r.id)}
            >
              <span className={`text-xs text-[var(--color-ink-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span className="flex-1 font-body text-sm font-medium text-[var(--color-ink)]">{r.productName}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 font-body text-xs dark:bg-stone-800">{deliveryLabel(r.deliveryType)}</span>
            </div>

            {/* ティア展開 */}
            {isOpen && (
              <div className="bg-stone-50/60 px-8 pb-4 pt-1 dark:bg-stone-800/20">
                <table className="w-full font-body text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]">{l("admin.masters.minLicenses")}</th>
                      <th className="py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]">{l("admin.masters.price")}</th>
                      <th className="py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.tiers.map((tier, ti) => {
                      const isEditing =
                        editState?.rowId === r.id && editState.tierIdx === ti;
                      return (
                        <tr key={ti} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                          {/* ライセンス数 */}
                          <td className="py-2 pr-4 text-[var(--color-ink)]">
                            {isEditing ? (
                              <input
                                type="number"
                                min={1}
                                value={editState!.minLicenses}
                                onChange={(e) => setEditState((s) => s && ({ ...s, minLicenses: e.target.value }))}
                                className="w-24 rounded-lg border border-[var(--color-brand)] px-2 py-1 text-sm outline-none dark:bg-stone-800"
                              />
                            ) : (
                              <span>{tier.minLicenses}</span>
                            )}
                          </td>
                          {/* 単価 */}
                          <td className="py-2 pr-4 text-[var(--color-ink)]">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={editState!.price}
                                onChange={(e) => setEditState((s) => s && ({ ...s, price: e.target.value }))}
                                className="w-28 rounded-lg border border-[var(--color-brand)] px-2 py-1 text-sm outline-none dark:bg-stone-800"
                              />
                            ) : (
                              <span>¥{tier.price.toLocaleString()}</span>
                            )}
                          </td>
                          {/* 操作 */}
                          <td className="py-2">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <button type="button" onClick={saveTier} className="rounded-md bg-[var(--color-brand)] px-3 py-1 text-xs text-white hover:opacity-90">
                                  {l("admin.masters.save")}
                                </button>
                                <button type="button" onClick={cancelEdit} className="rounded-md border border-stone-300 px-3 py-1 text-xs dark:border-stone-600">
                                  {l("admin.masters.cancel")}
                                </button>
                                <button
                                  type="button"
                                  disabled={r.tiers.length <= 1}
                                  onClick={() => { deleteTier(r.id, ti); cancelEdit(); }}
                                  className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-30 dark:border-red-800 dark:hover:bg-red-950/20"
                                >
                                  {l("admin.masters.deleteTier")}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(r.id, ti, tier)}
                                className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
                              >
                                {l("admin.masters.edit")}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => addTier(r.id)}
                  className="mt-3 rounded-md border border-stone-300 px-3 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
                >
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

// ─────────────────────────────────────────────────────────
// テンプレート
// ─────────────────────────────────────────────────────────
function TemplateTab({ locale }: { locale: string }) {
  const [rows] = useState<TemplateDef[]>(MOCK_TEMPLATES);
  const l = (k: string) => t(locale as "ja" | "en", k);

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="border-b border-stone-200/80 dark:border-stone-700/80">
            {["admin.masters.deliveryType", "admin.masters.contractType", "admin.masters.subType", "admin.masters.fileName", "admin.masters.uploadedAt", "admin.masters.upload"].map((k) => (
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

// ─────────────────────────────────────────────────────────
// ページ本体
// ─────────────────────────────────────────────────────────
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

      {/* タブバー */}
      <div className="flex gap-1 rounded-xl border border-stone-200/80 bg-stone-100/60 p-1 dark:border-stone-700/80 dark:bg-stone-800/40">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`flex-1 rounded-lg px-3 py-2 font-body text-sm transition ${
              tab === tb.key
                ? "bg-[var(--color-surface-elevated)] font-medium text-[var(--color-brand)] shadow-sm"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
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
