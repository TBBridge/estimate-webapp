import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildCsv } from "@/lib/csv";

export const runtime = "nodejs";

/**
 * インポート（import-csv）と同じ列名・順序:
 * name,email,loginPassword,agencyType,contactName,department,phoneCountryCode,phoneLocal,approverName,approverEmail
 */
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT name, email, login_password, agency_type, contact_name, department,
             phone_country_code, phone_local, approver_name, approver_email
      FROM agencies
      ORDER BY created_at ASC
    `;
    const header: string[] = [
      "name",
      "email",
      "loginPassword",
      "agencyType",
      "contactName",
      "department",
      "phoneCountryCode",
      "phoneLocal",
      "approverName",
      "approverEmail",
    ];
    const data: string[][] = [
      header,
      ...rows.map((r) => [
        String(r.name ?? ""),
        String(r.email ?? ""),
        String(r.login_password ?? ""),
        String(r.agency_type ?? ""),
        String(r.contact_name ?? ""),
        String(r.department ?? ""),
        String(r.phone_country_code ?? "+81"),
        String(r.phone_local ?? ""),
        String(r.approver_name ?? ""),
        String(r.approver_email ?? ""),
      ]),
    ];
    const body = "\uFEFF" + buildCsv(data);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        'Content-Disposition': 'attachment; filename="agencies.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[agencies export-csv]", e);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
