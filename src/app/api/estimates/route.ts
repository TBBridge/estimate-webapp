import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseExcelFileHistory } from "@/lib/excel-file-history";
import { handleAuthError, requireAuth } from "@/lib/auth/guards";

function mapEstimateListRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    no: r.no,
    agencyId: r.agency_id,
    agencyName: r.agency_name,
    customerName: r.customer_name,
    deliveryType: r.delivery_type,
    contractType: r.contract_type,
    cloudBilling: r.cloud_billing ?? undefined,
    amount: Number(r.amount),
    maintenanceFee: Number(r.maintenance_fee),
    approvedAmountAtApproval:
      r.approved_amount_at_approval != null ? Number(r.approved_amount_at_approval) : undefined,
    approvedMaintenanceFeeAtApproval:
      r.approved_maintenance_fee_at_approval != null
        ? Number(r.approved_maintenance_fee_at_approval)
        : undefined,
    formInputs: r.form_inputs ?? {},
    excelUrl: r.excel_url ?? "",
    excelFileHistory: parseExcelFileHistory((r as { excel_file_history?: unknown }).excel_file_history),
    pdfUrl: r.pdf_url ?? "",
    status: r.status,
    createdAt: r.created_at,
    approvedAt: r.approved_at ?? undefined,
    hubspotDealId: String((r as { hubspot_deal_id?: string }).hubspot_deal_id ?? "") || undefined,
  };
}

export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    // agency ロールはセッションの agencyId に強制（クライアント指定値は無視）
    const agencyId =
      session.role === "agency"
        ? (session.agencyId ?? "__no_agency__")
        : (searchParams.get("agencyId") ?? "");
    const deliveryType = searchParams.get("deliveryType") ?? "";
    const contractType = searchParams.get("contractType") ?? "";
    const status = searchParams.get("status") ?? "";
    const customerName = searchParams.get("customerName") ?? "";
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    const pageRaw = searchParams.get("page");
    const pageSizeRaw = searchParams.get("pageSize");
    const paginate = pageRaw != null && pageRaw !== "" && pageSizeRaw != null && pageSizeRaw !== "";
    const page = paginate ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
    const pageSize = paginate ? Math.min(100, Math.max(1, parseInt(pageSizeRaw, 10) || 20)) : 0;
    const offset = paginate ? (page - 1) * pageSize : 0;

    if (paginate) {
      const [countRow] = await sql`
        SELECT COUNT(*)::INT AS c FROM estimates
        WHERE (${agencyId} = '' OR agency_id = ${agencyId})
          AND (${deliveryType} = '' OR delivery_type = ${deliveryType})
          AND (${contractType} = '' OR contract_type = ${contractType})
          AND (${status} = '' OR status = ${status})
          AND (${customerName} = '' OR customer_name ILIKE ${"%" + customerName + "%"})
          AND (${from} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE >= ${from || null}::DATE)
          AND (${to} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE <= ${to || null}::DATE)
      `;
      const rows = await sql`
        SELECT id, no, agency_id, agency_name, customer_name,
               delivery_type, contract_type, cloud_billing, amount, maintenance_fee,
               approved_amount_at_approval, approved_maintenance_fee_at_approval,
               form_inputs, excel_url, excel_file_history, pdf_url, status,
               COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
               TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created_at,
               TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS approved_at
        FROM estimates
        WHERE (${agencyId} = '' OR agency_id = ${agencyId})
          AND (${deliveryType} = '' OR delivery_type = ${deliveryType})
          AND (${contractType} = '' OR contract_type = ${contractType})
          AND (${status} = '' OR status = ${status})
          AND (${customerName} = '' OR customer_name ILIKE ${"%" + customerName + "%"})
          AND (${from} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE >= ${from || null}::DATE)
          AND (${to} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE <= ${to || null}::DATE)
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      return NextResponse.json({
        estimates: rows.map((r) => mapEstimateListRow(r as Record<string, unknown>)),
        total: Number(countRow.c),
        page,
        pageSize,
      });
    }

    const rows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing, amount, maintenance_fee,
             approved_amount_at_approval, approved_maintenance_fee_at_approval,
             form_inputs, excel_url, excel_file_history, pdf_url, status,
             COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
             TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS approved_at
      FROM estimates
      WHERE (${agencyId} = '' OR agency_id = ${agencyId})
        AND (${deliveryType} = '' OR delivery_type = ${deliveryType})
        AND (${contractType} = '' OR contract_type = ${contractType})
        AND (${status} = '' OR status = ${status})
        AND (${customerName} = '' OR customer_name ILIKE ${"%" + customerName + "%"})
        AND (${from} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE >= ${from || null}::DATE)
        AND (${to} = '' OR (created_at AT TIME ZONE 'Asia/Tokyo')::DATE <= ${to || null}::DATE)
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows.map((r) => mapEstimateListRow(r as Record<string, unknown>)));
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch estimates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const sql = getDb();
    const body = (await req.json()) as {
      no: string;
      agencyId: string;
      agencyName: string;
      customerName: string;
      deliveryType: string;
      contractType: string;
      amount: number;
      maintenanceFee: number;
    };
    // agency ロールは自分の代理店IDを強制（セッションに agencyId が無ければ拒否）。
    // agencyName もクライアント送信値を信用せず DB から取得する。
    let agencyId: string;
    let agencyName: string;
    if (session.role === "agency") {
      if (!session.agencyId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      agencyId = session.agencyId;
      const agRows = await sql`SELECT name FROM agencies WHERE id = ${agencyId} LIMIT 1`;
      if (agRows.length === 0) {
        return NextResponse.json({ error: "agency_not_found" }, { status: 403 });
      }
      agencyName = String(agRows[0].name ?? "");
    } else {
      agencyId = body.agencyId;
      agencyName = body.agencyName;
    }
    const { no, customerName, deliveryType, contractType, amount, maintenanceFee } = body;
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
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error(e);
    return NextResponse.json({ error: "Failed to create estimate" }, { status: 500 });
  }
}
