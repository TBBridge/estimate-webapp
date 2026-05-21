import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  evaluateAndStripWorkbook,
  extractAmountsFromPdfText,
  extractAmountsFromWorkbookBuffer,
  freezeNonPrintSheetFormulas,
  prepareExcelForGotenberg,
  reorderPrintSheetsFirst,
} from "@/lib/pdf-generator";

describe("extractAmountsFromWorkbookBuffer", () => {
  /**
   * テンプレートを模した合成ワークブック:
   *   設定情報 シートの値を 表紙 シートが数式で参照し、表紙!C21 に金額、表紙!C24 に保守料が入る。
   */
  async function buildWorkbookBuffer(opts: {
    licensePrice: number;
    licenseQty: number;
    maintRatio: number;
    extraSheets?: string[];
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();

    const settings = wb.addWorksheet("設定情報");
    settings.getCell("C18").value = opts.licensePrice;
    settings.getCell("C19").value = opts.licenseQty;
    settings.getCell("C30").value = opts.maintRatio;

    const cover = wb.addWorksheet("表紙");
    cover.getCell("A1").value = "見積書";
    // 表紙!C21 = 本体金額 = 設定情報!C18 * 設定情報!C19
    cover.getCell("C21").value = {
      formula: "設定情報!C18*設定情報!C19",
      date1904: false,
    } as ExcelJS.CellFormulaValue;
    // 表紙!C24 = 保守料 = ROUND(本体金額 * 保守率, 0)
    cover.getCell("C24").value = {
      formula: "ROUND(C21*設定情報!C30,0)",
      date1904: false,
    } as ExcelJS.CellFormulaValue;

    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    for (const name of opts.extraSheets ?? []) wb.addWorksheet(name);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("reads amount from 表紙!C21 and maintenanceFee from 表紙!C24 via HyperFormula", async () => {
    const buf = await buildWorkbookBuffer({
      licensePrice: 50000,
      licenseQty: 24,
      maintRatio: 0.18,
    });

    const result = await extractAmountsFromWorkbookBuffer(buf);
    expect(result).not.toBeNull();
    // 50000 * 24 = 1,200,000
    expect(result!.amount).toBe(1_200_000);
    // ROUND(1,200,000 * 0.18, 0) = 216,000
    expect(result!.maintenanceFee).toBe(216_000);
  });

  it("returns zeros when target cells are empty", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("設定情報");
    wb.addWorksheet("表紙"); // C21 / C24 は空
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await extractAmountsFromWorkbookBuffer(buf);
    expect(result).toEqual({ amount: 0, maintenanceFee: 0 });
  });

  it("returns null when 表紙 sheet is missing", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("設定情報");
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await extractAmountsFromWorkbookBuffer(buf);
    expect(result).toBeNull();
  });

  it("floors fractional results and clamps negatives to zero", async () => {
    const wb = new ExcelJS.Workbook();
    const settings = wb.addWorksheet("設定情報");
    settings.getCell("C18").value = 12345.7;
    const cover = wb.addWorksheet("表紙");
    cover.getCell("C21").value = {
      formula: "設定情報!C18",
      date1904: false,
    } as ExcelJS.CellFormulaValue;
    cover.getCell("C24").value = -100;
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await extractAmountsFromWorkbookBuffer(buf);
    expect(result).toEqual({ amount: 12345, maintenanceFee: 0 });
  });
});

describe("extractAmountsFromPdfText", () => {
  it("picks values on the same line as the keyword", () => {
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

  it("falls back to the next line when the keyword line has no number (multi-line layout)", () => {
    // pdf-parse は spreadsheet PDF をセルごとに別行へ分解しがち。
    // 御見積金額 と 数値 が別行に出るレイアウトを想定。
    const text = [
      "御見積金額",
      "¥1,234,567",
      "（税抜）",
      "保守料",
      "234,000",
    ].join("\n");

    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
    });
  });

  it("picks 合計 when 御見積金額 line is missing", () => {
    const text = ["小計", "100,000", "合計", "500,000", "保守", "80,000"].join("\n");
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 500000,
      maintenanceFee: 80000,
    });
  });

  it("does not pick maintenance value from the amount line (exclude rule)", () => {
    const text = ["御見積金額（保守含む）  ¥1,000,000", "年額保守 200,000"].join("\n");
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 1000000,
      maintenanceFee: 200000,
    });
  });

  it("returns zeros for irrelevant text", () => {
    expect(extractAmountsFromPdfText("請求先 株式会社サンプル 03-9999-0000")).toEqual({
      amount: 0,
      maintenanceFee: 0,
    });
  });

  it("extracts from English template cover layout (License / Maintenance Fee on same line)", () => {
    // 実際の英語テンプレ PDF (EST-202605-009) のレイアウトを模した入力
    const text = [
      "QUOTATION",
      "Quotation No: 326145260253-001",
      "Quotation Summary",
      "1i-Reporter On-premise License Version License¥816,000 T.B.C",
      "2 i-Reporter Annual Maintenance Fee¥153,000 T.B.C",
      "¥969,000",
    ].join("\n");

    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 816000,
      maintenanceFee: 153000,
    });
  });

  it("falls back to TOTAL AMOUNT sequence (1st=amount, 2nd=maintenance) when cover labels are absent", () => {
    const text = [
      "QUOTATION",
      "Some unrelated lines",
      "TOTAL AMOUNT ¥816,000",
      "Item Software ...",
      "TOTAL AMOUNT ¥153,000",
    ].join("\n");

    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 816000,
      maintenanceFee: 153000,
    });
  });

  it("ignores very large IDs that exceed the amount upper bound", () => {
    // HubSpot deal ID のような巨大数字を amount として誤拾いしない
    const text = [
      "Quotation No: 326145260253-001",
      "御見積金額 ¥1,234,567",
      "保守料 ¥234,000",
    ].join("\n");
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
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

describe("prepareExcelForGotenberg", () => {
  /**
   * 設定情報を更新してから 表紙 が古いキャッシュ値を返さないことを担保するには、
   * 生成 xlsx の workbook.xml に `<calcPr fullCalcOnLoad="1"/>` が必要。
   * LibreOffice はこのフラグが無いと cached result を信用し、書き換えた値を反映しない。
   */
  async function buildTemplateBuffer(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const settings = wb.addWorksheet("設定情報");
    settings.getCell("C4").value = "To: 旧代理店"; // 後で書き換える想定
    const cover = wb.addWorksheet("表紙");
    cover.getCell("A1").value = {
      formula: "設定情報!C4",
      result: "To: 旧代理店", // テンプレ作成時のキャッシュ（古い値）
      date1904: false,
    } as ExcelJS.CellFormulaValue;
    wb.addWorksheet("ライセンス");
    wb.addWorksheet("保守料");
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("writes <calcPr fullCalcOnLoad=\"1\"/> into the saved workbook.xml", async () => {
    // 元テンプレ XML に fullCalcOnLoad が無いことを確認 → prepareExcelForGotenberg 経由で
    // 1 が立つことを保証する。LibreOffice はこのフラグで全数式を再評価するため、
    // テンプレ作成時に保存された cached result（前回のデータや空白）が PDF に残らない。
    const tplBuf = await buildTemplateBuffer();
    const JSZip = (await import("jszip")).default;

    const beforeZip = await JSZip.loadAsync(tplBuf);
    const beforeXml = await beforeZip.file("xl/workbook.xml")!.async("string");
    expect(beforeXml).not.toMatch(/fullCalcOnLoad/);

    const readyBuf = await prepareExcelForGotenberg(tplBuf);
    const afterZip = await JSZip.loadAsync(readyBuf);
    const afterXml = await afterZip.file("xl/workbook.xml")!.async("string");
    expect(afterXml).toMatch(/<calcPr[^/]*fullCalcOnLoad="1"/);
  });

  it("does not destroy print-sheet formulas (LibreOffice still evaluates them)", async () => {
    // 数式自体は保持されたまま（評価は LibreOffice が行う）。cached result だけ消える。
    const tplBuf = await buildTemplateBuffer();
    const readyBuf = await prepareExcelForGotenberg(tplBuf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readyBuf as unknown as ExcelJS.Buffer);
    const cover = wb.getWorksheet("表紙")!;
    const v = cover.getCell("A1").value as ExcelJS.CellFormulaValue;
    expect(typeof v).toBe("object");
    expect(v.formula).toBe("設定情報!C4");
  });

  it("strips cached <v> from formula cells so LibreOffice must recompute", async () => {
    // 元テンプレの formula セルには古いキャッシュ値が残っているケースを再現。
    // prepareExcelForGotenberg 通過後、出力 xlsx の formula セルから <v> が消えていることを確認。
    const tplBuf = await buildTemplateBuffer();
    const readyBuf = await prepareExcelForGotenberg(tplBuf);

    const JSZip = (await import("jszip")).default;

    async function findSheetWithRef(buf: Buffer, ref: string): Promise<string> {
      const zip = await JSZip.loadAsync(buf);
      for (const name of Object.keys(zip.files)) {
        if (!name.startsWith("xl/worksheets/") || !name.endsWith(".xml")) continue;
        const file = zip.file(name);
        if (!file) continue;
        const xml = await file.async("string");
        if (xml.includes(ref)) return xml;
      }
      return "";
    }

    // 元テンプレでは A1 に formula+cached value "To: 旧代理店" が入っている
    const beforeCoverXml = await findSheetWithRef(tplBuf, "設定情報!C4");
    expect(beforeCoverXml).toMatch(/<f>設定情報!C4<\/f>.*?<v>/);

    // 修正後: <v> 要素が消えている（formula のみ残る）
    const afterCoverXml = await findSheetWithRef(readyBuf, "設定情報!C4");
    // 数式は残っているが、その直後に <v> が来ない
    expect(afterCoverXml).toMatch(/<f>設定情報!C4<\/f>(?!<v>)/);
  });
});
