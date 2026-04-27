import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { agencyMutationErrorResponse } from "@/app/api/agencies/agency-mutation-errors";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, login_password, agency_type, contact_name, department,
             phone_country_code, phone_local,
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
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    if (!name || !email) {
      return NextResponse.json({ error: "代理店名とログインメールは必須です" }, { status: 400 });
    }
    const loginPassword = String(body.loginPassword ?? "");
    const agencyType = String(body.agencyType ?? "");
    const contactName = String(body.contactName ?? "");
    const department = String(body.department ?? "");
    const phoneCountryCode = String(body.phoneCountryCode ?? "+81");
    const phoneLocal = String(body.phoneLocal ?? "");
    const approverName = String(body.approverName ?? "");
    const approverEmail = String(body.approverEmail ?? "");
    const rows = await sql`
      INSERT INTO agencies (
        name, email, login_password, agency_type, contact_name, department,
        phone_country_code, phone_local, fax_country_code, fax_local,
        approver_name, approver_email
      )
      VALUES (
        ${name}, ${email}, ${loginPassword}, ${agencyType},
        ${contactName}, ${department},
        ${phoneCountryCode}, ${phoneLocal},
        ${"+81"}, ${""},
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
      approverName: r.approver_name,
      approverEmail: r.approver_email,
      createdAt: r.created_at,
    }, { status: 201 });
  } catch (e) {
    return agencyMutationErrorResponse(e, "[agencies POST]");
  }
}
