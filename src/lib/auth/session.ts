/**
 * セッション JWT 署名・検証 + Cookie 操作
 *
 * 設計:
 * - HttpOnly + Secure + SameSite=Lax + __Host- prefix の Cookie に JWT を載せる
 * - HS256 署名（jose、Web Crypto ベース。Edge runtime でも動作）
 * - スライディング 8 時間 / 絶対 7 日上限
 * - 失効は別テーブル session_revocations で管理（logout 時のみ）。
 *   middleware では署名のみ検証し、route handler 側で必要に応じて失効照合する。
 *
 * Phase 1 ではこのモジュール自体は呼ばれない。Phase 2 で
 *   - POST /api/auth/login が signSession + setSessionCookie
 *   - POST /api/auth/logout が clearSessionCookie + revoke
 *   - GET  /api/auth/me が readSession
 * から利用する。
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import type { Role } from "@/lib/constants";

/**
 * Cookie 名。`__Host-` prefix は Secure / Path=/ / Domain なし を強制する。
 *
 * 開発環境メモ:
 * 本 Cookie は `Secure` 属性必須（`__Host-` の制約）。
 * `http://localhost` ではブラウザが Cookie をサイレントに拒否するため、
 * ローカル開発では `next dev --experimental-https` などで HTTPS を有効化するか、
 * Vercel preview デプロイで動作確認すること。
 */
export const SESSION_COOKIE_NAME = "__Host-est_session";

/** スライディング・タイムアウト（idle expiry）。再延長時の新トークンの exp に使う */
export const SESSION_IDLE_TTL_SEC = 8 * 60 * 60; // 8h

/** 絶対上限。最初に発行された時刻から数えてこの期間を超えるトークンは延長しない */
export const SESSION_ABSOLUTE_TTL_SEC = 7 * 24 * 60 * 60; // 7d

/** スライディング更新の閾値。残り 50% を切ったら新しい exp で再発行する */
export const SESSION_RENEW_THRESHOLD_RATIO = 0.5;

const SESSION_AUDIENCE = "estimate-webapp";
const SESSION_ISSUER = "estimate-webapp";

export type SessionPayload = {
  /** ユーザー ID（system_users.id または agencies.id） */
  sub: string;
  /** ロール */
  role: Role;
  /** 代理店ロールのみ。ログイン時の代理店 ID（estimates.agency_id と突合） */
  agencyId?: string;
  /** トークン固有 ID。失効リスト照合用 */
  jti: string;
  /** トークン発行時刻 (秒) */
  iat: number;
  /** トークン有効期限 (秒)。スライディング延長で書き換わる */
  exp: number;
  /** 絶対上限期限 (秒)。スライディング延長でも変わらない */
  iat0: number;
};

export type Session = Pick<SessionPayload, "sub" | "role" | "agencyId" | "jti" | "exp" | "iat0">;

/** 環境変数から HS256 用のシークレット鍵を取得（hex 32 バイト以上を必須とする） */
function getSecretKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "AUTH_SECRET が設定されていません。32 バイト以上のランダム値（hex 推奨）を環境変数で設定してください。"
    );
  }
  if (raw.length < 32) {
    throw new Error("AUTH_SECRET は 32 文字以上の値にしてください。");
  }
  return new TextEncoder().encode(raw);
}

/** 新規セッション JWT を発行（ログイン直後に呼ぶ） */
export async function signSession(input: {
  sub: string;
  role: Role;
  agencyId?: string;
}): Promise<{ token: string; expiresAt: Date; jti: string }> {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const exp = now + SESSION_IDLE_TTL_SEC;

  const payload: SessionPayload = {
    sub: input.sub,
    role: input.role,
    agencyId: input.agencyId,
    jti,
    iat: now,
    exp,
    iat0: now,
  };

  const token = await new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(input.sub)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecretKey());

  return { token, expiresAt: new Date(exp * 1000), jti };
}

/**
 * 既存セッションを延長して新しいトークンを発行（スライディング更新）。
 * 絶対上限 (iat0 + ABSOLUTE_TTL) を超えるならば null を返す（再ログインを促す）。
 */
export async function renewSession(prev: Session): Promise<{ token: string; expiresAt: Date } | null> {
  const now = Math.floor(Date.now() / 1000);
  const absoluteCutoff = prev.iat0 + SESSION_ABSOLUTE_TTL_SEC;
  if (now >= absoluteCutoff) return null;

  const newExp = Math.min(now + SESSION_IDLE_TTL_SEC, absoluteCutoff);

  const payload: SessionPayload = {
    sub: prev.sub,
    role: prev.role,
    agencyId: prev.agencyId,
    jti: prev.jti, // jti は引き継ぐ（失効リストの一貫性確保）
    iat: now,
    exp: newExp,
    iat0: prev.iat0,
  };

  const token = await new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(prev.sub)
    .setJti(prev.jti)
    .setIssuedAt(now)
    .setExpirationTime(newExp)
    .sign(getSecretKey());

  return { token, expiresAt: new Date(newExp * 1000) };
}

/** スライディング延長が必要かを判定（残り <50% で true） */
export function shouldRenewSession(s: Session): boolean {
  const now = Math.floor(Date.now() / 1000);
  const remaining = s.exp - now;
  if (remaining <= 0) return false; // 期限切れは延長不可
  if (remaining < SESSION_IDLE_TTL_SEC * SESSION_RENEW_THRESHOLD_RATIO) return true;
  return false;
}

/** トークン文字列を検証して Session を返す。署名・有効期限・claims のみ。失効リストは照合しない。 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    const role = (payload as { role?: unknown }).role;
    const agencyId = (payload as { agencyId?: unknown }).agencyId;
    const iat0 = (payload as { iat0?: unknown }).iat0;
    const exp = payload.exp;

    if (!sub || !jti) return null;
    if (typeof exp !== "number" || typeof iat0 !== "number") return null;
    if (role !== "admin" && role !== "approver" && role !== "agency") return null;
    if (agencyId !== undefined && typeof agencyId !== "string") return null;

    // 絶対上限チェック（jose は exp は見るが iat0 は知らない）
    const now = Math.floor(Date.now() / 1000);
    if (now >= iat0 + SESSION_ABSOLUTE_TTL_SEC) return null;

    return {
      sub,
      role: role as Role,
      agencyId: agencyId as string | undefined,
      jti,
      exp,
      iat0,
    };
  } catch {
    return null;
  }
}

/**
 * Set-Cookie ヘッダ文字列（NextResponse.cookies.set でも代替可能だが、
 * route handler / middleware 双方で使えるよう生成関数も用意）
 */
export function buildSessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  // __Host- prefix のため Domain 属性は付けない / Path=/ 必須 / Secure 必須
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function buildClearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
    // 古いプロキシ・非標準クライアント対策で Expires も併記
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}
