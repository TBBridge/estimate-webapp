import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, agency_id, agency_name, product_id, delivery_type,
             CAST(rate AS FLOAT) AS rate
      FROM margin_rates
      ORDER BY agency_id, product_id, delivery_type
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, agencyId: r.agency_id, agencyName: r.agency_name,
      productId: r.product_id, deliveryType: r.delivery_type, rate: Number(r.rate),
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch margin rates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { agencyId, agencyName, productId, deliveryType, rate } = await req.json();
    const rows = await sql`
      INSERT INTO margin_rates (agency_id, agency_name, product_id, delivery_type, rate)
      VALUES (${agencyId}, ${agencyName}, ${productId}, ${deliveryType}, ${rate})
      ON CONFLICT (agency_id, product_id, delivery_type) DO UPDATE
        SET rate = EXCLUDED.rate, agency_name = EXCLUDED.agency_name
      RETURNING id, agency_id, agency_name, product_id, delivery_type,
                CAST(rate AS FLOAT) AS rate
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id, agencyId: r.agency_id, agencyName: r.agency_name,
      productId: r.product_id, deliveryType: r.delivery_type, rate: Number(r.rate),
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create margin rate" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const sql = getDb();
    const { id, rate } = await req.json();
    const rows = await sql`
      UPDATE margin_rates SET rate = ${rate} WHERE id = ${id}
      RETURNING id, agency_id, agency_name, product_id, delivery_type,
                CAST(rate AS FLOAT) AS rate
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, agencyId: r.agency_id, agencyName: r.agency_name,
      productId: r.product_id, deliveryType: r.delivery_type, rate: Number(r.rate),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update margin rate" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sql = getDb();
    const { id } = await req.json();
    await sql`DELETE FROM margin_rates WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete margin rate" }, { status: 500 });
  }
}
