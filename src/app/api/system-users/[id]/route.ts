import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const { id } = await params;
    const { name, email, password, role } = (await req.json()) as {
      name: string;
      email: string;
      password?: string;
      role: string;
    };
    if (!["admin", "approver"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // パスワードが空の場合は更新しない
    const rows = password
      ? await sql`
          UPDATE system_users
          SET name = ${name}, email = ${email},
              password = '',
              password_hash = ${await hashPassword(password)},
              password_migrated_at = NOW(),
              role = ${role}
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
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to update system user" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(req);
    const sql = getDb();
    const { id } = await params;
    // 自己削除を防ぐ
    if (session.sub === id) {
      return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
    }
    // 最後の admin の削除を防ぐ
    const target = (await sql`
      SELECT role FROM system_users WHERE id = ${id} LIMIT 1
    `) as Array<{ role: string }>;
    if (target.length === 0) {
      return new NextResponse(null, { status: 204 });
    }
    if (target[0].role === "admin") {
      const [{ cnt }] = (await sql`
        SELECT COUNT(*)::INT AS cnt FROM system_users WHERE role = 'admin'
      `) as Array<{ cnt: number }>;
      if (cnt <= 1) {
        return NextResponse.json({ error: "cannot_delete_last_admin" }, { status: 400 });
      }
    }
    await sql`DELETE FROM system_users WHERE id = ${id}`;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to delete system user" }, { status: 500 });
  }
}
