/**
 * 見積に紐づく Blob 上の Excel から PDF を生成し、Blob に保存して pdf_url を更新する。
 * Vercel Blob は同一パスへの上書き不可のため、PDF も毎回ユニークなパスに保存する。
 */
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import type { getDb } from "@/lib/db";
import { sanitizeEstimateNoForBlobPath } from "@/lib/excel-file-history";

type Sql = ReturnType<typeof getDb>;

/** 金額の上限（誤抽出された電話番号や ID を弾くためのガード）。100 億円。 */
const AMOUNT_UPPER_BOUND = 10_000_000_000;

function isPlausibleAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= AMOUNT_UPPER_BOUND;
}

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

  const excelRes = await fetch(est.excel_url, { cache: "no-store" });
  if (!excelRes.ok) {
    throw new Error(`Excel ファイルの取得に失敗しました: ${excelRes.status}`);
  }
  const excelBuffer = Buffer.from(await excelRes.arrayBuffer());

  const { convertExcelToPdf } = await import("@/lib/pdf-generator");
  const { pdf: pdfBuffer, amounts } = await convertExcelToPdf(excelBuffer);

  const safeNo = sanitizeEstimateNoForBlobPath(est.no);
  const unique = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  const pdfBlobPath = `estimates/${estimateId}/${safeNo}_${unique}.pdf`;
  const { url: pdfUrl } = await put(pdfBlobPath, pdfBuffer, {
    access: "public",
    addRandomSuffix: false,
  });

  // CSV 由来の金額は「初回のみ」DB に書き込む。既に値が入っている見積は
  // 承認後に手動修正された可能性があるため、再生成で上書きしない。
  // また、上限を超える値は誤抽出（電話番号・郵便番号など）と判断して破棄する。
  const amountValid =
    !!amounts && isPlausibleAmount(amounts.amount) && isPlausibleAmount(amounts.maintenanceFee);
  const hasAmountSignal =
    !!amounts && (amounts.amount > 0 || amounts.maintenanceFee > 0);

  if (amountValid && hasAmountSignal) {
    const updated = await sql`
      UPDATE estimates
      SET pdf_url = ${pdfUrl},
          amount = ${amounts!.amount},
          maintenance_fee = ${amounts!.maintenanceFee}
      WHERE id = ${estimateId}
        AND COALESCE(amount, 0) = 0
        AND COALESCE(maintenance_fee, 0) = 0
      RETURNING id
    `;
    if (updated.length === 0) {
      // 既に金額が入っているケース（再生成）— pdf_url のみ更新
      await sql`UPDATE estimates SET pdf_url = ${pdfUrl} WHERE id = ${estimateId}`;
    }
  } else {
    await sql`UPDATE estimates SET pdf_url = ${pdfUrl} WHERE id = ${estimateId}`;
  }

  return { pdfUrl, no: est.no };
}
