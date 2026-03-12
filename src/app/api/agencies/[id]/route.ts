import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { name, email, loginPassword, agencyType, approverName, approverEmail } = await req.json();
    const rows = await sql`
      UPDATE agencies
      SET name = ${name}, email = ${email},
          login_password = ${loginPassword ?? ""},
          agency_type = ${agencyType ?? ""},
          approver_name = ${approverName}, approver_email = ${approverEmail}
      WHERE id = ${id}
      RETURNING id, name, email, login_password, agency_type, approver_name, approver_email,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, name: r.name, email: r.email,
      loginPassword: r.login_password,
      agencyType: r.agency_type ?? "",
      approverName: r.approver_name, approverEmail: r.approver_email, createdAt: r.created_at,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update agency" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    await sql`DELETE FROM agencies WHERE id = ${id}`;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete agency" }, { status: 500 });
  }
}
