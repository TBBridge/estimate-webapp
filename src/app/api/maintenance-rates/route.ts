import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, agency_id, agency_name, CAST(rate AS FLOAT) AS rate
      FROM maintenance_rates
      ORDER BY agency_name
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, agencyId: r.agency_id, agencyName: r.agency_name, rate: Number(r.rate),
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch maintenance rates" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const sql = getDb();
    const { id, rate } = await req.json();
    const rows = await sql`
      UPDATE maintenance_rates SET rate = ${rate} WHERE id = ${id}
      RETURNING id, agency_id, agency_name, CAST(rate AS FLOAT) AS rate
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, agencyId: r.agency_id, agencyName: r.agency_name, rate: Number(r.rate),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update maintenance rate" }, { status: 500 });
  }
}
