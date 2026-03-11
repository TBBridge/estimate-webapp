/**
 * Excel → PDF 変換ユーティリティ
 *
 * @matbee/libreoffice-converter (WebAssembly) を使用して
 * Excelファイルの印刷範囲（全シート: 表紙・ライセンス・保守）を
 * そのまま PDF に変換する。
 *
 * LibreOffice のネイティブバイナリは不要（Wasm で動作）。
 */

import { convertDocument } from "@matbee/libreoffice-converter";

/**
 * Excel Buffer を PDF Buffer に変換する
 * テンプレートの全シート（表紙、ライセンス、保守）の印刷範囲がPDFに反映される
 */
export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  const result = await convertDocument(excelBuffer, { outputFormat: "pdf" });
  return Buffer.from(result.data);
}
