/**
 * GET   /api/estimates/[id]  — 見積詳細取得
 * PATCH /api/estimates/[id]  — 管理者・承認者向け: 顧客名・代理店名・金額・form_inputs の更新
 * PUT   /api/estimates/[id]  — ステータス更新（approved / rejected）
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { fetchHubSpotDealsPreviewForCustomer, type HubSpotDealsPreviewPayload } from "@/lib/hubspot-deals-preview";
import { getHubSpotConfig } from "@/lib/hubspot-env";
import {
  searchDealsByCompanyName,
  createDealByCompanyName,
} from "@/lib/hubspot-deals";
import { updateExcelHubSpotNo } from "@/lib/excel-writer";
import type { HubSpotSyncResultDto } from "@/lib/hubspot-approve-feedback";
import type { Locale } from "@/lib/translations";
import { parseExcelFileHistory } from "@/lib/excel-file-history";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const includeHubSpotDeals =
      searchParams.get("includeHubSpotDeals") === "1" ||
      searchParams.get("includeHubSpotDeals") === "true";
    const locale = (searchParams.get("locale") === "en" ? "en" : "ja") as Locale;

    const rows = await sql`
      SELECT id, no, agency_id, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing,
             amount, maintenance_fee,
             approved_amount_at_approval, approved_maintenance_fee_at_approval,
             form_inputs, excel_url, pdf_url, excel_file_history, status,
             COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
             TO_CHAR(created_at  AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS created_at,
             TO_CHAR(approved_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS approved_at
      FROM estimates
      WHERE id = ${id}
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = rows[0];

    let hubspotDeals: HubSpotDealsPreviewPayload | undefined;
    if (includeHubSpotDeals) {
      hubspotDeals = await fetchHubSpotDealsPreviewForCustomer(
        String(r.customer_name ?? ""),
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
      approvedAmountAtApproval:
        r.approved_amount_at_approval != null ? Number(r.approved_amount_at_approval) : undefined,
      approvedMaintenanceFeeAtApproval:
        r.approved_maintenance_fee_at_approval != null
          ? Number(r.approved_maintenance_fee_at_approval)
          : undefined,
      formInputs: r.form_inputs,
      excelUrl: r.excel_url ?? "",
      excelFileHistory: parseExcelFileHistory((r as { excel_file_history?: unknown }).excel_file_history),
      pdfUrl: r.pdf_url ?? "",
      status: r.status,
      createdAt: r.created_at,
      approvedAt: r.approved_at ?? undefined,
      hubspotDealId: String((r as { hubspot_deal_id?: string }).hubspot_deal_id ?? "") || undefined,
      ...(hubspotDeals ? { hubspotDeals } : {}),
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
    approvedAmountAtApproval:
      r.approved_amount_at_approval != null ? Number(r.approved_amount_at_approval) : undefined,
    approvedMaintenanceFeeAtApproval:
      r.approved_maintenance_fee_at_approval != null
        ? Number(r.approved_maintenance_fee_at_approval)
        : undefined,
    formInputs: r.form_inputs,
    excelUrl: r.excel_url ?? "",
    excelFileHistory: parseExcelFileHistory(r.excel_file_history),
    pdfUrl: r.pdf_url ?? "",
    status: r.status,
    createdAt: r.created_at,
    approvedAt: r.approved_at ?? undefined,
    hubspotDealId: String((r as { hubspot_deal_id?: unknown }).hubspot_deal_id ?? "") || undefined,
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
             amount, maintenance_fee,
             approved_amount_at_approval, approved_maintenance_fee_at_approval,
             form_inputs, excel_url, pdf_url, status,
             COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
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
                amount, maintenance_fee,
                approved_amount_at_approval, approved_maintenance_fee_at_approval,
                form_inputs, excel_url, excel_file_history, pdf_url, status,
                COALESCE(hubspot_deal_id, '') AS hubspot_deal_id,
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
    const body = (await req.json()) as {
      status: "approved" | "rejected";
      /** クライアントが既存重複を確認済みかどうか（contract_type=new で重複ありの場合に必要） */
      confirmHubSpotDuplicate?: boolean;
    };
    const { status } = body;
    const confirmHubSpotDuplicate = body.confirmHubSpotDuplicate === true;

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // ── 承認時のみ: HubSpot 重複事前チェック（DB 更新前に実施） ──
    // 「同じ会社名」の取引が HubSpot に既にある & contract_type=new & 未確認の場合は 409 で返す
    if (status === "approved") {
      const preRows = await sql`
        SELECT customer_name, contract_type
        FROM estimates WHERE id = ${id}
      `;
      if (preRows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const pre = preRows[0] as { customer_name: string; contract_type: string };
      const hubCfg = getHubSpotConfig();
      if (hubCfg && pre.contract_type === "new" && !confirmHubSpotDuplicate) {
        try {
          const existing = await searchDealsByCompanyName(hubCfg, pre.customer_name);
          if (existing.length > 0) {
            return NextResponse.json(
              {
                error: "duplicate_hubspot_deal",
                hubspotDuplicate: {
                  contractType: pre.contract_type,
                  customerName: pre.customer_name,
                  deals: existing.map((d) => ({
                    id: d.id,
                    dealName: d.dealName,
                    customerName: d.customerName,
                  })),
                },
              },
              { status: 409 }
            );
          }
        } catch (hubErr) {
          console.error("[estimates/id PUT] HubSpot 重複チェック失敗（承認は継続）:", hubErr);
        }
      }
    }

    const approvedAt = status === "approved" ? new Date() : null;

    const rows = await sql`
      UPDATE estimates
      SET status = ${status},
          approved_at = ${approvedAt},
          approved_amount_at_approval = CASE
            WHEN ${status} = 'approved' THEN amount
            ELSE NULL
          END,
          approved_maintenance_fee_at_approval = CASE
            WHEN ${status} = 'approved' THEN maintenance_fee
            ELSE NULL
          END
      WHERE id = ${id}
      RETURNING id, no, status,
                agency_id, agency_name, customer_name,
                delivery_type, contract_type, cloud_billing,
                form_inputs, excel_url, pdf_url, amount, maintenance_fee,
                approved_amount_at_approval, approved_maintenance_fee_at_approval,
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

    // ── HubSpot 同期（承認時のみ）──
    let hubspotSync: HubSpotSyncResultDto | undefined;
    let finalDealId = "";
    if (status === "approved") {
      const hubCfg = getHubSpotConfig();
      if (!hubCfg) {
        hubspotSync = { ok: true, skipped: true, reason: "hubspot_not_configured" };
      } else {
        try {
          const existing = await searchDealsByCompanyName(hubCfg, r.customer_name);
          let action: "created" | "existing";
          if (existing.length === 0) {
            const created = await createDealByCompanyName(hubCfg, {
              agencyId: r.agency_id,
              agencyName: r.agency_name,
              customerName: r.customer_name,
              estimateNo: r.no,
            });
            if (!created.ok) {
              hubspotSync = { ok: false, error: created.error };
            } else {
              finalDealId = created.dealId;
              action = "created";
              hubspotSync = { ok: true, action, dealId: finalDealId, excelUpdated: false };
            }
          } else {
            // contract_type === "new" のときは事前に 409 を返してここに到達しない（confirm 済みの場合のみここに来る）
            finalDealId = existing[0].id;
            action = "existing";
            hubspotSync = { ok: true, action, dealId: finalDealId, excelUpdated: false };
          }
        } catch (hubErr) {
          const msg = hubErr instanceof Error ? hubErr.message : String(hubErr);
          console.error("[estimates/id PUT] HubSpot 同期失敗:", msg);
          hubspotSync = { ok: false, error: msg.slice(0, 400) };
        }
      }

      // dealId を取得できた場合のみ DB と Excel を更新
      if (finalDealId) {
        try {
          await sql`UPDATE estimates SET hubspot_deal_id = ${finalDealId} WHERE id = ${id}`;
        } catch (dbErr) {
          console.error("[estimates/id PUT] hubspot_deal_id 保存失敗:", dbErr);
        }

        // Excel テンプレート C11 セルに HubSpot 取引 ID を書き込んで Blob を上書き
        const existingExcelUrl = String(r.excel_url ?? "").trim();
        if (existingExcelUrl && process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const tplRes = await fetch(existingExcelUrl);
            if (!tplRes.ok) {
              throw new Error(`Excel fetch failed: HTTP ${tplRes.status}`);
            }
            const ab = await tplRes.arrayBuffer();
            const updatedBuf = await updateExcelHubSpotNo(
              Buffer.from(new Uint8Array(ab)),
              finalDealId
            );
            const { url: newUrl } = await put(
              `estimates/${r.id}/${r.no}.xlsx`,
              updatedBuf,
              { access: "public", addRandomSuffix: false }
            );
            await sql`UPDATE estimates SET excel_url = ${newUrl} WHERE id = ${id}`;
            if (hubspotSync && hubspotSync.ok && "action" in hubspotSync) {
              hubspotSync = { ...hubspotSync, excelUpdated: true };
            }
          } catch (excelErr) {
            const msg = excelErr instanceof Error ? excelErr.message : String(excelErr);
            console.error("[estimates/id PUT] Excel C11 更新失敗（承認は完了）:", msg);
          }
        }
      }
    }

    return NextResponse.json({
      id: r.id,
      no: r.no,
      status: r.status,
      approved_at: r.approved_at,
      hubspotDealId: finalDealId || undefined,
      ...(hubspotSync ? { hubspotSync } : {}),
    });
  } catch (e) {
    console.error("[estimates/id PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
