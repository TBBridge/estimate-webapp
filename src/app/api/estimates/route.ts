import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const agencyId     = searchParams.get("agencyId")     ?? "";
    const deliveryType = searchParams.get("deliveryType") ?? "";
    const contractType = searchParams.get("contractType") ?? "";
    const status       = searchParams.get("status")       ?? "";
    const customerName = searchParams.get("customerName") ?? "";
    const from         = searchParams.get("from")         ?? "";
    const to           = searchParams.get("to")           ?? "";

    const rows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, amount, maintenance_fee, excel_url, pdf_url, status,
             TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS approved_at
      FROM estimates
      WHERE (${agencyId}     = '' OR agency_id     = ${agencyId})
        AND (${deliveryType} = '' OR delivery_type = ${deliveryType})
        AND (${contractType} = '' OR contract_type = ${contractType})
        AND (${status}       = '' OR status        = ${status})
        AND (${customerName} = '' OR customer_name ILIKE ${'%' + customerName + '%'})
        AND (${from} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE >= ${from || null}::DATE)
        AND (${to}   = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE <= ${to   || null}::DATE)
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id, no: r.no, agencyId: r.agency_id, agencyName: r.agency_name,
      customerName: r.customer_name, deliveryType: r.delivery_type, contractType: r.contract_type,
      amount: Number(r.amount), maintenanceFee: Number(r.maintenance_fee),
      excelUrl: r.excel_url ?? "",
      pdfUrl: r.pdf_url ?? "",
      status: r.status, createdAt: r.created_at, approvedAt: r.approved_at ?? undefined,
    })));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch estimates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { no, agencyId, agencyName, customerName, deliveryType, contractType, amount, maintenanceFee } = await req.json();
    const rows = await sql`
      INSERT INTO estimates (no, agency_id, agency_name, customer_name, delivery_type, contract_type, amount, maintenance_fee)
      VALUES (${no}, ${agencyId}, ${agencyName}, ${customerName}, ${deliveryType}, ${contractType}, ${amount}, ${maintenanceFee})
      RETURNING id, no, agency_id, agency_name, customer_name,
                delivery_type, contract_type, amount, maintenance_fee, status,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id, no: r.no, agencyId: r.agency_id, agencyName: r.agency_name,
      customerName: r.customer_name, deliveryType: r.delivery_type, contractType: r.contract_type,
      amount: Number(r.amount), maintenanceFee: Number(r.maintenance_fee),
      status: r.status, createdAt: r.created_at,
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create estimate" }, { status: 500 });
  }
}
