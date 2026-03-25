/** API レスポンス・UI 通知用（クライアント import 可） */
export type KintoneSalesSyncResultDto =
  | { ok: true; action: "created" | "updated"; recordId: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };
