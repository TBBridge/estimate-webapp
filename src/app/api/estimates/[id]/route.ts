/**
 * GET   /api/estimates/[id]  — 見積詳細取得
 * PATCH /api/estimates/[id]  — 管理者・承認者向け: 顧客名・代理店名・金額・form_inputs の更新
 * PUT   /api/estimates/[id]  — ステータス更新（approved / rejected）
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchKintoneSalesPreviewForCustomer } from "@/lib/kintone-sales-preview";
import { syncApprovedNewEstimateToKintoneSales } from "@/lib/kintone-sales-sync";
import type { KintoneSalesSyncResultDto } from "@/lib/kintone-sales-types";
import type { Locale } from "@/lib/translations";
import { parseExcelFileHistory } from "@/lib/excel-file-history";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const includeKintoneSales =
      searchParams.get("includeKintoneSales") === "1" ||
      searchParams.get("includeKintoneSales") === "true";
    const locale = (searchParams.get("locale") === "en" ? "en" : "ja") as Locale;

    const rows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing,
             amount, maintenance_fee, form_inputs, excel_url, pdf_url, excel_file_history, status,
             TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
      FROM estimates
      WHERE id = ${id}
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];

    let kintoneSales: Awaited<ReturnType<typeof fetchKintoneSalesPreviewForCustomer>> | undefined;
    if (includeKintoneSales) {
      kintoneSales = await fetchKintoneSalesPreviewForCustomer(
        String(r.customer_name ?? ""),
        String(r.agency_id ?? ""),
        String(r.agency_name ?? ""),
        locale
      );
    }

    return NextResponse.json({
      id: r.id, no: r.no,
      agencyId: r.agency_id, agencyName: r.agency_name,
      customerName: r.customer_name,
      deliveryType: r.delivery_type, contractType: r.contract_type,
      cloudBilling: r.cloud_billing,
      amount: Number(r.amount), maintenanceFee: Number(r.maintenance_fee),
      formInputs: r.form_inputs,
      excelUrl: r.excel_url ?? "",
      excelFileHistory: parseExcelFileHistory((r as { excel_file_history?: unknown }).excel_file_history),
      pdfUrl: r.pdf_url ?? "",
      status: r.status,
      createdAt: r.created_at,
      approvedAt: r.approved_at ?? undefined,
      ...(kintoneSales ? { kintoneSales } : {}),
    });
  } catch (e) {
    console.error("[estimates/id GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function jsonEstimateRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    no: r.no,
    agencyId: r.agency_id,
    agencyName: r.agency_name,
    customerName: r.customer_name,
    deliveryType: r.delivery_type,
    contractType: r.contract_type,
    cloudBilling: r.cloud_billing,
    amount: Number(r.amount),
    maintenanceFee: Number(r.maintenance_fee),
    formInputs: r.form_inputs,
    excelUrl: r.excel_url ?? "",
    excelFileHistory: parseExcelFileHistory(r.excel_file_history),
    pdfUrl: r.pdf_url ?? "",
    status: r.status,
    createdAt: r.created_at,
    approvedAt: r.approved_at ?? undefined,
  };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = (await req.json()) as {
      customerName?: string;
      agencyName?: string;
      amount?: number;
      maintenanceFee?: number;
      formInputs?: Record<string, unknown>;
    };

    const curRows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing,
             amount, maintenance_fee, form_inputs, excel_url, pdf_url, status,
             TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
      FROM estimates WHERE id = ${id}
    `;
    if (curRows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const cur = curRows[0] as Record<string, unknown>;

    const customer_name =
      body.customerName !== undefined ? String(body.customerName).trim() : String(cur.customer_name ?? "");
    const agency_name =
      body.agencyName !== undefined ? String(body.agencyName).trim() : String(cur.agency_name ?? "");
    const amount =
      body.amount !== undefined
        ? Math.max(0, Math.floor(Number(body.amount)))
        : Number(cur.amount ?? 0);
    const maintenance_fee =
      body.maintenanceFee !== undefined
        ? Math.max(0, Math.floor(Number(body.maintenanceFee)))
        : Number(cur.maintenance_fee ?? 0);

    if (body.amount !== undefined && !Number.isFinite(amount)) {
      return NextResponse.json({ error: "amount が不正です" }, { status: 400 });
    }
    if (body.maintenanceFee !== undefined && !Number.isFinite(maintenance_fee)) {
      return NextResponse.json({ error: "maintenanceFee が不正です" }, { status: 400 });
    }

    let form_inputs: unknown = cur.form_inputs;
    if (body.formInputs !== undefined) {
      if (body.formInputs === null || typeof body.formInputs !== "object" || Array.isArray(body.formInputs)) {
        return NextResponse.json({ error: "formInputs はオブジェクトである必要があります" }, { status: 400 });
      }
      form_inputs = body.formInputs;
    }

    const updated = await sql`
      UPDATE estimates
      SET customer_name = ${customer_name},
          agency_name = ${agency_name},
          amount = ${amount},
          maintenance_fee = ${maintenance_fee},
          form_inputs = ${JSON.stringify(form_inputs)}::jsonb
      WHERE id = ${id}
      RETURNING id, no, agency_id, agency_name, customer_name,
                delivery_type, contract_type, cloud_billing,
                amount, maintenance_fee, form_inputs, excel_url, excel_file_history, pdf_url, status,
                TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at,
                TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
    `;
    const r = updated[0] as Record<string, unknown>;
    return NextResponse.json(jsonEstimateRow(r));
  } catch (e) {
    console.error("[estimates/id PATCH]", e);
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
                agency_id, agency_name, customer_name,
                delivery_type, contract_type, cloud_billing,
                form_inputs, excel_url, pdf_url, amount, maintenance_fee,
                TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const r = rows[0] as {
      id: string;
      no: string;
      status: string;
      agency_id: string;
      agency_name: string;
      customer_name: string;
      delivery_type: string;
      contract_type: string;
      cloud_billing: string | null;
      form_inputs: unknown;
      excel_url: string;
      pdf_url: string;
      amount: unknown;
      maintenance_fee: unknown;
      approved_at: string | null;
    };

    let kintoneSalesSync: KintoneSalesSyncResultDto | undefined;
    if (status === "approved") {
      kintoneSalesSync = await syncApprovedNewEstimateToKintoneSales({
        id: r.id,
        no: r.no,
        agency_id: r.agency_id,
        agency_name: r.agency_name,
        customer_name: r.customer_name,
        delivery_type: r.delivery_type,
        contract_type: r.contract_type,
        cloud_billing: r.cloud_billing,
        excel_url: r.excel_url ?? "",
        pdf_url: r.pdf_url ?? "",
        amount: Number(r.amount),
        maintenance_fee: Number(r.maintenance_fee),
        form_inputs: r.form_inputs,
        approved_at: r.approved_at,
      });
    }

    return NextResponse.json({
      id: r.id,
      no: r.no,
      status: r.status,
      approved_at: r.approved_at,
      ...(kintoneSalesSync ? { kintoneSalesSync } : {}),
    });
  } catch (e) {
    console.error("[estimates/id PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
