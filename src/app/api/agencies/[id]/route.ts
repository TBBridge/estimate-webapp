import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { agencyMutationErrorResponse } from "@/app/api/agencies/agency-mutation-errors";
import { isForeignKeyViolation } from "@/lib/pg-errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const rows = await sql`
      SELECT id, name, email, agency_type, contact_name, department,
             phone_country_code, phone_local,
             approver_name, approver_email,
             TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
      FROM agencies
      WHERE id = ${id}
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id,
      name: r.name,
      email: r.email,
      agencyType: r.agency_type ?? "",
      contactName: r.contact_name ?? "",
      department: r.department ?? "",
      phoneCountryCode: r.phone_country_code ?? "+81",
      phoneLocal: r.phone_local ?? "",
      approverName: r.approver_name,
      approverEmail: r.approver_email,
      createdAt: r.created_at,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch agency" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = await req.json();
    const b = body as Record<string, unknown>;
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim();
    const loginPassword = String(b.loginPassword ?? "");
    const agencyType = String(b.agencyType ?? "");
    const contactName = String(b.contactName ?? "");
    const department = String(b.department ?? "");
    const phoneCountryCode = String(b.phoneCountryCode ?? "+81");
    const phoneLocal = String(b.phoneLocal ?? "");
    const approverName = String(b.approverName ?? "");
    const approverEmail = String(b.approverEmail ?? "");
    if (!name || !email) {
      return NextResponse.json({ error: "代理店名とログインメールは必須です" }, { status: 400 });
    }
    const rows = await sql`
      UPDATE agencies
      SET name = ${name}, email = ${email},
          login_password = ${loginPassword},
          agency_type = ${agencyType},
          contact_name = ${contactName},
          department = ${department},
          phone_country_code = ${phoneCountryCode},
          phone_local = ${phoneLocal},
          fax_country_code = ${"+81"},
          fax_local = ${""},
          approver_name = ${approverName}, approver_email = ${approverEmail}
      WHERE id = ${id}
      RETURNING id, name, email, login_password, agency_type, contact_name, department,
                phone_country_code, phone_local,
                approver_name, approver_email,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id,
      name: r.name,
      email: r.email,
      loginPassword: r.login_password,
      agencyType: r.agency_type ?? "",
      contactName: r.contact_name ?? "",
      department: r.department ?? "",
      phoneCountryCode: r.phone_country_code ?? "+81",
      phoneLocal: r.phone_local ?? "",
      approverName: r.approver_name,
      approverEmail: r.approver_email,
      createdAt: r.created_at,
    });
  } catch (e) {
    return agencyMutationErrorResponse(e, "[agencies PUT]");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    await sql`DELETE FROM agencies WHERE id = ${id}`;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[agencies DELETE]", e);
    if (isForeignKeyViolation(e)) {
      return NextResponse.json({ error: "delete_blocked_estimates" }, { status: 409 });
    }
    return NextResponse.json({ error: "agency_delete_failed" }, { status: 500 });
  }
}
