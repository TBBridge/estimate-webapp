import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, product_id, product_name, delivery_type, tiers
      FROM unit_prices
      ORDER BY product_id, delivery_type
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, productId: r.product_id, productName: r.product_name,
      deliveryType: r.delivery_type, tiers: r.tiers,
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch unit prices" }, { status: 500 });
  }
}
