/**
 * POST /api/templates/[id]  — Excelファイルをアップロードして Vercel Blob に保存し、DBを更新
 * DELETE /api/templates/[id] — Blob からファイルを削除し、DBをリセット
 */
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN が設定されていません。Vercel ダッシュボード > Storage > Blob でトークンを取得し、環境変数に設定してください。" },
        { status: 503 }
      );
    }

    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが指定されていません" }, { status: 400 });
    }
    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: ".xlsx ファイルのみアップロードできます" }, { status: 400 });
    }

    // 既存の Blob URL を取得（差し替え時に旧ファイルを削除）
    const sql = getDb();
    const existing = await sql`SELECT blob_url FROM templates WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "テンプレートが見つかりません" }, { status: 404 });
    }
    const oldBlobUrl = existing[0].blob_url as string;

    // 旧ファイルを先に削除（同名ファイルの上書きエラーを防ぐ）
    if (oldBlobUrl) {
      try { await del(oldBlobUrl); } catch { /* 旧ファイルが存在しない場合は無視 */ }
    }

    // Vercel Blob にアップロード（allowOverwrite: true で同名ファイルを上書き可能に）
    const blobPath = `templates/${id}/${file.name}`;
    const { url } = await put(blobPath, file, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // DB 更新
    const today = new Date().toISOString().slice(0, 10);
    await sql`
      UPDATE templates
      SET file_name = ${file.name}, blob_url = ${url}, uploaded_at = ${today}
      WHERE id = ${id}
    `;

    return NextResponse.json({ id, fileName: file.name, blobUrl: url, uploadedAt: today });
  } catch (e) {
    console.error("[templates/id POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sql = getDb();
    const existing = await sql`SELECT blob_url FROM templates WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const blobUrl = existing[0].blob_url as string;
    if (blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try { await del(blobUrl); } catch { /* 無視 */ }
    }

    await sql`
      UPDATE templates
      SET file_name = '', blob_url = '', uploaded_at = CURRENT_DATE
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[templates/id DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
