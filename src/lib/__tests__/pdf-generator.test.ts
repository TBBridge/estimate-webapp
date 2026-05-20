import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  evaluateAndStripWorkbook,
  extractAmountsFromCsv,
  extractAmountsFromPdfText,
} from "@/lib/pdf-generator";

describe("extractAmountsFromCsv", () => {
  // LibreOffice の CSV 出力はセル書式を剥がすため、表示の千区切りカンマは入らない。
  it("picks the largest number on the matching keyword line", () => {
    const csv = [
      "ヘッダ,項目,金額",
      "御見積金額,,1234567",
      "保守料,,234000",
      "備考,1,2",
    ].join("\n");

    expect(extractAmountsFromCsv(csv)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
    });
  });

  it("falls back to 合計 line when 見積金額 keyword is absent", () => {
    const csv = ["合計,,500000", "保守,,80000"].join("\n");
    expect(extractAmountsFromCsv(csv)).toEqual({
      amount: 500000,
      maintenanceFee: 80000,
    });
  });

  it("returns zeros for empty input", () => {
    expect(extractAmountsFromCsv("")).toEqual({ amount: 0, maintenanceFee: 0 });
  });
});

describe("extractAmountsFromPdfText", () => {
  it("extracts amount and maintenance from PDF-style text (no comma cell separators)", () => {
    // Gotenberg / LibreOffice の PDF テキスト抽出例（行内が空白区切り）
    const text = [
      "見積書",
      "御見積金額    ¥1,234,567",
      "年額保守    234,000",
      "ご担当: 山田 03-1234-5678",
    ].join("\n");

    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
    });
  });

  it("picks 合計 when 見積金額 line is missing", () => {
    const text = ["小計 100,000", "合計 500,000", "保守 80,000"].join("\n");
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 500000,
      maintenanceFee: 80000,
    });
  });

  it("ignores non-keyword lines and returns zeros", () => {
    const text = "請求先 株式会社サンプル 03-9999-0000";
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 0,
      maintenanceFee: 0,
    });
  });
});

describe("evaluateAndStripWorkbook", () => {
  /** テンプレートを模した合成ワークブック: 設定情報 のセルを 表紙 が参照する */
  function buildSyntheticWorkbook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();

    const settings = wb.addWorksheet("設定情報");
    settings.getCell("C5").value = "株式会社サンプル";
    settings.getCell("C8").value = 0.7; // 仕切り率
    settings.getCell("C18").value = 100; // 単価
    settings.getCell("C19").value = 10; // 数量

    const cover = wb.addWorksheet("表紙");
    cover.getCell("A1").value = "見積書";
    cover.getCell("B5").value = { formula: "設定情報!C5", date1904: false } as ExcelJS.CellFormulaValue;
    cover.getCell("B10").value = {
      formula: "設定情報!C18*設定情報!C19",
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    const license = wb.addWorksheet("ライセンス");
    license.getCell("B2").value = {
      formula: "設定情報!C18*設定情報!C8",
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    const maintenance = wb.addWorksheet("保守料");
    maintenance.getCell("B2").value = {
      formula: "ROUND(設定情報!C18*0.2,0)",
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    const other = wb.addWorksheet("その他");
    other.getCell("A1").value = "削除対象";

    return wb;
  }

  it("keeps only print sheets and removes 設定情報 / その他", () => {
    const wb = buildSyntheticWorkbook();
    evaluateAndStripWorkbook(wb);

    const remaining = wb.worksheets.map((ws) => ws.name).sort();
    expect(remaining).toEqual(["ライセンス", "保守料", "表紙"]);
  });

  it("replaces cross-sheet formulas with their evaluated values", () => {
    const wb = buildSyntheticWorkbook();
    evaluateAndStripWorkbook(wb);

    const cover = wb.getWorksheet("表紙")!;
    // 設定情報!C5 = "株式会社サンプル"
    expect(cover.getCell("B5").value).toBe("株式会社サンプル");
    // 設定情報!C18 * 設定情報!C19 = 100 * 10
    expect(cover.getCell("B10").value).toBe(1000);

    const license = wb.getWorksheet("ライセンス")!;
    // 設定情報!C18 * 設定情報!C8 = 100 * 0.7
    expect(license.getCell("B2").value).toBe(70);

    const maintenance = wb.getWorksheet("保守料")!;
    // ROUND(100*0.2, 0) = 20
    expect(maintenance.getCell("B2").value).toBe(20);
  });

  it("keeps non-formula cell values untouched", () => {
    const wb = buildSyntheticWorkbook();
    evaluateAndStripWorkbook(wb);

    expect(wb.getWorksheet("表紙")!.getCell("A1").value).toBe("見積書");
  });
});
