/**
 * Excel → PDF 変換ユーティリティ
 *
 * ConvertAPI (https://www.convertapi.com/) を使用して
 * Excel ファイルを PDF に変換する。
 *
 * 環境変数:
 *   CONVERTAPI_SECRET  ConvertAPI のシークレットキー
 *
 * ConvertAPI が未設定の場合は fallback として
 * @matbee/libreoffice-converter (Wasm) を試みる。
 */

async function convertViaConvertApi(excelBuffer: Buffer): Promise<Buffer> {
  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) throw new Error("CONVERTAPI_SECRET が設定されていません");

  const formData = new FormData();
  const arrayBuffer: ArrayBuffer = excelBuffer.buffer instanceof ArrayBuffer
    ? excelBuffer.buffer.slice(excelBuffer.byteOffset, excelBuffer.byteOffset + excelBuffer.byteLength) as ArrayBuffer
    : new Uint8Array(excelBuffer).buffer;
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  formData.append("File", blob, "estimate.xlsx");
  formData.append("StoreFile", "true");

  const res = await fetch(
    `https://v2.convertapi.com/convert/xlsx/to/pdf?Secret=${secret}`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ConvertAPI error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json() as {
    Files?: { FileData?: string; Url?: string }[];
  };

  const file = json.Files?.[0];
  if (!file) throw new Error("ConvertAPI: レスポンスにファイルが含まれていません");

  // FileData (base64) が返ってきた場合
  if (file.FileData) {
    return Buffer.from(file.FileData, "base64");
  }

  // Url が返ってきた場合はダウンロード
  if (file.Url) {
    const dlRes = await fetch(file.Url);
    if (!dlRes.ok) throw new Error(`ConvertAPI download error: ${dlRes.status}`);
    return Buffer.from(await dlRes.arrayBuffer());
  }

  throw new Error("ConvertAPI: PDF データを取得できませんでした");
}

async function convertViaLibreOfficeWasm(excelBuffer: Buffer): Promise<Buffer> {
  const { convertDocument } = await import("@matbee/libreoffice-converter");
  const result = await convertDocument(excelBuffer, { outputFormat: "pdf" });
  return Buffer.from(result.data);
}

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  // ConvertAPI が設定されている場合は優先使用
  if (process.env.CONVERTAPI_SECRET) {
    return convertViaConvertApi(excelBuffer);
  }

  // フォールバック: LibreOffice Wasm（Vercel では動作しない可能性あり）
  console.warn("[pdf-generator] CONVERTAPI_SECRET 未設定。LibreOffice Wasm を試みます。");
  return convertViaLibreOfficeWasm(excelBuffer);
}
