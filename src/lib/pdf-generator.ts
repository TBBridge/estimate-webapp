/**
 * Excel → PDF 変換ユーティリティ
 *
 * ConvertAPI (https://www.convertapi.com/) を使用して
 * Excel ファイルを PDF に変換する。
 *
 * 変換前処理:
 *   印刷対象シート（表紙・ライセンス・保守料）以外を非表示にしてから送信する。
 *   これにより PDF には3シートのみ含まれ、
 *   Blob に保存される Excel は全シート表示のまま維持される。
 *
 * 必須環境変数:
 *   CONVERTAPI_SECRET  ConvertAPI の Token（Integration > Authentication で取得）
 */

import ExcelJS from "exceljs";

/** PDF に含める印刷対象シート名 */
const PRINT_SHEETS = ["表紙", "ライセンス", "保守料"];

/**
 * Excel バッファの印刷対象外シートを非表示にして返す。
 * 元のバッファは変更しない（PDF 変換専用の一時バッファを生成）。
 */
async function prepareExcelForPdf(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS は ArrayBuffer を受け付けるため変換する
  const ab = excelBuffer.buffer.slice(
    excelBuffer.byteOffset,
    excelBuffer.byteOffset + excelBuffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(ab);

  for (const ws of workbook.worksheets) {
    if (!PRINT_SHEETS.includes(ws.name)) {
      ws.state = "hidden";
    }
  }

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

  // PDF 変換用: 印刷対象外シートを非表示にした一時バッファを生成
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
