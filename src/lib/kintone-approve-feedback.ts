import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import type { KintoneSalesSyncResultDto } from "@/lib/kintone-sales-types";

/** GAIA_NO01 等: トークンにレコード編集 API が許可されていない（同一顧客の 2 件目以降は更新が必須） */
export function isKintoneSalesEditPermissionError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("gaia_no01") ||
    m.includes("cannot run the specified api") ||
    (m.includes("update record") && m.includes("403"))
  );
}

function isSyncPayload(x: unknown): x is KintoneSalesSyncResultDto {
  if (!x || typeof x !== "object" || !("ok" in x)) return false;
  const o = x as { ok: unknown };
  return o.ok === true || o.ok === false;
}

/** PUT /api/estimates/[id] の JSON から kintoneSalesSync を取り出す */
export function getKintoneSalesSyncFromPayload(payload: unknown): KintoneSalesSyncResultDto | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = (payload as { kintoneSalesSync?: unknown }).kintoneSalesSync;
  if (!isSyncPayload(raw)) return undefined;
  return raw;
}

/** 承認直後: kintone 連携結果をユーザーに通知（失敗時は警告・成功時は簡易メッセージ） */
export function alertKintoneSalesSyncAfterApprove(
  locale: Locale,
  status: "approved" | "rejected",
  payload: unknown
): void {
  if (status !== "approved") return;
  const sync = getKintoneSalesSyncFromPayload(payload);
  if (!sync) return;
  if (sync.ok === false) {
    const detail = sync.error ?? "";
    if (isKintoneSalesEditPermissionError(detail)) {
      alert(
        t(locale, "admin.estimates.kintoneSalesErrorTokenEdit", { detail }) +
          "\n\n" +
          t(locale, "admin.estimates.kintoneSalesErrorTokenEditHint")
      );
    } else {
      alert(t(locale, "admin.estimates.kintoneSalesError", { detail }));
    }
    return;
  }
  if ("skipped" in sync && sync.skipped) return;
  if ("action" in sync) {
    if (sync.action === "created") {
      alert(t(locale, "admin.estimates.kintoneSalesCreated", { recordId: sync.recordId }));
    } else if (sync.action === "updated") {
      alert(t(locale, "admin.estimates.kintoneSalesUpdated", { recordId: sync.recordId }));
    }
  }
}
