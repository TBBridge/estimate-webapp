/**
 * 見積 Excel の差し替え履歴（Vercel Blob は同一パス上書き不可のため、世代ごとに別パスで保存）
 */
export type ExcelFileHistoryEntry = {
  version: number;
  url: string;
  uploadedAt: string;
};

export function parseExcelFileHistory(raw: unknown): ExcelFileHistoryEntry[] {
  if (!raw || typeof raw !== "object") return [];
  if (!Array.isArray(raw)) return [];
  const out: ExcelFileHistoryEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i] as Record<string, unknown> | null;
    if (!x || typeof x.url !== "string" || !String(x.url).trim()) continue;
    out.push({
      version: typeof x.version === "number" && Number.isFinite(x.version) ? x.version : i + 1,
      url: String(x.url).trim(),
      uploadedAt:
        typeof x.uploadedAt === "string" && x.uploadedAt.trim()
          ? x.uploadedAt.trim()
          : new Date().toISOString(),
    });
  }
  return out;
}

/** Blob パス用に見積番号をファイル名に使える形へ */
export function sanitizeEstimateNoForBlobPath(no: string): string {
  return String(no).replace(/[^\w.-]+/g, "_").slice(0, 120) || "estimate";
}
