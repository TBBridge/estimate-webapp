import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
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
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch unit prices" }, { status: 500 });
  }
}
