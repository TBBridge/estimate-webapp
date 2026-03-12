import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
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
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch system users" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { name, email, password, role } = await req.json();
    if (!["admin", "approver"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const rows = await sql`
      INSERT INTO system_users (name, email, password, role)
      VALUES (${name}, ${email}, ${password ?? ""}, ${role})
      RETURNING id, name, email, role,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id, name: r.name, email: r.email,
      role: r.role, createdAt: r.created_at,
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create system user" }, { status: 500 });
  }
}
