/**
 * Neon / node-postgres がネストした形で返す Postgres エラーコードを集める
 */
export function collectPostgresCodes(e: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  const codes: string[] = [];
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.code === "string" && /^\d{5}$/.test(o.code)) {
      codes.push(o.code);
    }
    if (o.cause) codes.push(...collectPostgresCodes(o.cause, depth + 1));
    if (o.sourceError) codes.push(...collectPostgresCodes(o.sourceError, depth + 1));
  }
  return codes;
}

export function isUniqueViolation(e: unknown): boolean {
  return collectPostgresCodes(e).includes("23505");
}

/** ログ・管理者向けに短いメッセージを取り出す */
export function getErrorChainMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}
