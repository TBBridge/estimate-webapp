/**
 * POST /api/auth/login
 *
 * 全ロール共通のログイン認証。
 * 1. system_users テーブル（admin / approver）で照合
 * 2. agencies テーブル（agency）で照合
 *
 * Phase 3: 平文列の空文字化
 * - password_hash があれば bcrypt で照合
 * - 無ければ平文 (password / login_password) と照合 → 成功時に bcrypt ハッシュを書き込み、
 *   同時に平文列を空文字化する（dual-write 停止）。
 *
 * 認証成功時は JWT セッションを HttpOnly Cookie に発行する。
 *
 * セキュリティ要件:
 * - タイミング攻撃防止のため両テーブルへのクエリと bcrypt 比較を常に実行
 * - login CSRF 防止のため Origin ヘッダを同一オリジンに制限
 * - 並行ログイン時のハッシュ clobber 防止のため UPDATE は WHERE password_hash IS NULL で保護
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { signSession, buildSessionCookie } from "@/lib/auth/session";
import { hashPassword, verifyLoginPassword } from "@/lib/auth/password";
import { AuthError, authErrorToResponse, ensureSameOrigin } from "@/lib/auth/guards";
import { isValidLoginId, normalizeLoginId } from "@/lib/login-id";

export const runtime = "nodejs";

const LoginSchema = z.object({
  loginId: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1).max(200),
}).transform((value) => ({
  loginId: normalizeLoginId(value.loginId ?? value.email),
  password: value.password,
})).refine((value) => isValidLoginId(value.loginId), {
  path: ["loginId"],
});

type SystemUserRow = {
  id: string;
  name: string;
  login_id: string;
  email: string;
  role: "admin" | "approver";
  password: string | null;
  password_hash: string | null;
};

type AgencyRow = {
  id: string;
  name: string;
  login_id: string;
  email: string;
  login_password: string | null;
  password_hash: string | null;
};

function getClientIp(req: Request): string | null {
  // 注: X-Forwarded-For の最左ホップは攻撃者制御可能。
  //     Vercel デプロイ前提では x-real-ip / x-vercel-forwarded-for が信頼できるホップを示すため優先。
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim() || null;
  const vfwd = req.headers.get("x-vercel-forwarded-for");
  if (vfwd) return vfwd.split(",")[0]?.trim() || null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return null;
}

async function logAttempt(
  loginId: string | null,
  ip: string | null,
  success: boolean
): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      INSERT INTO login_attempts (email, ip, success)
      VALUES (${loginId}, ${ip}, ${success})
    `;
  } catch (e) {
    // ログ失敗は認証フローを止めない
    console.error("[auth/login] login_attempts insert failed:", e);
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // login CSRF 防止: 同一オリジンからのリクエストのみ許可（GET 以外で必須）
  try {
    ensureSameOrigin(req);
  } catch (e) {
    if (e instanceof AuthError) return authErrorToResponse(e);
    throw e;
  }

  let parsed: z.infer<typeof LoginSchema>;
  try {
    const raw = await req.json();
    parsed = LoginSchema.parse(raw);
  } catch {
    await logAttempt(null, ip, false);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { loginId, password } = parsed;
  const sql = getDb();

  try {
    // ── 両テーブルを並列クエリ + 両方の bcrypt 比較を必ず実行 ─────────────
    // タイミング攻撃により「どちらのテーブルにログインIDがあるか」を
    // 検出されるのを防ぐため、ヒット有無に関わらず常に一定の処理を行う。
    const [sysRowsRaw, agRowsRaw] = await Promise.all([
      sql`
        SELECT id, name, login_id, email, role, password, password_hash
        FROM system_users
        WHERE login_id = ${loginId}
        LIMIT 1
      `,
      sql`
        SELECT id, name, login_id, email, login_password, password_hash
        FROM agencies
        WHERE login_id = ${loginId}
        LIMIT 1
      `,
    ]);
    const sysRow = (sysRowsRaw as SystemUserRow[])[0] ?? null;
    const agRow = (agRowsRaw as AgencyRow[])[0] ?? null;

    const [sysResult, agResult] = await Promise.all([
      verifyLoginPassword(
        password,
        sysRow ? { passwordHash: sysRow.password_hash, legacyPlain: sysRow.password } : null
      ),
      verifyLoginPassword(
        password,
        agRow ? { passwordHash: agRow.password_hash, legacyPlain: agRow.login_password } : null
      ),
    ]);

    if (sysRow && sysResult.ok) {
      if (sysResult.needsMigration) {
        const newHash = await hashPassword(password);
        // race-safe: 既にハッシュ移行済みの行には書き込まない。
        // 平文列も同時に空文字化する（dual-write 停止）。
        await sql`
          UPDATE system_users
          SET password_hash = ${newHash},
              password = '',
              password_migrated_at = NOW()
          WHERE id = ${sysRow.id} AND password_hash IS NULL
        `;
      }
      return await issueSessionResponse({
        id: sysRow.id,
        name: sysRow.name,
        loginId: sysRow.login_id,
        email: sysRow.email,
        role: sysRow.role,
      });
    }

    if (agRow && agResult.ok) {
      if (agResult.needsMigration) {
        const newHash = await hashPassword(password);
        await sql`
          UPDATE agencies
          SET password_hash = ${newHash},
              login_password = '',
              password_migrated_at = NOW()
          WHERE id = ${agRow.id} AND password_hash IS NULL
        `;
      }
      return await issueSessionResponse({
        id: agRow.id,
        name: agRow.name,
        loginId: agRow.login_id,
        email: agRow.email,
        role: "agency",
        agencyId: agRow.id,
      });
    }

    await logAttempt(loginId, ip, false);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  } catch (e) {
    console.error("[auth/login]", e);
    await logAttempt(loginId, ip, false);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  /** セッション発行 + Cookie 設定 + ユーザー JSON 応答 */
  async function issueSessionResponse(user: {
    id: string;
    name: string;
    loginId: string;
    email: string;
    role: "admin" | "approver" | "agency";
    agencyId?: string;
  }): Promise<NextResponse> {
    const { token, expiresAt } = await signSession({
      sub: user.id,
      role: user.role,
      agencyId: user.agencyId,
    });

    await logAttempt(user.email, ip, true);

    const res = NextResponse.json({
      id: user.id,
      name: user.name,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      ...(user.agencyId ? { agencyId: user.agencyId } : {}),
    });
    res.headers.append("Set-Cookie", buildSessionCookie(token, expiresAt));
    return res;
  }
}
