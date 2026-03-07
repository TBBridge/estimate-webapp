/**
 * Neon Postgres 接続ヘルパー
 * 環境変数 DATABASE_URL（Vercel 統合で自動設定）を使用する
 * リクエスト時にのみ接続を初期化する（ビルド時はスキップ）
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
