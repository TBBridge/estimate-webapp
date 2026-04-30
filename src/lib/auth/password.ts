/**
 * パスワードハッシュ操作（bcrypt）
 *
 * 移行戦略:
 * - 既存ユーザーは平文で保存されている。
 * - ログイン成功時に平文一致で認証 → 直後に bcrypt ハッシュを書き込み、平文側もそのまま残す
 *   （Phase 2: dual-write、Phase 3 で平文を空文字化）。
 *
 * Phase 1 ではこのモジュールは未使用。Phase 2 のログインフロー実装時に呼ぶ。
 */

import bcrypt from "bcryptjs";

/** bcrypt cost factor。Vercel Node ランタイムでハッシュ 1 回 ~250ms 想定。 */
export const BCRYPT_COST = 12;

/** タイミング攻撃を避けるためのダミーハッシュ（実在しないユーザーでも比較する用） */
let _dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!_dummyHash) {
    _dummyHash = await bcrypt.hash("dummy-not-a-real-password", BCRYPT_COST);
  }
  return _dummyHash;
}

/** 平文パスワードをハッシュ化 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) {
    throw new Error("hashPassword: 空のパスワードはハッシュできません");
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** ハッシュ照合 */
export async function verifyHash(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * 認証検証（移行対応）
 *
 * 入力 row が以下のどちらかなら true:
 *   - row.passwordHash があり、bcrypt.compare に成功
 *   - row.passwordHash がなく、row.legacyPlain と完全一致（移行前ユーザー）
 *
 * 「ユーザーが見つからなかった」呼び出しでは row=null を渡すと
 * ダミーハッシュ比較で時間を消費し、タイミング差で enumeration されるのを防ぐ。
 */
export async function verifyLoginPassword(
  input: string,
  row: { passwordHash: string | null; legacyPlain: string | null } | null
): Promise<{ ok: true; needsMigration: boolean } | { ok: false }> {
  if (!row) {
    // Enumeration 対策: ハッシュ比較と同等の時間を消費する
    await bcrypt.compare(input, await getDummyHash()).catch(() => false);
    return { ok: false };
  }

  if (row.passwordHash) {
    const ok = await verifyHash(input, row.passwordHash);
    return ok ? { ok: true, needsMigration: false } : { ok: false };
  }

  // 平文移行前
  if (row.legacyPlain && input === row.legacyPlain) {
    return { ok: true, needsMigration: true };
  }

  // 比較時間を稼ぐためダミーハッシュとも比較
  await bcrypt.compare(input, await getDummyHash()).catch(() => false);
  return { ok: false };
}
