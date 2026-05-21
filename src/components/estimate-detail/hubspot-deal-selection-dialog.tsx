"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/translations";
import {
  HUBSPOT_DEAL_SELECT_CREATE_NEW,
  type HubSpotDealSelectionPayload,
} from "@/lib/hubspot-approve-feedback";

export type HubSpotDealSelectionDialogProps = {
  open: boolean;
  locale: Locale;
  payload: HubSpotDealSelectionPayload | null;
  /** ユーザーが取引を選択したときに呼ばれる。dealId は既存取引 ID または "__new__"。 */
  onConfirm: (selectedDealId: string) => void;
  onCancel: () => void;
};

export function HubSpotDealSelectionDialog({
  open,
  locale,
  payload,
  onConfirm,
  onCancel,
}: HubSpotDealSelectionDialogProps) {
  const l = (k: string, params?: Record<string, string>) => t(locale, k, params);
  const [selected, setSelected] = useState<string>("");
  const [validationMessage, setValidationMessage] = useState<string>("");

  // モーダルが開くたびに選択をリセット
  useEffect(() => {
    if (open) {
      setSelected("");
      setValidationMessage("");
    }
  }, [open, payload?.customerName]);

  if (!open || !payload) return null;

  const handleConfirm = () => {
    if (!selected) {
      setValidationMessage(l("admin.estimates.hubspotDealSelectionMissing"));
      return;
    }
    onConfirm(selected);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-xl">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            {l("admin.estimates.hubspotDealSelectionTitle")}
          </h2>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
            {l("admin.estimates.hubspotDealSelectionDescription", {
              customerName: payload.customerName,
              count: String(payload.deals.length),
            })}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {payload.deals.map((d) => (
            <label
              key={d.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition hover:bg-[var(--color-surface-sub)] ${
                selected === d.id
                  ? "border-[var(--color-brand)] bg-[var(--color-surface-sub)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
            >
              <input
                type="radio"
                name="hubspot-deal-selection"
                value={d.id}
                checked={selected === d.id}
                onChange={() => {
                  setSelected(d.id);
                  setValidationMessage("");
                }}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm font-medium text-[var(--color-ink)]">
                  {d.dealName || d.customerName || d.id}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)]">
                  {l("admin.estimates.hubspotDealId")}: {d.id}
                </p>
              </div>
            </label>
          ))}

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border border-dashed px-4 py-3 transition hover:bg-[var(--color-surface-sub)] ${
              selected === HUBSPOT_DEAL_SELECT_CREATE_NEW
                ? "border-[var(--color-brand)] bg-[var(--color-surface-sub)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <input
              type="radio"
              name="hubspot-deal-selection"
              value={HUBSPOT_DEAL_SELECT_CREATE_NEW}
              checked={selected === HUBSPOT_DEAL_SELECT_CREATE_NEW}
              onChange={() => {
                setSelected(HUBSPOT_DEAL_SELECT_CREATE_NEW);
                setValidationMessage("");
              }}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm font-medium text-[var(--color-ink)]">
                {l("admin.estimates.hubspotDealSelectionCreateNew")}
              </p>
            </div>
          </label>

          {validationMessage && (
            <p className="font-body text-xs text-red-600 dark:text-red-400">{validationMessage}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-body text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sub)]"
          >
            {l("admin.estimates.hubspotDealSelectionCancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90"
          >
            {l("admin.estimates.hubspotDealSelectionConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
