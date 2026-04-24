import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";

/** PUT /api/estimates/[id] approved の HubSpot 同期結果 DTO */
export type HubSpotSyncResultDto =
  | { ok: true; action: "created" | "existing"; dealId: string; excelUpdated: boolean }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

/** ユーザーが重複承認確認をキャンセルしたことを示すエラー */
export const HUBSPOT_DUPLICATE_CANCELLED = "hubspot_duplicate_cancelled";

/** PUT のレスポンスから HubSpot の重複情報を取り出す（409 時に使う） */
export type HubSpotDuplicatePayload = {
  contractType: "new" | string;
  customerName: string;
  deals: Array<{ id: string; dealName: string; customerName?: string }>;
};

function isDuplicatePayload(x: unknown): x is HubSpotDuplicatePayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.contractType === "string" &&
    Array.isArray(o.deals)
  );
}

export function getHubSpotDuplicateFromPayload(payload: unknown): HubSpotDuplicatePayload | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = (payload as { hubspotDuplicate?: unknown }).hubspotDuplicate;
  if (!isDuplicatePayload(raw)) return undefined;
  return raw;
}

function isSyncPayload(x: unknown): x is HubSpotSyncResultDto {
  if (!x || typeof x !== "object" || !("ok" in x)) return false;
  const o = x as { ok: unknown };
  return o.ok === true || o.ok === false;
}

export function getHubSpotSyncFromPayload(payload: unknown): HubSpotSyncResultDto | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = (payload as { hubspotSync?: unknown }).hubspotSync;
  if (!isSyncPayload(raw)) return undefined;
  return raw;
}

/** 承認直後: HubSpot 同期結果をユーザーに通知 */
export function alertHubSpotSyncAfterApprove(
  locale: Locale,
  status: "approved" | "rejected",
  payload: unknown
): void {
  if (status !== "approved") return;
  const sync = getHubSpotSyncFromPayload(payload);
  if (!sync) return;
  if (sync.ok === false) {
    alert(t(locale, "admin.estimates.hubspotError", { detail: sync.error }));
    return;
  }
  if ("skipped" in sync && sync.skipped) return;
  if ("action" in sync) {
    if (sync.action === "created") {
      alert(t(locale, "admin.estimates.hubspotCreated", { dealId: sync.dealId }));
    } else if (sync.action === "existing") {
      alert(t(locale, "admin.estimates.hubspotExisting", { dealId: sync.dealId }));
    }
  }
}

/** 重複時の確認メッセージ（承認者に提示する） */
export function buildHubSpotDuplicateConfirmMessage(
  locale: Locale,
  duplicate: HubSpotDuplicatePayload
): string {
  const list = duplicate.deals
    .slice(0, 5)
    .map((d, i) => `  ${i + 1}. [${d.id}] ${d.dealName || d.customerName || ""}`)
    .join("\n");
  const more = duplicate.deals.length > 5 ? `\n  ... +${duplicate.deals.length - 5}` : "";
  return (
    t(locale, "admin.estimates.hubspotDuplicateWarning", {
      customerName: duplicate.customerName,
    }) +
    "\n\n" +
    list +
    more +
    "\n\n" +
    t(locale, "admin.estimates.hubspotDuplicateProceedQuestion")
  );
}
