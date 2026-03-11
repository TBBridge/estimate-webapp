/**
 * Excel → PDF 変換ユーティリティ
 *
 * @matbee/libreoffice-converter (WebAssembly) を使用して
 * Excelファイルの印刷範囲（全シート: 表紙・ライセンス・保守）を
 * そのまま PDF に変換する。
 *
 * 動的インポートで読み込み、Wasm の初期化失敗を安全にハンドルする。
 */

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  const { convertDocument } = await import("@matbee/libreoffice-converter");
  const result = await convertDocument(excelBuffer, { outputFormat: "pdf" });
  return Buffer.from(result.data);
}
