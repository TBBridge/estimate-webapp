/**
 * 見積に紐づく Blob 上の Excel から PDF を生成し、Blob に保存して pdf_url を更新する。
 */
import { put } from "@vercel/blob";
import type { getDb } from "@/lib/db";

type Sql = ReturnType<typeof getDb>;

export async function generateEstimatePdfAndSave(sql: Sql, estimateId: string): Promise<{ pdfUrl: string; no: string }> {
  const rows = await sql`
    SELECT id, no, excel_url FROM estimates WHERE id = ${estimateId}
  `;
  if (rows.length === 0) {
    throw new Error("見積が見つかりません");
  }
  const est = rows[0] as { id: string; no: string; excel_url: string };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN が設定されていません");
  }
  if (!est.excel_url) {
    throw new Error("Excel ファイルが存在しません");
  }

  const excelRes = await fetch(est.excel_url);
  if (!excelRes.ok) {
    throw new Error(`Excel ファイルの取得に失敗しました: ${excelRes.status}`);
  }
  const excelBuffer = Buffer.from(await excelRes.arrayBuffer());

  const { convertExcelToPdf } = await import("@/lib/pdf-generator");
  const pdfBuffer = await convertExcelToPdf(excelBuffer);

  const { url: pdfUrl } = await put(`estimates/${estimateId}/${est.no}.pdf`, pdfBuffer, {
    access: "public",
    addRandomSuffix: false,
  });

  await sql`UPDATE estimates SET pdf_url = ${pdfUrl} WHERE id = ${estimateId}`;

  return { pdfUrl, no: est.no };
}
