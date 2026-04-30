/**
 * GET /api/auth/me
 *
 * 現在のセッションの最新ユーザー情報を返す（クライアントの再水和用）。
 * - Cookie から session を取得
 * - DB から最新の name/role を引いて返す（削除済み・ロール変更時は 401）
 *
 * Phase 2 ではガード未適用 (Phase 3 で全エンドポイントに適用) だが、
 * このエンドポイント自体は内部で getSession を呼ぶ。
 */
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/guards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const sql = getDb();

    if (session.role === "agency") {
      // TODO(future): agencies テーブルに role 列が追加された場合は
      // session.role と一致するかチェックする（system_users と同様）。
      const rows = (await sql`
        SELECT id, name, email FROM agencies WHERE id = ${session.sub} LIMIT 1
      `) as Array<{ id: string; name: string; email: string }>;
      if (rows.length === 0) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      }
      const ag = rows[0];
      return NextResponse.json({
        id: ag.id,
        name: ag.name,
        email: ag.email,
        role: "agency",
        agencyId: ag.id,
      });
    }

    // admin / approver
    const rows = (await sql`
      SELECT id, name, email, role
      FROM system_users
      WHERE id = ${session.sub} LIMIT 1
    `) as Array<{
      id: string;
      name: string;
      email: string;
      role: "admin" | "approver";
    }>;
    if (rows.length === 0) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const u = rows[0];
    if (u.role !== session.role) {
      // ロールが変更されたユーザーは安全のため再ログインさせる
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.json({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    });
  } catch (e) {
    console.error("[auth/me]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
