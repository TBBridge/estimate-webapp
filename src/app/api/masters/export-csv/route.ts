import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildCsv } from "@/lib/csv";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";

export const runtime = "nodejs";

/**
 * インポート（masters/import-csv）と同じ列名（kind ごと）
 * - margin: agency_id, product_id, delivery_type, rate
 * - maintenance: agency_id, product_id, rate
 * - unitPrices: product_id, product_name, delivery_type, tiers
 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const kind = (searchParams.get("kind") ?? "").trim();
    if (kind !== "margin" && kind !== "maintenance" && kind !== "unitPrices") {
      return NextResponse.json({ error: "kind は margin | maintenance | unitPrices です" }, { status: 400 });
    }

    const sql = getDb();
    let data: string[][];
    let filename: string;

    if (kind === "margin") {
      const rows = await sql`
        SELECT agency_id, product_id, delivery_type, CAST(rate AS FLOAT) AS rate
        FROM margin_rates
        ORDER BY agency_id, product_id, delivery_type
      `;
      const header: string[] = ["agency_id", "product_id", "delivery_type", "rate"];
      data = [
        header,
        ...rows.map((r) => {
          const rate = Number(r.rate);
          const rateStr = Number.isFinite(rate) ? String(rate) : "";
          return [String(r.agency_id), String(r.product_id), String(r.delivery_type), rateStr];
        }),
      ];
      filename = "margin_rates.csv";
    } else if (kind === "maintenance") {
      const rows = await sql`
        SELECT agency_id, product_id, CAST(rate AS FLOAT) AS rate
        FROM maintenance_rates
        ORDER BY agency_id, product_id
      `;
      const header: string[] = ["agency_id", "product_id", "rate"];
      data = [
        header,
        ...rows.map((r) => {
          const rate = Number(r.rate);
          const rateStr = Number.isFinite(rate) ? String(rate) : "";
          return [String(r.agency_id), String(r.product_id), rateStr];
        }),
      ];
      filename = "maintenance_rates.csv";
    } else {
      const rows = await sql`
        SELECT product_id, product_name, delivery_type, tiers
        FROM unit_prices
        ORDER BY product_id, delivery_type
      `;
      const header: string[] = ["product_id", "product_name", "delivery_type", "tiers"];
      data = [
        header,
        ...rows.map((r) => {
          const tiersJson =
            r.tiers != null
              ? typeof r.tiers === "string"
                ? r.tiers
                : JSON.stringify(r.tiers)
              : "[]";
          return [String(r.product_id), String(r.product_name), String(r.delivery_type), tiersJson];
        }),
      ];
      filename = "unit_prices.csv";
    }

    const body = "\uFEFF" + buildCsv(data);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[masters export-csv]", e);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
