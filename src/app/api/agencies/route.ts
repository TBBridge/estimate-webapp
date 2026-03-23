import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, login_password, agency_type, contact_name, department,
             phone_country_code, phone_local, fax_country_code, fax_local,
             approver_name, approver_email,
             TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
      FROM agencies
      ORDER BY created_at ASC
    `;
    return NextResponse.json(rows.map((r) => ({
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
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch agencies" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
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
      INSERT INTO agencies (
        name, email, login_password, agency_type, contact_name, department,
        phone_country_code, phone_local, fax_country_code, fax_local,
        approver_name, approver_email
      )
      VALUES (
        ${name}, ${email}, ${loginPassword ?? ""}, ${agencyType ?? ""},
        ${contactName ?? ""}, ${department ?? ""},
        ${phoneCountryCode ?? "+81"}, ${phoneLocal ?? ""},
        ${faxCountryCode ?? "+81"}, ${faxLocal ?? ""},
        ${approverName}, ${approverEmail}
      )
      RETURNING id, name, email, login_password, agency_type, contact_name, department,
                phone_country_code, phone_local, fax_country_code, fax_local,
                approver_name, approver_email,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
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
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create agency" }, { status: 500 });
  }
}
