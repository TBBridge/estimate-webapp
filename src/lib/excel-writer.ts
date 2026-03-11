/**
 * Excel テンプレートにフォーム入力値を書き込むユーティリティ
 *
 * セルマッピング仕様（要件定義より）:
 *   全パターン共通:
 *     代理店名: C4 / 顧客名: C5 / 見積作成日: C3
 *
 *   オンプレ 新規:
 *     ライセンス数: C18 / オプション1: C21 / オプション2: C24
 *
 *   オンプレ ライセンス追加:
 *     既存ライセンス数: C18 / 追加後ライセンス数: C21
 *     既存保守開始年: C26 / 月: C27 / 終了年: C28 / 月: C29
 *     発注予定年: C30 / 月: C31
 *
 *   オンプレ オプション追加:
 *     オプション: C18 / ライセンス数: C19
 *
 *   サブスクリプション 新規:
 *     ライセンス数: C18 / オプション1: C21 / オプション2: C24
 *
 *   クラウド 新規:
 *     ライセンス数: C18 / オプション1: C21 / オプション2: C24
 *
 *   クラウド 追加:
 *     既存ライセンス数: C18 / 追加後ライセンス数: C21
 *     既存保守開始年: C26 / 月: C27 / 終了年: C28 / 月: C29
 *     発注予定年: C30 / 月: C31
 */

import ExcelJS from "exceljs";

export interface WriteEstimateParams {
  /** テンプレート Excel の ArrayBuffer */
  templateBuffer: ArrayBuffer;
  agencyName: string;
  customerName: string;
  deliveryType: string;
  contractType: string;
  cloudBilling?: string;
  /** フォーム入力値（estimate-schema.ts の FormFieldDef.id をキーとする） */
  formInputs: Record<string, unknown>;
  /** 見積作成日 (YYYY-MM-DD) */
  createdAt: string;
}

/** セルに値をセット（文字列 or 数値） */
function setCell(sheet: ExcelJS.Worksheet, cellAddr: string, value: unknown) {
  const cell = sheet.getCell(cellAddr);
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "number") {
    cell.value = value;
  } else {
    cell.value = String(value);
  }
}

/** オプション配列を文字列化（チェックされたオプション名をカンマ区切り） */
function formatOptions(options: unknown): string {
  if (!options || !Array.isArray(options)) return "";
  return (options as string[]).join(", ");
}

/** year_month 値 { year, month } を "YYYY年MM月" 形式に */
function formatYearMonth(ym: unknown): { year: string; month: string } {
  if (ym && typeof ym === "object") {
    const o = ym as Record<string, unknown>;
    return {
      year: String(o.year ?? ""),
      month: String(o.month ?? ""),
    };
  }
  return { year: "", month: "" };
}

export async function writeEstimateToTemplate(
  params: WriteEstimateParams
): Promise<Buffer> {
  const {
    templateBuffer,
    agencyName,
    customerName,
    deliveryType,
    contractType,
    formInputs,
    createdAt,
  } = params;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  // 印刷対象シート以外を非表示にする（PDF変換時に除外される）
  const PRINT_SHEETS = ["表紙", "ライセンス", "保守料"];
  for (const ws of workbook.worksheets) {
    if (!PRINT_SHEETS.includes(ws.name)) {
      ws.state = "hidden";
    }
  }

  // データ書き込みは「表紙」シート（最初の印刷対象シート）に対して行う
  const sheet = workbook.getWorksheet("表紙") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("テンプレートにシートが見つかりません");

  // ── 共通フィールド ──────────────────────────────────
  setCell(sheet, "C3", createdAt);
  setCell(sheet, "C4", agencyName);
  setCell(sheet, "C5", customerName);

  // ── パターン別フィールド ────────────────────────────
  if (deliveryType === "onprem" && contractType === "new") {
    setCell(sheet, "C18", formInputs.licenseCount);
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      setCell(sheet, "C21", opts[0]);
      if (opts.length > 1) setCell(sheet, "C24", opts.slice(1).join(", "));
    }
  } else if (deliveryType === "onprem" && contractType === "license_add") {
    setCell(sheet, "C18", formInputs.existingLicenseCount);
    setCell(sheet, "C21", formInputs.addedLicenseCount);
    const start = formatYearMonth(formInputs.existingMaintenanceStart);
    const end = formatYearMonth(formInputs.existingMaintenanceEnd);
    const order = formatYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C26", start.year);
    setCell(sheet, "C27", start.month);
    setCell(sheet, "C28", end.year);
    setCell(sheet, "C29", end.month);
    setCell(sheet, "C30", order.year);
    setCell(sheet, "C31", order.month);
  } else if (deliveryType === "onprem" && contractType === "option_add") {
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      setCell(sheet, "C18", formatOptions(opts));
    }
    const licenseCounts = formInputs.optionLicenseCounts as Record<string, number> | undefined;
    if (licenseCounts) {
      const entries = Object.entries(licenseCounts)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (entries) setCell(sheet, "C19", entries);
    }
    const start = formatYearMonth(formInputs.existingMaintenanceStart);
    const end = formatYearMonth(formInputs.existingMaintenanceEnd);
    const order = formatYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C26", start.year);
    setCell(sheet, "C27", start.month);
    setCell(sheet, "C28", end.year);
    setCell(sheet, "C29", end.month);
    setCell(sheet, "C30", order.year);
    setCell(sheet, "C31", order.month);
  } else if (deliveryType === "subscription" && contractType === "new") {
    setCell(sheet, "C18", formInputs.licenseCount);
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      setCell(sheet, "C21", opts[0]);
      if (opts.length > 1) setCell(sheet, "C24", opts.slice(1).join(", "));
    }
  } else if (deliveryType === "cloud" && contractType === "new") {
    setCell(sheet, "C18", formInputs.licenseCount);
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      setCell(sheet, "C21", opts[0]);
      if (opts.length > 1) setCell(sheet, "C24", opts.slice(1).join(", "));
    }
  } else if (deliveryType === "cloud" && contractType === "license_add") {
    setCell(sheet, "C18", formInputs.existingLicenseCount);
    setCell(sheet, "C21", formInputs.addedLicenseCount);
    const start = formatYearMonth(formInputs.existingMaintenanceStart);
    const end = formatYearMonth(formInputs.existingMaintenanceEnd);
    const order = formatYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C26", start.year);
    setCell(sheet, "C27", start.month);
    setCell(sheet, "C28", end.year);
    setCell(sheet, "C29", end.month);
    setCell(sheet, "C30", order.year);
    setCell(sheet, "C31", order.month);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
