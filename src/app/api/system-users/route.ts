import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, role,
             TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
      FROM system_users
      ORDER BY role ASC, created_at ASC
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, name: r.name, email: r.email,
      role: r.role, createdAt: r.created_at,
    })));
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch system users" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const { name, email, password, role } = (await req.json()) as {
      name: string;
      email: string;
      password: string;
      role: string;
    };
    if (!["admin", "approver"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 1) {
      return NextResponse.json({ error: "password_required" }, { status: 400 });
    }
    const hash = await hashPassword(password);
    const rows = await sql`
      INSERT INTO system_users (name, email, password, password_hash, password_migrated_at, role)
      VALUES (${name}, ${email}, '', ${hash}, NOW(), ${role})
      RETURNING id, name, email, role,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id, name: r.name, email: r.email,
      role: r.role, createdAt: r.created_at,
    }, { status: 201 });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to create system user" }, { status: 500 });
  }
}
