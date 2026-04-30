/**
 * Next.js Middleware（edge runtime）
 *
 * Phase 3: 遮断モード
 *   - /api/auth/login, /api/auth/logout, /api/auth/me, /login は常に許可（公開エンドポイント）
 *   - その他の /api/** は未認証なら 401 を返す
 *   - /admin/**, /approver/**, /agency/** は未認証なら /login へリダイレクト
 *   - 検証成功 + 残り < 50% ならスライディング更新 Cookie を発行
 *
 * 失効リスト（DB）の照合は edge では行わない。route handler の getSession() で実施する。
 * このミドルウェアは粗いゲート（署名・期限のみ）。最終的な認可は各 route の guard が担う。
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  getSessionCookieName,
  buildClearSessionCookie,
  buildSessionCookie,
  renewSession,
  shouldRenewSession,
  verifySessionToken,
} from "@/lib/auth/session";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)"],
};

/** 認証不要のパス（完全一致または prefix） */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/") return true;
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/me"
  ) {
    return true;
  }
  return false;
}

/** API パスかどうか */
function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** 認証必須のページパス（未認証時は /login へリダイレクト） */
function isProtectedPagePath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/approver") ||
    pathname.startsWith("/agency")
  );
}

function unauthenticatedApiResponse(): NextResponse {
  const res = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = isPublicPath(pathname);
  const isApi = isApiPath(pathname);
  const isProtectedPage = isProtectedPagePath(pathname);

  const token = req.cookies.get(getSessionCookieName())?.value;

  // 公開パス: Cookie の維持・更新のみ（認証は要求しない）
  if (isPublic) {
    if (!token) return NextResponse.next();
    const session = await verifySessionToken(token);
    if (!session) {
      const res = NextResponse.next();
      res.headers.append("Set-Cookie", buildClearSessionCookie());
      return res;
    }
    if (shouldRenewSession(session)) {
      const renewed = await renewSession(session);
      const res = NextResponse.next();
      if (renewed) {
        res.headers.append("Set-Cookie", buildSessionCookie(renewed.token, renewed.expiresAt));
      } else {
        res.headers.append("Set-Cookie", buildClearSessionCookie());
      }
      return res;
    }
    return NextResponse.next();
  }

  // 保護対象 API
  if (isApi) {
    if (!token) return unauthenticatedApiResponse();
    const session = await verifySessionToken(token);
    if (!session) return unauthenticatedApiResponse();

    if (shouldRenewSession(session)) {
      const renewed = await renewSession(session);
      if (renewed) {
        const res = NextResponse.next();
        res.headers.append("Set-Cookie", buildSessionCookie(renewed.token, renewed.expiresAt));
        return res;
      }
      return unauthenticatedApiResponse();
    }
    return NextResponse.next();
  }

  // 保護対象ページ
  if (isProtectedPage) {
    if (!token) return redirectToLogin(req);
    const session = await verifySessionToken(token);
    if (!session) return redirectToLogin(req);

    if (shouldRenewSession(session)) {
      const renewed = await renewSession(session);
      if (renewed) {
        const res = NextResponse.next();
        res.headers.append("Set-Cookie", buildSessionCookie(renewed.token, renewed.expiresAt));
        return res;
      }
      return redirectToLogin(req);
    }
    return NextResponse.next();
  }

  // それ以外（静的アセット相当の未マッチ）: そのまま通す
  return NextResponse.next();
}
