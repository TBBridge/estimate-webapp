import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildCsv } from "@/lib/csv";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";

export const runtime = "nodejs";

/**
 * セキュリティ要件: パスワード列はエクスポートしない（平文流出防止）。
 * 再インポートでは loginPassword 列が空の場合は更新しない方針なので、
 * 列自体を出力しないことで運用上の事故を防ぐ。
 *
 * 出力列:
 * name,email,agencyType,contactName,department,phoneCountryCode,phoneLocal,approverName,approverEmail
 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const rows = await sql`
      SELECT name, email, agency_type, contact_name, department,
             phone_country_code, phone_local, approver_name, approver_email
      FROM agencies
      ORDER BY created_at ASC
    `;
    const header: string[] = [
      "name",
      "email",
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
        String(r.agency_type ?? ""),
        String(r.contact_name ?? ""),
        String(r.department ?? ""),
        String(r.phone_country_code ?? "+81"),
        String(r.phone_local ?? ""),
        String(r.approver_name ?? ""),
        String(r.approver_email ?? ""),
      ]),
    ];
    const body = "﻿" + buildCsv(data);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        'Content-Disposition': 'attachment; filename="agencies.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[agencies export-csv]", e);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
