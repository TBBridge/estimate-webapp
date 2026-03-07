import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { tiers } = await req.json();
    const rows = await sql`
      UPDATE unit_prices SET tiers = ${JSON.stringify(tiers)}::JSONB WHERE id = ${id}
      RETURNING id, product_id, product_name, delivery_type, tiers
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, productId: r.product_id, productName: r.product_name,
      deliveryType: r.delivery_type, tiers: r.tiers,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update unit price" }, { status: 500 });
  }
}
