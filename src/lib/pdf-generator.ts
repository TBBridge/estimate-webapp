/**
 * Excel → PDF 変換ユーティリティ
 *
 * 流れ:
 * 1. 自動入力済み Excel をコピーして PDF 用の一時ワークブックとする
 * 2. 一時ワークブックを開き、編集ロックがあれば解除する
 * 3. 「表紙」「ライセンス」「保守料」を visible、その他（設定情報など）を veryHidden に設定
 *    ※ 設定情報シートは数式参照元のため削除不可。非表示にすることで ConvertAPI の変換対象から除外する
 * 4. 表紙・ライセンス・保守料の3シートのみが PDF 化される
 *
 * 必須環境変数: CONVERTAPI_SECRET
 */

import ExcelJS from "exceljs";
import { PassThrough } from "stream";

/** PDF に含める印刷対象シート名（この3シートのみ残し、他は削除） */
const PRINT_SHEETS = ["表紙", "ライセンス", "保守料"];

/**
 * stream.PassThrough 経由で ExcelJS にバッファを読み込む
 * Vercel 環境では xlsx.load(Buffer) が信頼できないため、
 * ストリームとして渡すことで確実に全シートを読み込む。
 */
async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const pass = new PassThrough();
  const readPromise = workbook.xlsx.read(pass);
  pass.end(buf);
  await readPromise;
  return workbook;
}

/**
 * 自動入力済み Excel をコピーし、PDF 用に以下を行う:
 * - ワークブック・シートの編集ロックを解除
 * - 印刷対象シート（表紙・ライセンス・保守料）を visible に設定
 * - 印刷対象外シート（設定情報など）を veryHidden に設定
 *   ※ 設定情報シートは数式参照元のため削除不可。非表示にすることで
 *     ConvertAPI の変換対象から除外しつつ、数式参照を維持する。
 * 返すバッファは ConvertAPI で PDF 化する用（設定情報は非表示として保持）
 */
async function prepareExcelForPdf(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(excelBuffer);

  const sheetNames = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 読み込みシート: ${sheetNames.join(", ")}`);

  for (const ws of workbook.worksheets) {
    const sheet = ws as ExcelJS.Worksheet & { sheetProtection?: unknown; unprotect?: () => void };

    // 編集ロック解除（PDF 用一時ファイルを処理可能にする）
    if (sheet.sheetProtection) {
      if (typeof sheet.unprotect === "function") sheet.unprotect();
      else sheet.sheetProtection = null;
    }

    if (PRINT_SHEETS.includes(ws.name)) {
      // 印刷対象シートは必ず visible に
      ws.state = "visible";
    } else {
      // 印刷対象外シートは veryHidden に（ConvertAPI が変換対象から除外）
      ws.state = "veryHidden";
    }
  }

  const afterStates = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 変換後シート状態: ${afterStates.join(", ")}`);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) {
    throw new Error(
      "PDF生成には CONVERTAPI_SECRET 環境変数の設定が必要です。" +
      "Vercel ダッシュボード → Settings → Environment Variables に CONVERTAPI_SECRET を追加してください。"
    );
  }

  // 自動入力済み Excel のコピー → 一時 PDF 用 Excel（3シートのみ）を生成
  const pdfReadyBuffer = await prepareExcelForPdf(excelBuffer);

  const arrayBuffer: ArrayBuffer = new Uint8Array(pdfReadyBuffer).buffer;
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const formData = new FormData();
  formData.append("File", blob, "estimate.xlsx");
  formData.append("StoreFile", "true");

  const res = await fetch(
    `https://v2.convertapi.com/convert/xlsx/to/pdf`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}` },
      body: formData,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ConvertAPI エラー ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json() as {
    Files?: { FileData?: string; Url?: string }[];
  };

  const file = json.Files?.[0];
  if (!file) throw new Error("ConvertAPI: レスポンスにファイルが含まれていません");

  if (file.FileData) {
    return Buffer.from(file.FileData, "base64");
  }

  if (file.Url) {
    const dlRes = await fetch(file.Url);
    if (!dlRes.ok) throw new Error(`ConvertAPI ダウンロードエラー: ${dlRes.status}`);
    return Buffer.from(await dlRes.arrayBuffer());
  }

  throw new Error("ConvertAPI: PDF データを取得できませんでした");
}
