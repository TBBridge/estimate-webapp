import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, login_password, approver_name, approver_email,
             TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
      FROM agencies
      ORDER BY created_at ASC
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, name: r.name, email: r.email,
      loginPassword: r.login_password,
      approverName: r.approver_name, approverEmail: r.approver_email, createdAt: r.created_at,
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch agencies" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { name, email, loginPassword, approverName, approverEmail } = await req.json();
    const rows = await sql`
      INSERT INTO agencies (name, email, login_password, approver_name, approver_email)
      VALUES (${name}, ${email}, ${loginPassword ?? ""}, ${approverName}, ${approverEmail})
      RETURNING id, name, email, login_password, approver_name, approver_email,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id, name: r.name, email: r.email,
      loginPassword: r.login_password,
      approverName: r.approver_name, approverEmail: r.approver_email, createdAt: r.created_at,
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create agency" }, { status: 500 });
  }
}
