/**
 * POST /api/auth/login
 *
 * 代理店ログイン認証。
 * agencies テーブルの email + login_password で認証し、ユーザー情報を返す。
 * 管理者・承認者はこのエンドポイントを使用しない（クライアント側ハードコード）。
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };

    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email
      FROM agencies
      WHERE email = ${email}
        AND login_password = ${password}
        AND login_password != ''
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    const ag = rows[0];
    return NextResponse.json({
      id: ag.id,
      name: ag.name,
      email: ag.email,
      role: "agency",
      agencyId: ag.id,
    });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
