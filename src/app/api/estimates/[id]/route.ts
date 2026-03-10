/**
 * GET  /api/estimates/[id]  — 見積詳細取得
 * PUT  /api/estimates/[id]  — ステータス更新（approved / rejected）
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const sql = getDb();
    const { id } = await params;
    const rows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing,
             amount, maintenance_fee, form_inputs, excel_url, status,
             TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
      FROM estimates
      WHERE id = ${id}
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      id: r.id, no: r.no,
      agencyId: r.agency_id, agencyName: r.agency_name,
      customerName: r.customer_name,
      deliveryType: r.delivery_type, contractType: r.contract_type,
      cloudBilling: r.cloud_billing,
      amount: Number(r.amount), maintenanceFee: Number(r.maintenance_fee),
      formInputs: r.form_inputs,
      excelUrl: r.excel_url ?? "",
      status: r.status,
      createdAt: r.created_at,
      approvedAt: r.approved_at ?? undefined,
    });
  } catch (e) {
    console.error("[estimates/id GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { status } = await req.json() as { status: "approved" | "rejected" };

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const approvedAt = status === "approved" ? new Date() : null;

    const rows = await sql`
      UPDATE estimates
      SET status = ${status},
          approved_at = ${approvedAt}
      WHERE id = ${id}
      RETURNING id, no, status,
                TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error("[estimates/id PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
