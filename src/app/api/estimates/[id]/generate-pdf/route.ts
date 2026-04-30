/**
 * POST /api/estimates/[id]/generate-pdf
 *
 * 既存の見積レコードに対して PDF を生成し Blob に保存する。
 *
 * 処理流れ:
 *   - Blob から自動入力済み Excel を取得（元ファイルは変更しない）
 *   - その Excel をコピーして PDF 用の一時ワークブックとする
 *   - 一時ワークブックで編集ロックを解除し、印刷対象外シートを veryHidden に設定
 *   - 表紙・ライセンス・保守料の3シートを含む Excel を CloudConvert API で PDF に変換
 *   - 生成した PDF を Blob に保存し、pdf_url を DB に記録（ダウンロード対象）
 *
 * 呼び出しタイミング:
 *   - 管理者・承認者が詳細モーダルを開いたとき（pdf_url が空の場合）
 *   - 代理店が自分の見積一覧で PDF ボタンを押したとき
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateEstimatePdfAndSave } from "@/lib/estimate-pdf-generate";
import { handleAuthError, requireEstimateAccess } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEstimateAccess(req, id);
    const sql = getDb();

    const body = await req.json().catch(() => ({})) as { force?: unknown };
    const force = body.force === true;

    const rows = await sql`
      SELECT id, no, agency_name, customer_name,
             delivery_type, contract_type, cloud_billing,
             form_inputs, excel_url, pdf_url,
             TO_CHAR(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created_at
      FROM estimates WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const est = rows[0];

    // 既に PDF が存在し再生成指定がなければ既存 URL を返す
    if (est.pdf_url && !force) {
      return NextResponse.json({ pdfUrl: est.pdf_url });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN が設定されていません" },
        { status: 503 }
      );
    }

    if (!est.excel_url) {
      return NextResponse.json(
        { error: "Excel ファイルが存在しません。先に見積を申請してください。" },
        { status: 400 }
      );
    }

    const { pdfUrl } = await generateEstimatePdfAndSave(sql, id);
    return NextResponse.json({ pdfUrl });

  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-pdf] Error:", msg);
    return NextResponse.json(
      { error: "PDF 生成に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
