/**
 * Neon Postgres 接続ヘルパー
 * Vercel の Neon 連携では DATABASE_URL または POSTGRES_URL 等が付与されることがあります。
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

/** 接続文字列を解決（優先順位は一般的な Vercel / Neon の付与パターンに合わせる） */
export function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Database URL is not set. Configure DATABASE_URL or POSTGRES_URL (Vercel: Storage > Neon > .env preview)."
    );
  }
  return url;
}

export function getDb(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(getDatabaseUrl());
  }
  return _sql;
}
