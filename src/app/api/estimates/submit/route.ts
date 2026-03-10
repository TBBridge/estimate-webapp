/**
 * POST /api/estimates/submit
 *
 * 代理店が見積フォームを申請する際に呼び出すエンドポイント。
 * 1. 見積番号を生成
 * 2. DB に estimates レコードを INSERT
 * 3. 承認通知を送信（Slack / Teams / Gmail）
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendApprovalNotification } from "@/lib/notify";
import { DELIVERY_TYPES, CONTRACT_TYPES } from "@/lib/constants";

// Node.js ランタイムを明示（nodemailer 利用のため）
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const body = await req.json();

    const {
      agencyId,
      agencyName,
      customerName,
      deliveryType,
      contractType,
      cloudBilling,
      formInputs,   // フォーム入力値 JSON
    } = body as {
      agencyId: string;
      agencyName: string;
      customerName: string;
      deliveryType: string;
      contractType: string;
      cloudBilling?: string;
      formInputs: Record<string, unknown>;
    };

    // ── 見積番号生成 ─────────────────────────────────────
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 当月の最大シーケンス番号を取得
    const seqRows = await sql`
      SELECT COUNT(*) AS cnt
      FROM estimates
      WHERE no LIKE ${"EST-" + ym + "-%"}
    `;
    const seq = Number(seqRows[0].cnt) + 1;
    const estimateNo = `EST-${ym}-${String(seq).padStart(3, "0")}`;

    // ── DB INSERT ────────────────────────────────────────
    const rows = await sql`
      INSERT INTO estimates
        (no, agency_id, agency_name, customer_name,
         delivery_type, contract_type, cloud_billing, form_inputs)
      VALUES
        (${estimateNo}, ${agencyId}, ${agencyName}, ${customerName},
         ${deliveryType}, ${contractType}, ${cloudBilling ?? null},
         ${JSON.stringify(formInputs)}::JSONB)
      RETURNING id, no, status,
                TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
    `;
    const record = rows[0];

    // ── 承認通知 ─────────────────────────────────────────
    const deliveryLabel = DELIVERY_TYPES.find((d) => d.value === deliveryType)?.labelJa ?? deliveryType;
    const contractLabel = CONTRACT_TYPES.find((c) => c.value === contractType)?.labelJa ?? contractType;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://estimate-webapp.vercel.app";

    await sendApprovalNotification({
      estimateNo,
      customerName,
      deliveryType: deliveryLabel,
      contractType: contractLabel,
      requestedAt: record.created_at,
      agencyName,
      approvalUrl: `${baseUrl}/approver?no=${estimateNo}`,
    });

    return NextResponse.json({
      id: record.id,
      no: record.no,
      status: record.status,
      createdAt: record.created_at,
    }, { status: 201 });

  } catch (e) {
    console.error("[submit] Error:", e);
    return NextResponse.json({ error: "申請に失敗しました。" }, { status: 500 });
  }
}
