import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  evaluateAndStripWorkbook,
  extractAmountsFromCsv,
  extractAmountsFromPdfText,
  freezeNonPrintSheetFormulas,
  reorderPrintSheetsFirst,
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

describe("reorderPrintSheetsFirst", () => {
  it("moves 表紙/ライセンス/保守料 to the front in defined order", () => {
    const wb = new ExcelJS.Workbook();
    // テンプレートを模した順序（非印刷シートが先頭にある）
    wb.addWorksheet("設定情報");
    wb.addWorksheet("保守料");
    wb.addWorksheet("単価マスタ");
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("表紙");

    reorderPrintSheetsFirst(wb);

    // ExcelJS の orderNo はシート一覧をそのまま再ソートはしないため、
    // 並び順を明示的に確認する（orderNo は型定義に無いのでキャストして読み出す）
    const getOrder = (ws: ExcelJS.Worksheet): number =>
      (ws as unknown as { orderNo?: number }).orderNo ?? 0;
    const sorted = [...wb.worksheets].sort((a, b) => getOrder(a) - getOrder(b));
    const names = sorted.map((ws) => ws.name);
    expect(names.slice(0, 3)).toEqual(["表紙", "ライセンス", "保守料"]);
    // 非印刷シートは元の相対順序で末尾に残る
    expect(names.slice(3).sort()).toEqual(["単価マスタ", "設定情報"].sort());
  });

  it("does not delete any sheets (Gotenberg path keeps all sheets)", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("設定情報");
    wb.addWorksheet("表紙");
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    wb.addWorksheet("単価マスタ");

    reorderPrintSheetsFirst(wb);

    expect(wb.worksheets.map((ws) => ws.name).sort()).toEqual(
      ["ライセンス", "単価マスタ", "保守料", "表紙", "設定情報"].sort()
    );
  });
});

describe("freezeNonPrintSheetFormulas", () => {
  /**
   * excel-writer.ts のセル書き込みを模した状態:
   *   - 設定情報!C8 は元の VLOOKUP 数式を保持しつつ result に正しい値 (0.7) を持つ
   *   - 設定情報!C28 は intra-sheet 数式 (=C26+5) で result は古い値（C26 更新前）
   *   - 設定情報!C4 は plain string（数式無し）
   *   - 印刷シートの数式は変更しない
   */
  function buildWorkbookSimulatingWriter(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();

    const settings = wb.addWorksheet("設定情報");
    settings.getCell("C4").value = "To: テスト代理店";  // plain（数式無し）
    settings.getCell("C7").value = "B"; // VLOOKUP キー
    settings.getCell("C8").value = {
      formula: "VLOOKUP(C7,'単価マスタ'!A:B,2,FALSE)",
      result: 0.7,
      date1904: false,
    } as ExcelJS.CellFormulaValue;
    settings.getCell("C26").value = 2025; // 既存保守開始年
    settings.getCell("C28").value = {
      formula: "C26+5",
      result: 2030, // テンプレ保存時のキャッシュ（更新 C26 と一致する想定）
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    // 単価マスタ: VLOOKUP の参照テーブル
    const prices = wb.addWorksheet("単価マスタ");
    prices.getCell("A1").value = "A";
    prices.getCell("B1").value = 0.6;
    prices.getCell("A2").value = "B";
    prices.getCell("B2").value = 0.7;

    // 印刷シート
    const cover = wb.addWorksheet("表紙");
    cover.getCell("A1").value = "見積書";
    cover.getCell("B1").value = {
      formula: "設定情報!C4",
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    return wb;
  }

  it("replaces 設定情報 formula cells with HF results (preserving excel-writer values)", () => {
    const wb = buildWorkbookSimulatingWriter();
    freezeNonPrintSheetFormulas(wb);

    const settings = wb.getWorksheet("設定情報")!;
    // VLOOKUP は HyperFormula で評価可能（単価マスタ がワークブックにある）
    expect(settings.getCell("C8").value).toBe(0.7);
    // intra-sheet 数式 =C26+5 は HF が C26=2025 を見て 2030 に評価
    expect(settings.getCell("C28").value).toBe(2030);
    // 数式は除去されている（plain value のみ）
    expect(typeof settings.getCell("C8").value).toBe("number");
    expect(typeof settings.getCell("C28").value).toBe("number");
  });

  it("does not modify print-sheet formulas (LibreOffice evaluates them)", () => {
    const wb = buildWorkbookSimulatingWriter();
    freezeNonPrintSheetFormulas(wb);

    const cover = wb.getWorksheet("表紙")!;
    const v = cover.getCell("B1").value as ExcelJS.CellFormulaValue;
    expect(typeof v).toBe("object");
    expect(v.formula).toBe("設定情報!C4");
  });

  it("keeps all sheets in workbook (no deletion)", () => {
    const wb = buildWorkbookSimulatingWriter();
    freezeNonPrintSheetFormulas(wb);

    const names = wb.worksheets.map((ws) => ws.name).sort();
    expect(names).toEqual(["単価マスタ", "表紙", "設定情報"].sort());
  });

  it("falls back to cached result when HF cannot evaluate", () => {
    const wb = new ExcelJS.Workbook();
    const settings = wb.addWorksheet("設定情報");
    // 存在しないシートへの参照（HF はエラーを返す）
    settings.getCell("C8").value = {
      formula: "VLOOKUP(C7,'存在しないシート'!A:B,2,FALSE)",
      result: 0.5,
      date1904: false,
    } as ExcelJS.CellFormulaValue;
    settings.getCell("C7").value = "X";

    freezeNonPrintSheetFormulas(wb);

    // HF エラー → excel-writer.ts が書き込んだ cached result 0.5 にフォールバック
    expect(wb.getWorksheet("設定情報")!.getCell("C8").value).toBe(0.5);
  });
});
