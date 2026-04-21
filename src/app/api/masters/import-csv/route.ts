import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { parseMarginRateFromCsv } from "@/lib/import-rate";

export const runtime = "nodejs";

const DELIVERY = new Set(["onprem", "subscription", "cloud"]);

type RowErr = { line: number; message: string };

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * kind=margin: agency_id または agency_email, product_id, delivery_type, rate（0.7 または 70）
 * kind=maintenance: agency_id または agency_email, product_id（省略時 ireporter）, rate
 * kind=unitPrices: product_id, product_name, delivery_type, tiers（JSON 配列）
 */
export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data で file と kind を送ってください" }, { status: 400 });
    }
    const fd = await req.formData();
    const kind = String(fd.get("kind") ?? "").trim();
    const file = fd.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file が必要です" }, { status: 400 });
    }
    if (kind !== "margin" && kind !== "maintenance" && kind !== "unitPrices") {
      return NextResponse.json({ error: "kind は margin | maintenance | unitPrices です" }, { status: 400 });
    }

    const text = await (file as File).text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV にデータ行がありません" }, { status: 400 });
    }

    const sql = getDb();
    let upserted = 0;
    const errors: RowErr[] = [];

    async function resolveAgency(row: Record<string, string>, line: number): Promise<{ id: string; name: string } | null> {
      const agencyId = pick(row, "agency_id", "agencyid", "代理店id").trim();
      const agencyEmail = pick(row, "agency_email", "agencyemail", "代理店メール", "email").trim();
      if (agencyId) {
        const r = await sql`SELECT id, name FROM agencies WHERE id = ${agencyId} LIMIT 1`;
        if (r.length === 0) {
          errors.push({ line, message: `代理店 id が見つかりません: ${agencyId}` });
          return null;
        }
        return { id: r[0].id as string, name: r[0].name as string };
      }
      if (agencyEmail) {
        const r = await sql`SELECT id, name FROM agencies WHERE email = ${agencyEmail} LIMIT 1`;
        if (r.length === 0) {
          errors.push({ line, message: `代理店メールが見つかりません: ${agencyEmail}` });
          return null;
        }
        return { id: r[0].id as string, name: r[0].name as string };
      }
      errors.push({ line, message: "agency_id または agency_email が必要です" });
      return null;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;

      if (kind === "margin") {
        const ag = await resolveAgency(row, line);
        if (!ag) continue;
        const productId = pick(row, "product_id", "productid", "製品id").trim();
        const deliveryType = pick(row, "delivery_type", "deliverytype", "提供形態").trim();
        const rateRaw = pick(row, "rate", "仕切り率", "rate_percent");
        const rate = parseMarginRateFromCsv(rateRaw);
        if (!productId || !deliveryType || rate === null) {
          errors.push({ line, message: "product_id, delivery_type, rate が不正です" });
          continue;
        }
        if (!DELIVERY.has(deliveryType)) {
          errors.push({ line, message: `delivery_type は onprem | subscription | cloud: ${deliveryType}` });
          continue;
        }
        try {
          await sql`
            INSERT INTO margin_rates (agency_id, agency_name, product_id, delivery_type, rate)
            VALUES (${ag.id}, ${ag.name}, ${productId}, ${deliveryType}, ${rate})
            ON CONFLICT (agency_id, product_id, delivery_type) DO UPDATE
              SET rate = EXCLUDED.rate, agency_name = EXCLUDED.agency_name
          `;
          upserted += 1;
        } catch (e) {
          errors.push({ line, message: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }

      if (kind === "maintenance") {
        const ag = await resolveAgency(row, line);
        if (!ag) continue;
        const productId = pick(row, "product_id", "productid", "製品id").trim() || "ireporter";
        const rateRaw = pick(row, "rate", "仕切り率");
        const rate = parseMarginRateFromCsv(rateRaw);
        if (rate === null) {
          errors.push({ line, message: "rate が不正です" });
          continue;
        }
        try {
          await sql`
            INSERT INTO maintenance_rates (agency_id, agency_name, product_id, rate)
            VALUES (${ag.id}, ${ag.name}, ${productId}, ${rate})
            ON CONFLICT (agency_id, product_id) DO UPDATE
              SET rate = EXCLUDED.rate, agency_name = EXCLUDED.agency_name
          `;
          upserted += 1;
        } catch (e) {
          errors.push({ line, message: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }

      // unitPrices
      const productId = pick(row, "product_id", "productid", "製品id").trim();
      const productName = pick(row, "product_name", "productname", "製品名").trim();
      const deliveryType = pick(row, "delivery_type", "deliverytype", "提供形態").trim();
      const tiersRaw = pick(row, "tiers", "ティア", "価格ティア");
      if (!productId || !productName || !deliveryType || !tiersRaw) {
        errors.push({ line, message: "product_id, product_name, delivery_type, tiers が必要です" });
        continue;
      }
      if (!DELIVERY.has(deliveryType)) {
        errors.push({ line, message: `delivery_type は onprem | subscription | cloud: ${deliveryType}` });
        continue;
      }
      let tiers: unknown;
      try {
        tiers = JSON.parse(tiersRaw);
      } catch {
        errors.push({ line, message: "tiers は JSON 配列である必要があります" });
        continue;
      }
      if (!Array.isArray(tiers)) {
        errors.push({ line, message: "tiers は配列である必要があります" });
        continue;
      }
      try {
        await sql`
          INSERT INTO unit_prices (product_id, product_name, delivery_type, tiers)
          VALUES (${productId}, ${productName}, ${deliveryType}, ${JSON.stringify(tiers)}::JSONB)
          ON CONFLICT (product_id, delivery_type) DO UPDATE
            SET product_name = EXCLUDED.product_name, tiers = EXCLUDED.tiers
        `;
        upserted += 1;
      } catch (e) {
        errors.push({ line, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({ kind, upserted, errors, totalRows: rows.length });
  } catch (e) {
    console.error("[masters import-csv]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
