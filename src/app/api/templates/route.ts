/**
 * GET /api/templates — テンプレート一覧取得
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, delivery_type, contract_type, sub_type,
             file_name, blob_url,
             TO_CHAR(uploaded_at, 'YYYY-MM-DD') AS uploaded_at
      FROM templates
      ORDER BY id
    `;
    return NextResponse.json(rows.map((r) => ({
      id: r.id,
      deliveryType: r.delivery_type,
      contractType: r.contract_type,
      subType: r.sub_type ?? undefined,
      fileName: r.file_name,
      blobUrl: r.blob_url || undefined,
      uploadedAt: r.uploaded_at,
    })));
  } catch (e) {
    console.error("[templates GET]", e);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}
