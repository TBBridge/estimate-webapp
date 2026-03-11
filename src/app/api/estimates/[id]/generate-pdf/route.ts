/**
 * POST /api/estimates/[id]/generate-pdf
 *
 * 既存の見積レコードに対して PDF を生成し Blob に保存する。
 * 申請時のタイムアウトを避けるため、PDF 生成は申請とは別に呼び出す。
 *
 * 呼び出しタイミング:
 *   - 管理者・承認者が詳細モーダルを開いたとき（pdf_url が空の場合）
 *   - 代理店が自分の見積一覧で PDF ボタンを押したとき
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sql = getDb();

    // 見積レコードを取得
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

    // 既に PDF が存在する場合はそのまま返す
    if (est.pdf_url) {
      return NextResponse.json({ pdfUrl: est.pdf_url });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN が設定されていません" },
        { status: 503 }
      );
    }

    // Excel が存在しない場合はエラー
    if (!est.excel_url) {
      return NextResponse.json(
        { error: "Excel ファイルが存在しません。先に見積を申請してください。" },
        { status: 400 }
      );
    }

    // Excel を Blob から取得
    const excelRes = await fetch(est.excel_url as string);
    if (!excelRes.ok) {
      return NextResponse.json(
        { error: `Excel ファイルの取得に失敗しました: ${excelRes.status}` },
        { status: 500 }
      );
    }
    const excelBuffer = Buffer.from(await excelRes.arrayBuffer());

    // PDF 生成（Wasm: LibreOffice）
    const { convertExcelToPdf } = await import("@/lib/pdf-generator");
    const pdfBuffer = await convertExcelToPdf(excelBuffer);

    // Blob に保存
    const { url: pdfUrl } = await put(
      `estimates/${id}/${est.no}.pdf`,
      pdfBuffer,
      { access: "public", addRandomSuffix: false }
    );

    // DB 更新
    await sql`UPDATE estimates SET pdf_url = ${pdfUrl} WHERE id = ${id}`;

    return NextResponse.json({ pdfUrl });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-pdf] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
