/**
 * POST /api/auth/logout
 *
 * - Cookie からセッションを取得
 * - jti を session_revocations に登録（exp までは失効扱い）
 * - Cookie をクリア
 *
 * セッションが無くても 204 を返す（既にログアウト済み相当）。
 */
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import {
  buildClearSessionCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { AuthError, authErrorToResponse, ensureSameOrigin } from "@/lib/auth/guards";

export const runtime = "nodejs";

function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: Request) {
  // CSRF: クロスオリジンからの強制ログアウトを防止
  try {
    ensureSameOrigin(req);
  } catch (e) {
    if (e instanceof AuthError) return authErrorToResponse(e);
    throw e;
  }

  const token = readSessionCookie(req);
  if (token) {
    const session = await verifySessionToken(token);
    if (session) {
      try {
        const sql = getDb();
        const expiresAt = new Date(session.exp * 1000);
        await sql`
          INSERT INTO session_revocations (jti, user_id, expires_at)
          VALUES (${session.jti}, ${session.sub}, ${expiresAt.toISOString()})
          ON CONFLICT (jti) DO NOTHING
        `;
      } catch (e) {
        console.error("[auth/logout] revocation insert failed:", e);
        // Cookie は必ずクリアして応答する
      }
    }
  }

  const res = new NextResponse(null, { status: 204 });
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
}
