/**
 * POST /api/auth/login
 *
 * 全ロール共通のログイン認証。
 * 1. system_users テーブル（admin / approver）で照合
 * 2. agencies テーブル（agency）で照合
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };
    const sql = getDb();

    // ── 管理者・承認者認証 ────────────────────────────────
    const sysRows = await sql`
      SELECT id, name, email, role
      FROM system_users
      WHERE email = ${email}
        AND password = ${password}
        AND password != ''
    `;
    if (sysRows.length > 0) {
      const u = sysRows[0];
      return NextResponse.json({
        id: u.id, name: u.name, email: u.email, role: u.role,
      });
    }

    // ── 代理店認証 ────────────────────────────────────────
    const agRows = await sql`
      SELECT id, name, email
      FROM agencies
      WHERE email = ${email}
        AND login_password = ${password}
        AND login_password != ''
    `;
    if (agRows.length > 0) {
      const ag = agRows[0];
      return NextResponse.json({
        id: ag.id, name: ag.name, email: ag.email,
        role: "agency", agencyId: ag.id,
      });
    }

    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
