import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";
import { handleAuthError, requireAdminOrApprover } from "@/lib/auth/guards";

export async function GET(req: Request) {
  try {
    await requireAdminOrApprover(req);
    const sql = getDb();

    // ── KPI ──────────────────────────────────────────────────
    const [kpi] = await sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COALESCE(SUM(amount + maintenance_fee) FILTER (WHERE status = 'approved'), 0) AS total_amount
      FROM estimates
    `;

    // ── 代理店別件数 ──────────────────────────────────────────
    const byAgencyRows = await sql`
      SELECT agency_name AS name, COUNT(*) AS count
      FROM estimates
      GROUP BY agency_name
      ORDER BY count DESC
      LIMIT 10
    `;

    // ── 月次推移（直近12ヶ月）────────────────────────────────
    const monthlyRows = await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Tokyo'), 'YYYY/MM') AS month,
        COUNT(*) AS count,
        COALESCE(SUM(amount + maintenance_fee) FILTER (WHERE status = 'approved'), 0) AS amount
      FROM estimates
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Tokyo')
      ORDER BY DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Tokyo') ASC
    `;

    // ── 提供形態別 ────────────────────────────────────────────
    const byDeliveryRows = await sql`
      SELECT delivery_type, COUNT(*) AS count
      FROM estimates
      GROUP BY delivery_type
    `;

    // ── 契約形態別 ────────────────────────────────────────────
    const byContractRows = await sql`
      SELECT contract_type, COUNT(*) AS count
      FROM estimates
      GROUP BY contract_type
    `;

    // ── ラベル変換 ────────────────────────────────────────────
    const byDelivery = byDeliveryRows.map((r) => ({
      name: DELIVERY_TYPES.find((d) => d.value === r.delivery_type)?.labelJa ?? r.delivery_type,
      count: Number(r.count),
    }));

    const byContract = byContractRows.map((r) => ({
      name: CONTRACT_TYPES.find((c) => c.value === r.contract_type)?.labelJa ?? r.contract_type,
      count: Number(r.count),
    }));

    return NextResponse.json({
      total:       Number(kpi.total),
      approved:    Number(kpi.approved),
      pending:     Number(kpi.pending),
      totalAmount: Number(kpi.total_amount),
      byAgency:    byAgencyRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      monthly:     monthlyRows.map((r) => ({ month: r.month, count: Number(r.count), amount: Number(r.amount) })),
      byDelivery,
      byContract,
    });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[dashboard/stats]", e);
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}
