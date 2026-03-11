/**
 * xlsx (SheetJS) で Excel ファイルの全セル値を読み取るユーティリティ
 *
 * exceljs で書き込んだ後の Excel Buffer を受け取り、
 * 全セル値をフラットな { "A1": value, "B2": value, ... } 形式で返す。
 */

import * as XLSX from "xlsx";

export interface SheetData {
  cells: Record<string, string | number | undefined>;
  maxRow: number;
  maxCol: number;
}

/**
 * Excel Buffer の最初のシートから全セル値を読み取る
 */
export function readExcelSheet(buffer: Buffer): SheetData {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("シートが見つかりません");

  const sheet = workbook.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) return { cells: {}, maxRow: 0, maxCol: 0 };

  const range = XLSX.utils.decode_range(ref);
  const cells: Record<string, string | number | undefined> = {};

  let maxRow = 0;
  let maxCol = 0;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
        cells[addr] = typeof cell.v === "number" ? cell.v : String(cell.v);
        if (r + 1 > maxRow) maxRow = r + 1;
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    }
  }

  return { cells, maxRow, maxCol };
}
