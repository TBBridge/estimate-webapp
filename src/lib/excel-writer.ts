/**
 * Excel テンプレートの「設定情報」シートにフォーム入力値を書き込むユーティリティ
 *
 * 全テンプレート共通セルマッピング（設定情報シート）:
 *   C3: 見積作成日
 *   C4: 代理店名（"To: {代理店名}" 形式）
 *   C5: エンドユーザ名① / 顧客名（"For: {顧客名}" 形式）
 *   C7: 代理店種別（仕切り率 VLOOKUP のキー = 代理店名）
 *   C8: 本製品（i-Reporter 等）の仕切り率（小数 0〜1）
 *   C9: 保守の仕切り率（小数 0〜1）
 *   C13: Hubspot NO（承認時に HubSpot 取引 ID を書き込む）
 *
 * オンプレ 新規（tpl-1）:
 *   C18: ライセンス数 / C21: オプション① / C24: オプション②
 *
 * オンプレ ライセンス追加（tpl-2）:
 *   C18: 既存ライセンス数 / C21: 追加ライセンス数
 *   C26: 既存保守開始年 / C27: 月 / C28: 終了年 / C29: 月
 *   C30: 発注予定年 / C31: 月
 *
 * オンプレ オプション追加（tpl-3）:
 *   C18: オプション① / C19: オプション費用（ライセンス数はC24）
 *   C21: オプション② / C23: オプション③
 *   C36: 既存保守開始年 / C37: 月 / C40: 発注予定年 / C41: 月
 *
 * サブスクリプション 新規（tpl-4）:
 *   C18: ライセンス数 / C20: 契約月数 / C21: オプション①
 *
 * クラウド 新規 年額（tpl-5）/ 区切り（tpl-6）:
 *   C18: ライセンス数 / C20: 契約月数 / C21: オプション①
 *
 * クラウド ライセンス追加（tpl-7）:
 *   C18: 既存ライセンス数 / C21: 追加ライセンス数
 *   C26: 既存年額契約開始年 / C27: 月 / C30: 発注予定年 / C31: 月
 */

import ExcelJS from "exceljs";
import { PassThrough } from "stream";
import { OPTION_ITEMS, formatLicenseCountForExcel } from "@/lib/estimate-schema";

export interface WriteEstimateParams {
  /** テンプレート Excel のバッファ（Node.js Buffer） */
  templateBuffer: Buffer;
  agencyName: string;
  /** 代理店種別（設定情報 C7 セルへの VLOOKUP キー） */
  agencyType: string;
  customerName: string;
  deliveryType: string;
  contractType: string;
  cloudBilling?: string;
  formInputs: Record<string, unknown>;
  /** 見積作成日 (YYYY-MM-DD) */
  createdAt: string;
  /** 本製品仕切り率（DB の rate と同じ小数 0〜1。未設定時は C8 を書かない） */
  productMarginRate?: number;
  /** 保守仕切り率 */
  maintenanceMarginRate?: number;
  /** HubSpot 取引ID（C13 セル「Hubspot NO」。未設定なら書き込まない） */
  hubspotNo?: string;
}

/** セルに値をセット（数式セルは result を上書き） */
function setCell(sheet: ExcelJS.Worksheet, cellAddr: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  const cell = sheet.getCell(cellAddr);
  // 数式セルの場合は result のみ更新（数式は保持）
  if (cell.formula) {
    cell.value = { formula: cell.formula, result: typeof value === "number" ? value : String(value) };
  } else {
    cell.value = typeof value === "number" ? value : String(value);
  }
}

/** year_month 値 { year, month } を分解 */
function parseYearMonth(ym: unknown): { year: string; month: string } {
  if (ym && typeof ym === "object") {
    const o = ym as Record<string, unknown>;
    return { year: String(o.year ?? ""), month: String(o.month ?? "") };
  }
  return { year: "", month: "" };
}

/**
 * options フィールドは { hasOptions: boolean, webApi: boolean, ... } 形式で送られてくる。
 * チェックされた（true の）オプションのラベル名を順番に返す。
 */
function getCheckedOptionLabels(options: unknown): string[] {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  const obj = options as Record<string, unknown>;
  const labels: string[] = [];
  for (const [key, val] of Object.entries(OPTION_ITEMS)) {
    if (obj[key] === true) {
      labels.push(val.labelJa);
    }
  }
  return labels;
}

const WEB_API_LABEL_JA = OPTION_ITEMS.webApi.labelJa;

/** 「外部システム連携API：あり」とオプションチェックを整合（C21 等に反映） */
function getOptionLabelsForTemplate(
  formInputs: Record<string, unknown>,
  optionsField: unknown
): string[] {
  const labels = getCheckedOptionLabels(optionsField);
  if (formInputs.externalSystemApi === "yes" && !labels.includes(WEB_API_LABEL_JA)) {
    return [WEB_API_LABEL_JA, ...labels];
  }
  return labels;
}

function firstOptionFromForm(formInputs: Record<string, unknown>): string {
  const labels = getOptionLabelsForTemplate(formInputs, formInputs.options);
  return labels[0] ?? "オプションなし";
}

function secondOptionFromForm(formInputs: Record<string, unknown>): string {
  const labels = getOptionLabelsForTemplate(formInputs, formInputs.options);
  return labels[1] ?? "オプションなし";
}

export async function writeEstimateToTemplate(
  params: WriteEstimateParams
): Promise<Buffer> {
  const { templateBuffer, agencyName, agencyType, customerName, deliveryType, contractType, cloudBilling, formInputs, createdAt, productMarginRate, maintenanceMarginRate, hubspotNo } = params;

  // stream.PassThrough 経由で読み込む（Vercel 環境で xlsx.load(Buffer) が不安定なため）
  const workbook = new ExcelJS.Workbook();
  const pass = new PassThrough();
  const readPromise = workbook.xlsx.read(pass);
  pass.end(templateBuffer);
  await readPromise;

  const sheetNames = workbook.worksheets.map((ws) => ws.name).join(", ");
  console.log(`[excel-writer] シート一覧: ${sheetNames}`);

  // 書き込み対象は「設定情報」シート
  const sheet = workbook.getWorksheet("設定情報");
  if (!sheet) {
    console.error(`[excel-writer] 「設定情報」シートが見つかりません。シート: ${sheetNames}`);
    throw new Error(`「設定情報」シートが見つかりません（テンプレートのシート: ${sheetNames}）`);
  }
  console.log(`[excel-writer] 書き込み先: 設定情報 / deliveryType=${deliveryType} contractType=${contractType}`);

  // ── 全パターン共通 ──────────────────────────────────
  setCell(sheet, "C3", createdAt);
  setCell(sheet, "C4", `To: ${agencyName}`);
  setCell(sheet, "C5", `For: ${customerName}`);
  setCell(sheet, "C7", agencyType);  // VLOOKUP キー（代理店種別）
  if (productMarginRate != null && Number.isFinite(productMarginRate)) {
    setCell(sheet, "C8", productMarginRate);
  }
  if (maintenanceMarginRate != null && Number.isFinite(maintenanceMarginRate)) {
    setCell(sheet, "C9", maintenanceMarginRate);
  }
  if (hubspotNo && String(hubspotNo).trim() !== "") {
    setCell(sheet, "C13", String(hubspotNo).trim());
  }
  console.log(`[excel-writer] 共通: C3=${createdAt} C4=To:${agencyName} C5=For:${customerName} C7=${agencyType} C8=${productMarginRate ?? "-"} C9=${maintenanceMarginRate ?? "-"} C13=${hubspotNo ?? "-"}`);
  console.log(`[excel-writer] formInputs: ${JSON.stringify(formInputs)}`);

  // ── パターン別フィールド ────────────────────────────

  if (deliveryType === "onprem" && contractType === "new") {
    // tpl-1: ライセンス数・オプション①②
    setCell(sheet, "C18", formatLicenseCountForExcel(formInputs.licenseCount));
    const opt1 = firstOptionFromForm(formInputs);
    const opt2 = secondOptionFromForm(formInputs);
    setCell(sheet, "C21", opt1);
    setCell(sheet, "C24", opt2);
    console.log(`[excel-writer] onprem/new: C18=${formInputs.licenseCount} C21=${opt1} C24=${opt2}`);

  } else if (deliveryType === "onprem" && contractType === "license_add") {
    // tpl-2: 既存/追加ライセンス数・保守期間・発注予定
    setCell(sheet, "C18", Number(formInputs.existingLicenseCount) || formInputs.existingLicenseCount);
    setCell(sheet, "C21", Number(formInputs.addedLicenseCount) || formInputs.addedLicenseCount);
    const start = parseYearMonth(formInputs.existingMaintenanceStart);
    const end   = parseYearMonth(formInputs.existingMaintenanceEnd);
    const order = parseYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C26", Number(start.year) || start.year);
    setCell(sheet, "C27", Number(start.month) || start.month);
    // C28/C29 は数式で自動計算されるため書き込まない
    setCell(sheet, "C30", Number(order.year) || order.year);
    setCell(sheet, "C31", Number(order.month) || order.month);
    console.log(`[excel-writer] onprem/license_add: C18=${formInputs.existingLicenseCount} C21=${formInputs.addedLicenseCount}`);

  } else if (deliveryType === "onprem" && contractType === "option_add") {
    // tpl-3: オプション①②③
    const opts = getOptionLabelsForTemplate(formInputs, formInputs.options);
    setCell(sheet, "C18", opts[0] ?? "オプションなし");
    setCell(sheet, "C21", opts[1] ?? "オプションなし");
    setCell(sheet, "C23", opts[2] ?? "オプションなし");
    // ライセンス数（オプション追加の場合）
    const lc = formInputs.optionLicenseCounts as Record<string, number> | undefined;
    if (lc) {
      const vals = Object.values(lc).filter(v => v);
      if (vals[0]) setCell(sheet, "C24", Number(vals[0]));
      if (vals[1]) setCell(sheet, "C28", Number(vals[1]));
    }
    const start = parseYearMonth(formInputs.existingMaintenanceStart);
    const order = parseYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C36", Number(start.year) || start.year);
    setCell(sheet, "C37", Number(start.month) || start.month);
    setCell(sheet, "C40", Number(order.year) || order.year);
    setCell(sheet, "C41", Number(order.month) || order.month);
    console.log(`[excel-writer] onprem/option_add: opts=${JSON.stringify(opts)}`);

  } else if (deliveryType === "subscription" && contractType === "new") {
    // tpl-4: ライセンス数・契約月数・オプション①
    setCell(sheet, "C18", formatLicenseCountForExcel(formInputs.licenseCount));
    setCell(sheet, "C20", Number(formInputs.contractMonths) || formInputs.contractMonths);
    setCell(sheet, "C21", firstOptionFromForm(formInputs));
    console.log(`[excel-writer] subscription/new: C18=${formInputs.licenseCount} C20=${formInputs.contractMonths}`);

  } else if (deliveryType === "cloud" && contractType === "new") {
    // tpl-5(年額) / tpl-6(区切り): ライセンス数・契約月数・オプション①
    setCell(sheet, "C18", formatLicenseCountForExcel(formInputs.licenseCount));
    if (cloudBilling === "period") {
      setCell(sheet, "C20", Number(formInputs.contractMonths) || formInputs.contractMonths);
    }
    setCell(sheet, "C21", firstOptionFromForm(formInputs));
    console.log(`[excel-writer] cloud/new(${cloudBilling}): C18=${formInputs.licenseCount} C20=${formInputs.contractMonths}`);

  } else if (deliveryType === "cloud" && contractType === "license_add") {
    // tpl-7: 既存/追加ライセンス数・保守期間・発注予定
    setCell(sheet, "C18", Number(formInputs.existingLicenseCount) || formInputs.existingLicenseCount);
    setCell(sheet, "C21", Number(formInputs.addedLicenseCount) || formInputs.addedLicenseCount);
    const start = parseYearMonth(formInputs.existingMaintenanceStart);
    const order = parseYearMonth(formInputs.orderPlanned);
    setCell(sheet, "C26", Number(start.year) || start.year);
    setCell(sheet, "C27", Number(start.month) || start.month);
    setCell(sheet, "C30", Number(order.year) || order.year);
    setCell(sheet, "C31", Number(order.month) || order.month);
    console.log(`[excel-writer] cloud/license_add: C18=${formInputs.existingLicenseCount} C21=${formInputs.addedLicenseCount}`);
  }

  const buf = await workbook.xlsx.writeBuffer();
  console.log(`[excel-writer] 書き込み完了`);
  return Buffer.from(buf);
}

/**
 * 既存の Excel ファイルの「設定情報」シート C13 セルだけ HubSpot 取引 ID を書き込み、
 * 上書き用の Buffer を返す。承認時に既存テンプレートを再利用するためのユーティリティ。
 */
export async function updateExcelHubSpotNo(
  existingExcelBuffer: Buffer,
  hubspotNo: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const pass = new PassThrough();
  const readPromise = workbook.xlsx.read(pass);
  pass.end(existingExcelBuffer);
  await readPromise;

  const sheet = workbook.getWorksheet("設定情報");
  if (!sheet) {
    throw new Error("「設定情報」シートが見つかりません（HubSpot NO 書き込み）。");
  }
  setCell(sheet, "C13", String(hubspotNo).trim());

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
