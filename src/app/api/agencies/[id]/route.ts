import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const rows = await sql`
      SELECT id, name, email, agency_type, contact_name, department,
             phone_country_code, phone_local, fax_country_code, fax_local,
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
      faxCountryCode: r.fax_country_code ?? "+81",
      faxLocal: r.fax_local ?? "",
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
    const {
      name,
      email,
      loginPassword,
      agencyType,
      contactName,
      department,
      phoneCountryCode,
      phoneLocal,
      faxCountryCode,
      faxLocal,
      approverName,
      approverEmail,
    } = body as Record<string, string | undefined>;
    const rows = await sql`
      UPDATE agencies
      SET name = ${name}, email = ${email},
          login_password = ${loginPassword ?? ""},
          agency_type = ${agencyType ?? ""},
          contact_name = ${contactName ?? ""},
          department = ${department ?? ""},
          phone_country_code = ${phoneCountryCode ?? "+81"},
          phone_local = ${phoneLocal ?? ""},
          fax_country_code = ${faxCountryCode ?? "+81"},
          fax_local = ${faxLocal ?? ""},
          approver_name = ${approverName}, approver_email = ${approverEmail}
      WHERE id = ${id}
      RETURNING id, name, email, login_password, agency_type, contact_name, department,
                phone_country_code, phone_local, fax_country_code, fax_local,
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
      faxCountryCode: r.fax_country_code ?? "+81",
      faxLocal: r.fax_local ?? "",
      approverName: r.approver_name,
      approverEmail: r.approver_email,
      createdAt: r.created_at,
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
