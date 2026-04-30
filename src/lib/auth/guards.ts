/**
 * route handler 用の認可ヘルパ
 *
 * Phase 1 ではこのモジュールは未使用。Phase 3 で各 API に適用する。
 *
 * 使い方:
 *   const session = await requireAdmin(req);
 *   const session = await requireRole(req, ["admin", "approver"]);
 *   const session = await requireEstimateAccess(req, estimateId);
 *
 * 失敗時は AuthError を投げ、各 route handler はこれを toResponse() で
 * NextResponse.json + status に変換する。
 */

import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import type { Role } from "@/lib/constants";
import { isUndefinedTable } from "@/lib/pg-errors";

import {
  getSessionCookieName,
  verifySessionToken,
  type Session,
} from "./session";

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function authErrorToResponse(err: AuthError): NextResponse {
  return NextResponse.json(
    { error: err.code },
    { status: err.status }
  );
}

/** 共通エラーハンドラ。catch 節でこれを呼び、認可エラー以外は再 throw する */
export function handleAuthError(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return authErrorToResponse(err);
  }
  return null;
}

/** Cookie ヘッダから JWT 文字列を抽出 */
function extractTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() === getSessionCookieName()) {
      const value = rest.join("=").trim();
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** 失効済みかを DB で確認（route handler 専用。middleware では呼ばない） */
async function isRevoked(jti: string): Promise<boolean> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT 1 FROM session_revocations WHERE jti = ${jti} LIMIT 1
    `;
    return rows.length > 0;
  } catch (e) {
    // テーブル未作成（004 未適用）のみ「未失効」とみなす。それ以外の DB 障害は拒否。
    if (isUndefinedTable(e)) {
      console.warn(
        "[auth/guards] session_revocations が無いか未作成です。004_auth.sql を適用してください。失効チェックをスキップします。"
      );
      return false;
    }
    console.error("[auth/guards] revocation check failed:", e);
    return true;
  }
}

/** Cookie からセッションを読み出し、署名・期限・失効を全てチェック。失敗時は null */
export async function getSession(req: Request): Promise<Session | null> {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (await isRevoked(session.jti)) return null;
  return session;
}

/**
 * 状態変更系 (POST/PUT/PATCH/DELETE) に対する Origin ヘッダ検証（CSRF 防御層）
 *
 * - GET/HEAD/OPTIONS はスキップ
 * - Origin ヘッダ不在のリクエストは許可（curl / 一部内部呼び出し）
 * - NEXT_PUBLIC_BASE_URL 未設定: 本番では fail-close (500)、それ以外（dev/test）はスキップ
 *
 * login など Phase 3 のガード対象外でも CSRF が必要な箇所からも利用するため public。
 */
export function ensureSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = req.headers.get("origin");
  if (!origin) return;

  const allowed = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!allowed) {
    // 本番で env を取り違えると CSRF 防御が黙って無効化されるのを防ぐ
    if (process.env.NODE_ENV === "production") {
      throw new AuthError(500, "csrf_config_missing");
    }
    // dev/staging でも気づけるように警告ログを残す
    console.warn(
      "[auth/guards] NEXT_PUBLIC_BASE_URL not set — CSRF Origin check is DISABLED for this request"
    );
    return;
  }

  try {
    const allowedOrigins = new Set<string>();
    allowedOrigins.add(new URL(allowed).origin);
    const vercelHost = process.env.VERCEL_URL?.trim();
    if (vercelHost) {
      allowedOrigins.add(new URL(`https://${vercelHost}`).origin);
    }
    const b = new URL(origin).origin;
    if (!allowedOrigins.has(b)) {
      throw new AuthError(403, "csrf_origin_mismatch");
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(403, "csrf_origin_invalid");
  }
}

/** 認証必須。失敗時 AuthError(401)。 */
export async function requireAuth(req: Request): Promise<Session> {
  ensureSameOrigin(req);
  const session = await getSession(req);
  if (!session) throw new AuthError(401, "unauthenticated");
  return session;
}

/** 認証 + ロール要求。失敗時 401 (未認証) / 403 (権限不足)。 */
export async function requireRole(
  req: Request,
  roles: ReadonlyArray<Role>
): Promise<Session> {
  const session = await requireAuth(req);
  if (!roles.includes(session.role)) {
    throw new AuthError(403, "forbidden");
  }
  return session;
}

export function requireAdmin(req: Request): Promise<Session> {
  return requireRole(req, ["admin"]);
}

export function requireAdminOrApprover(req: Request): Promise<Session> {
  return requireRole(req, ["admin", "approver"]);
}

/**
 * 見積アクセス権限チェック:
 * - admin / approver: 常に可
 * - agency: 当該見積の agency_id が session.agencyId と一致する場合のみ可
 */
export async function requireEstimateAccess(
  req: Request,
  estimateId: string
): Promise<Session> {
  const session = await requireAuth(req);
  if (session.role === "admin" || session.role === "approver") {
    return session;
  }
  if (session.role === "agency") {
    if (!session.agencyId) throw new AuthError(403, "forbidden");
    const sql = getDb();
    const rows = await sql`
      SELECT agency_id FROM estimates WHERE id = ${estimateId} LIMIT 1
    `;
    if (rows.length === 0) throw new AuthError(404, "not_found");
    if (rows[0].agency_id !== session.agencyId) {
      throw new AuthError(403, "forbidden");
    }
    return session;
  }
  throw new AuthError(403, "forbidden");
}
