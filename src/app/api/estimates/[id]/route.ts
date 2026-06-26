/**
 * GET    /api/estimates/[id]  — 見積詳細取得
 * PATCH  /api/estimates/[id]  — 管理者・承認者向け: 顧客名・代理店名・金額・form_inputs の更新
 * PUT    /api/estimates/[id]  — ステータス更新（approved / rejected）
 * DELETE /api/estimates/[id]  — 見積削除
 */
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { fetchHubSpotDealsPreviewForCustomer, type HubSpotDealsPreviewPayload } from "@/lib/hubspot-deals-preview";
import { getHubSpotConfig } from "@/lib/hubspot-env";
import {
  searchDealsByCompanyName,
  createDealByCompanyName,
} from "@/lib/hubspot-deals";
import { addEstimateNoteToDeal } from "@/lib/hubspot-notes";
import { buildEstimateNoteBody } from "@/lib/hubspot-estimate-note-body";
import { randomBytes } from "crypto";
import { updateExcelHubSpotNo } from "@/lib/excel-writer";
import { generateEstimatePdfAndSave } from "@/lib/estimate-pdf-generate";
import { regenerateEstimateExcel } from "@/lib/estimate-excel-build";
import { sanitizeEstimateNoForBlobPath } from "@/lib/excel-file-history";
import type { HubSpotSyncResultDto } from "@/lib/hubspot-approve-feedback";
import { HUBSPOT_DEAL_SELECT_CREATE_NEW } from "@/lib/hubspot-approve-feedback";
import type { Locale } from "@/lib/translations";
import { getEstimateRequesterContact } from "@/lib/estimate-schema";
import { parseExcelFileHistory } from "@/lib/excel-file-history";
import { sendAgencyDecisionGmailNotification } from "@/lib/notify";
import {
  handleAuthError,
  requireAdmin,
  requireAdminOrApprover,
  requireEstimateAccess,
} from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

// PATCH（編集）・PUT（承認）では Excel/PDF 再生成を伴うため実行時間を延長する
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEstimateAccess(req, id);
    const sql = getDb();
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
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[estimates/id GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
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

function formatTokyoDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdminOrApprover(req);
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

    // 編集内容（会社名・申請内容）を成果物へ反映するため Excel を再生成する。
    // PDF 変換は重く（Gotenberg のコールドスタート等で）関数のタイムアウトを招くため、
    // ここではインライン実行せず pdf_url をクリアするだけにとどめ、クライアントが
    // 別リクエスト（POST /api/estimates/[id]/generate-pdf）で作り直す。
    // 再生成に失敗しても編集自体は成功扱いとし、結果フラグだけ返す（編集は確定済み）。
    let excelRegenerated = false;
    let regenerateError: string | undefined;
    try {
      const regen = await regenerateEstimateExcel(sql, id);
      if (regen) {
        excelRegenerated = true;
        r.excel_url = regen.excelUrl;
        r.excel_file_history = regen.excelFileHistory;
        r.pdf_url = "";
      }
    } catch (excelErr) {
      regenerateError = excelErr instanceof Error ? excelErr.message : String(excelErr);
      console.error("[estimates/id PATCH] Excel 再生成失敗（編集は確定済み）:", regenerateError);
    }

    return NextResponse.json({
      ...jsonEstimateRow(r),
      excelRegenerated,
      ...(regenerateError ? { regenerateError } : {}),
    });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[estimates/id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    await requireAdminOrApprover(req);
    const sql = getDb();
    const { id } = await params;
    const body = (await req.json()) as {
      status: "approved" | "rejected";
      /**
       * 会社名で取引がマッチした場合に承認者/管理者が選択した取引 ID。
       * 特殊値 "__new__" は「新規取引を作成」を意味する。
       */
      selectedHubSpotDealId?: string;
    };
    const { status } = body;
    const selectedHubSpotDealId =
      typeof body.selectedHubSpotDealId === "string" && body.selectedHubSpotDealId.trim() !== ""
        ? body.selectedHubSpotDealId.trim()
        : undefined;

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const curRows = await sql`
      SELECT id, no, status, customer_name, contract_type,
             agency_id, agency_name, delivery_type, cloud_billing,
             pdf_url, excel_url, amount, maintenance_fee, form_inputs
      FROM estimates
      WHERE id = ${id}
    `;
    if (curRows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const cur = curRows[0] as {
      id: string;
      no: string;
      status: string;
      customer_name: string;
      contract_type: string;
      agency_id: string;
      agency_name: string;
      delivery_type: string;
      cloud_billing: string | null;
      pdf_url: string;
      excel_url: string;
      amount: unknown;
      maintenance_fee: unknown;
      form_inputs: unknown;
    };

    if (!String(cur.pdf_url ?? "").trim()) {
      return NextResponse.json(
        {
          error: "pdf_required",
          message: "承認・差戻の前に「PDF 生成」で PDF を作成してください。",
        },
        { status: 400 }
      );
    }

    let finalDealId = "";
    let hubspotSync: HubSpotSyncResultDto | undefined;

    if (status === "approved") {
      const hubCfg = getHubSpotConfig();

      if (hubCfg) {
        try {
          // 見積金額 = 本体金額 + 保守料（DB は INTEGER, yen）
          const amountNum = Number(cur.amount ?? 0);
          const maintNum = Number(cur.maintenance_fee ?? 0);
          const estimatedAmount =
            Number.isFinite(amountNum) && Number.isFinite(maintNum)
              ? amountNum + maintNum
              : null;

          const existing = await searchDealsByCompanyName(hubCfg, cur.customer_name);

          // 既存取引が 1 件以上あり選択未指定 → どの取引に紐付けるか
          // （または新規取引を作成するか）を承認者/管理者に選ばせる。
          if (existing.length >= 1 && selectedHubSpotDealId === undefined) {
            return NextResponse.json(
              {
                error: "hubspot_deal_selection_required",
                hubspotDealSelection: {
                  customerName: cur.customer_name,
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

          // ユーザーが選択した取引 ID を解決
          let chosenExistingId: string | undefined;
          let wantsCreateNew = false;
          if (selectedHubSpotDealId !== undefined) {
            if (selectedHubSpotDealId === HUBSPOT_DEAL_SELECT_CREATE_NEW) {
              wantsCreateNew = true;
            } else {
              // 改竄防止: 選択 ID は検索結果に含まれていなければならない
              const found = existing.find((d) => d.id === selectedHubSpotDealId);
              if (!found) {
                return NextResponse.json(
                  {
                    error: "hubspot_selected_deal_invalid",
                    message:
                      "指定された取引 ID は会社名にマッチする取引一覧に存在しません。画面を更新して再度選択してください。",
                  },
                  { status: 400 }
                );
              }
              chosenExistingId = found.id;
            }
          }
          // existing.length === 0（マッチ無し）→ wantsCreateNew/chosenExistingId 共に未設定 → 後段で新規作成

          if (chosenExistingId) {
            finalDealId = chosenExistingId;
            // 1 取引に複数見積を集約するため、既存取引の金額プロパティは上書きしない。
            // 各見積の内容は後段でメモ（Note）として deal に追加する。
            hubspotSync = {
              ok: true,
              action: "existing",
              dealId: finalDealId,
              excelUpdated: false,
            };
          } else {
            // 新規作成: existing.length === 0 もしくは wantsCreateNew === true
            const created = await createDealByCompanyName(hubCfg, {
              agencyId: cur.agency_id,
              agencyName: cur.agency_name,
              customerName: cur.customer_name,
              contractType: cur.contract_type,
              estimateNo: cur.no,
              estimatedAmount,
            });
            if (!created.ok) {
              return NextResponse.json(
                { error: "hubspot_sync_failed", message: created.error },
                { status: 502 }
              );
            }
            finalDealId = created.dealId;
            hubspotSync = {
              ok: true,
              action: "created",
              dealId: finalDealId,
              excelUpdated: false,
            };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[estimates/id PUT] HubSpot 同期失敗（DB は未更新）:", e);
          return NextResponse.json(
            { error: "hubspot_sync_failed", message: msg.slice(0, 500) },
            { status: 502 }
          );
        }
      } else {
        hubspotSync = { ok: true, skipped: true, reason: "hubspot_not_configured" };
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

    if (status === "approved" && finalDealId) {
      try {
        await sql`UPDATE estimates SET hubspot_deal_id = ${finalDealId} WHERE id = ${id}`;
      } catch (dbErr) {
        console.error("[estimates/id PUT] hubspot_deal_id 保存失敗:", dbErr);
      }

      const existingExcelUrl = String(r.excel_url ?? "").trim();
      if (existingExcelUrl && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const tplRes = await fetch(existingExcelUrl, { cache: "no-store" });
          if (!tplRes.ok) {
            throw new Error(`Excel fetch failed: HTTP ${tplRes.status}`);
          }
          const ab = await tplRes.arrayBuffer();
          const updatedBuf = await updateExcelHubSpotNo(
            Buffer.from(new Uint8Array(ab)),
            finalDealId
          );
          console.log("[estimates/id PUT] Excel C13 書き込み完了, dealId=", finalDealId);
          const safeNo = sanitizeEstimateNoForBlobPath(r.no);
          const unique = `${Date.now()}_${randomBytes(4).toString("hex")}`;
          const excelBlobPath = `estimates/${r.id}/${safeNo}_${unique}.xlsx`;
          const { url: newUrl } = await put(
            excelBlobPath,
            updatedBuf,
            { access: "public", addRandomSuffix: false }
          );
          await sql`UPDATE estimates SET excel_url = ${newUrl} WHERE id = ${id}`;
          console.log("[estimates/id PUT] Excel Blob 更新完了:", newUrl);
          if (hubspotSync && hubspotSync.ok && "action" in hubspotSync) {
            hubspotSync = { ...hubspotSync, excelUpdated: true };
          }
        } catch (excelErr) {
          const exMsg = excelErr instanceof Error ? excelErr.message : String(excelErr);
          console.error("[estimates/id PUT] Excel C13 更新失敗（承認は完了）:", exMsg);
        }
      }

      if (hubspotSync && "excelUpdated" in hubspotSync && hubspotSync.excelUpdated) {
        try {
          const { pdfUrl: newPdfUrl } = await generateEstimatePdfAndSave(sql, id);
          hubspotSync = { ...hubspotSync, pdfRegenerated: true };
          console.log("[estimates/id PUT] PDF 再生成完了:", newPdfUrl);
        } catch (pdfErr) {
          const pdfMsg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
          console.error("[estimates/id PUT] PDF 再生成失敗（承認・Excel 更新は完了）:", pdfMsg);
        }
      }

      // ── HubSpot 取引にメモ（Note）を追加し、最新 PDF を添付 ──────────
      // 1 取引に複数見積を集約するため、見積内容を 1 メモとして deal に登録する。
      // メモは「既存取引にマッチして紐付けた場合（action=existing）」のみ追加する。
      // 0 件マッチや「新規作成」で取引を作った場合（action=created）はメモを追加しない。
      // 失敗しても承認自体は完了扱いとし、結果は hubspotSync に載せて返す。
      const noteCfg = getHubSpotConfig();
      const shouldAddNote =
        hubspotSync && hubspotSync.ok && "action" in hubspotSync && hubspotSync.action === "existing";
      if (noteCfg && shouldAddNote) {
        try {
          // PDF は Excel C13 更新後に再生成されている可能性があるため最新値を取り直す
          const pdfRows = await sql`SELECT pdf_url FROM estimates WHERE id = ${id}`;
          const pdfUrl = String((pdfRows[0] as { pdf_url?: unknown })?.pdf_url ?? "").trim();
          let pdf: { buffer: Buffer; fileName: string } | null = null;
          if (pdfUrl) {
            const pdfRes = await fetch(pdfUrl, { cache: "no-store" });
            if (pdfRes.ok) {
              const ab = await pdfRes.arrayBuffer();
              pdf = {
                buffer: Buffer.from(new Uint8Array(ab)),
                fileName: `${sanitizeEstimateNoForBlobPath(r.no)}.pdf`,
              };
            } else {
              console.warn(`[estimates/id PUT] メモ添付用 PDF 取得失敗: HTTP ${pdfRes.status}`);
            }
          }

          const noteBody = buildEstimateNoteBody({
            customerName: r.customer_name,
            agencyName: r.agency_name,
            deliveryType: r.delivery_type,
            contractType: r.contract_type,
            amount: Number(r.amount ?? 0),
            maintenanceFee: Number(r.maintenance_fee ?? 0),
            formInputs: (r.form_inputs as Record<string, unknown>) ?? {},
          });

          const noteRes = await addEstimateNoteToDeal(noteCfg, {
            dealId: finalDealId,
            body: noteBody,
            pdf,
          });

          if (hubspotSync && hubspotSync.ok && "action" in hubspotSync) {
            if (noteRes.ok) {
              hubspotSync = {
                ...hubspotSync,
                noteCreated: true,
                noteAttachmentUploaded: noteRes.attachmentUploaded,
              };
              console.log("[estimates/id PUT] HubSpot メモ作成完了, noteId=", noteRes.noteId);
            } else {
              hubspotSync = {
                ...hubspotSync,
                noteCreated: false,
                noteError: noteRes.error.slice(0, 300),
              };
              console.warn("[estimates/id PUT] HubSpot メモ作成失敗（承認は完了）:", noteRes.error);
            }
          }
        } catch (noteErr) {
          const noteMsg = noteErr instanceof Error ? noteErr.message : String(noteErr);
          console.error("[estimates/id PUT] HubSpot メモ作成で例外（承認は完了）:", noteMsg);
          if (hubspotSync && hubspotSync.ok && "action" in hubspotSync) {
            hubspotSync = { ...hubspotSync, noteCreated: false, noteError: noteMsg.slice(0, 300) };
          }
        }
      }
    }

    let agencyNotification: { ok: boolean; error?: string } | undefined;
    try {
      const requesterContact = getEstimateRequesterContact(r.form_inputs);
      let recipientEmail = requesterContact?.email ?? "";
      const recipientName = requesterContact?.name ?? "";

      if (!recipientEmail) {
        const agencyRows = await sql`
          SELECT email FROM agencies WHERE id = ${r.agency_id} LIMIT 1
        `;
        recipientEmail = String(
          (agencyRows[0] as { email?: unknown } | undefined)?.email ?? ""
        ).trim();
      }

      if (recipientEmail) {
        agencyNotification = await sendAgencyDecisionGmailNotification({
          recipientEmail,
          ...(recipientName ? { recipientName } : {}),
          status,
          estimateNo: r.no,
          customerName: r.customer_name,
          agencyName: r.agency_name,
          decidedAt: formatTokyoDateTime(new Date()),
        });
      }
    } catch (notifyErr) {
      const message = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      console.error("[estimates/id PUT] agency decision notification failed", notifyErr);
      agencyNotification = { ok: false, error: message };
    }

    return NextResponse.json({
      id: r.id,
      no: r.no,
      status: r.status,
      approved_at: r.approved_at,
      hubspotDealId: finalDealId || undefined,
      ...(hubspotSync ? { hubspotSync } : {}),
      ...(agencyNotification ? { agencyNotification } : {}),
    });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[estimates/id PUT]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const { id } = await params;

    const rows = await sql`
      SELECT id, excel_url, pdf_url, excel_file_history
      FROM estimates WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const est = rows[0] as {
      id: string;
      excel_url: string;
      pdf_url: string;
      excel_file_history: unknown;
    };

    const blobUrls: string[] = [];
    if (est.excel_url) blobUrls.push(est.excel_url);
    if (est.pdf_url) blobUrls.push(est.pdf_url);
    const history = parseExcelFileHistory(est.excel_file_history);
    for (const h of history) {
      if (h.url) blobUrls.push(h.url);
    }

    await sql`DELETE FROM estimates WHERE id = ${id}`;

    if (blobUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(blobUrls);
      } catch (blobErr) {
        console.error("[estimates/id DELETE] Blob 削除失敗（DB は削除済み）:", blobErr);
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[estimates/id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
