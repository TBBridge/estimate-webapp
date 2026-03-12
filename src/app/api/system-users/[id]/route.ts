import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { name, email, password, role } = await req.json();
    if (!["admin", "approver"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // パスワードが空の場合は更新しない
    const rows = password
      ? await sql`
          UPDATE system_users
          SET name = ${name}, email = ${email}, password = ${password}, role = ${role}
          WHERE id = ${id}
          RETURNING id, name, email, role,
                    TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
        `
      : await sql`
          UPDATE system_users
          SET name = ${name}, email = ${email}, role = ${role}
          WHERE id = ${id}
          RETURNING id, name, email, role,
                    TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
        `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, name: r.name, email: r.email,
      role: r.role, createdAt: r.created_at,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update system user" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    await sql`DELETE FROM system_users WHERE id = ${id}`;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete system user" }, { status: 500 });
  }
}
