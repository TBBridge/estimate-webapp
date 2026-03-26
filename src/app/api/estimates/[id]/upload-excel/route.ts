/**
 * POST /api/estimates/[id]/upload-excel
 * multipart/form-data: field "file" = .xlsx / .xlsm
 * Blob 上の Excel を差し替え、pdf_url をクリアしたうえで PDF を再生成する。
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { generateEstimatePdfAndSave } from "@/lib/estimate-pdf-generate";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sql = getDb();

    const rows = await sql`SELECT id, no FROM estimates WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const no = String((rows[0] as { no: string }).no);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN が設定されていません" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file フィールドに Excel を指定してください" }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
      return NextResponse.json({ error: ".xlsx または .xlsm のみアップロードできます" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "空のファイルです" }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "25MB 以下のファイルにしてください" }, { status: 400 });
    }

    const blobPath = `estimates/${id}/${no}.xlsx`;
    const { url: excelUrl } = await put(blobPath, buf, { access: "public", addRandomSuffix: false });

    await sql`
      UPDATE estimates SET excel_url = ${excelUrl}, pdf_url = '' WHERE id = ${id}
    `;

    try {
      const { pdfUrl } = await generateEstimatePdfAndSave(sql, id);
      return NextResponse.json({ excelUrl, pdfUrl });
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.error("[upload-excel] PDF regeneration failed:", msg);
      return NextResponse.json({
        excelUrl,
        pdfUrl: "",
        pdfError: msg,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload-excel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
