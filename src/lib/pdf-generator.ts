/**
 * Excel → PDF 変換ユーティリティ
 *
 * 印刷対象シート（表紙・ライセンス・保守料）のみを PDF に出力するための戦略を、
 * 変換エンジンの能力に合わせて切り替える:
 *
 * ── Gotenberg 経路（既定・GOTENBERG_URL 設定時）─────────────────
 *   1. 全シートを保持したまま LibreOffice に渡し、数式を「本物のエンジン」で評価させる
 *   2. シート並びを 表紙 → ライセンス → 保守料 → その他 に並び替える
 *   3. Gotenberg の nativePageRanges=1-3 で PDF の先頭 3 ページのみを取り出す
 *   この方式なら、テンプレートが Excel Name Manager の名前付き範囲 / VLOOKUP /
 *   未対応の関数を使っていても結果が正しく評価される。
 *   ・必須: GOTENBERG_URL
 *   ・推奨: GOTENBERG_USERNAME / GOTENBERG_PASSWORD（Basic Auth）
 *   ・任意: GOTENBERG_NATIVE_PAGE_RANGES（既定 "1-3"。テンプレートのページ数を変えたとき上書き）
 *
 * ── CloudConvert 経路（フォールバック・GOTENBERG_URL 未設定時）──
 *   ページ選択 API が無いため、HyperFormula で印刷シートの数式を事前評価し、
 *   非印刷シートをワークブックから物理削除して PDF 化する（複雑な数式は値が空欄になる可能性あり）。
 *   ・必須: CLOUDCONVERT_API_KEY（task.read / task.write）
 *
 * 見積金額の抽出:
 *   PDF 化エンジン（LibreOffice / Office）が描画した結果に依存せず、
 *   ローカルで HyperFormula により Excel を評価し、表紙シートの固定セルから直接読む。
 *     - amount         = 表紙!C21
 *     - maintenanceFee = 表紙!C24
 *   PDF テキスト抽出（pdf-parse）や CloudConvert CSV エクスポートには依存しない。
 */

import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { PassThrough } from "stream";
// pdf-parse は index.js のデバッグ実行コードを避けるため lib 直参照
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/** PDF に含める印刷対象シート名（この3シートのみ残し、他は削除） */
const PRINT_SHEETS = ["表紙", "ライセンス", "保守料"];

/** CloudConvert import/base64 は ~10MB 超で非推奨 */
const CLOUDCONVERT_BASE64_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_SYNC_JOBS_URL = "https://sync.api.cloudconvert.com/v2/jobs";

type CloudConvertTask = {
  name?: string;
  operation?: string;
  status?: string;
  message?: string | null;
  code?: string | null;
  result?: { files?: Array<{ url?: string; filename?: string }> };
};

type CloudConvertJobData = {
  status?: string;
  tasks?: CloudConvertTask[];
};

function parseCloudConvertJob(text: string): CloudConvertJobData | null {
  try {
    const parsed = JSON.parse(text) as { data?: CloudConvertJobData } & CloudConvertJobData;
    if (parsed.data && (parsed.data.status || parsed.data.tasks)) return parsed.data;
    if (parsed.status || parsed.tasks) return parsed;
    return null;
  } catch {
    return null;
  }
}

function formatCloudConvertFailure(resStatus: number, text: string): string {
  const job = parseCloudConvertJob(text);
  if (job?.tasks?.length) {
    const errTasks = job.tasks.filter((t) => t.status === "error");
    if (errTasks.length) {
      return errTasks
        .map((t) => `${t.operation ?? "?"}: ${t.message ?? t.code ?? "error"}`)
        .join(" | ");
    }
  }
  return text.slice(0, 500);
}

/** 401/403 + Invalid scope など、HTTP 層の CloudConvert エラーを人が直せる文面に */
function formatCloudConvertHttpError(status: number, text: string): string {
  if (status === 401 || status === 403) {
    try {
      const j = JSON.parse(text) as { message?: string; code?: string };
      const msg = j.message ?? "";
      if (j.code === "FORBIDDEN" || /scope/i.test(msg)) {
        return (
          "API キーに必要なスコープがありません。CloudConvert ダッシュボード → API → v2 キーで、該当キーの編集を開き " +
            "task.read と task.write にチェックを入れて保存するか、上記2つを付与した新しいキーを発行し、CLOUDCONVERT_API_KEY（Vercel 環境変数）を差し替えて再デプロイしてください。 " +
            `[${j.code ?? "HTTP"}] ${msg}`
        );
      }
    } catch {
      /* 本文が JSON でない */
    }
  }
  return text.slice(0, 800);
}

/**
 * CloudConvert が返すダウンロード URL のホストを検証する。
 * ジョブ応答が改ざんされた場合の SSRF 的悪用を防ぐ防御層。
 */
function isAllowedCloudConvertUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "cloudconvert.com" || host.endsWith(".cloudconvert.com");
  } catch {
    return false;
  }
}

function findFinishedExportUrl(job: CloudConvertJobData, taskName?: string): string | null {
  for (const t of job.tasks ?? []) {
    if (t.operation === "export/url" && t.status === "finished") {
      if (taskName && t.name !== taskName) continue;
      const url = t.result?.files?.[0]?.url;
      if (url && isAllowedCloudConvertUrl(url)) return url;
    }
  }
  return null;
}

export type ConvertResult = {
  pdf: Buffer;
  amounts: { amount: number; maintenanceFee: number } | null;
};

/** 表紙シートの本体金額セル */
const COVER_AMOUNT_CELL = "C21";
/** 表紙シートの保守料セル */
const COVER_MAINTENANCE_CELL = "C24";

/** PDF テキスト抽出のキーワード（同じ行 or 直後の行に数値があるパターンを許容） */
const PDF_AMOUNT_KEYWORDS = ["御見積金額", "見積金額", "お見積金額", "御見積額", "御見積総額"] as const;
const PDF_MAINTENANCE_KEYWORDS = ["年額保守", "保守料", "保守費用", "保守"] as const;
const PDF_TOTAL_KEYWORDS = ["税抜合計", "合計"] as const;

/** PDF テキストから最初に現れる数値（千区切り or 整数）を整数値で返す。無ければ 0 */
function parsePdfLineNumber(line: string): number {
  const m = line.match(/[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?/g);
  if (!m) return 0;
  let best = 0;
  for (const tok of m) {
    const n = Number(tok.replace(/,/g, ""));
    if (Number.isFinite(n) && n > best) best = n;
  }
  return Math.floor(best);
}

/**
 * pdf-parse で抽出した PDF テキストから見積金額・保守料を読む。
 *  - 同一行にキーワード＋数値があれば採用
 *  - 同一行に数値が無ければ直後 3 行を覗いて最初の数値を採用
 *    （LibreOffice→pdf-parse はセルごとに別行に分解しがちなため）
 *
 * 各キーワード群について最初にヒットした値を返す（template はキーワードが 1 行のみのため）。
 */
export function extractAmountsFromPdfText(text: string): { amount: number; maintenanceFee: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  function findFor(
    includeKeywords: ReadonlyArray<string>,
    excludeKeywords: ReadonlyArray<string> = []
  ): number {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!includeKeywords.some((kw) => line.includes(kw))) continue;
      if (excludeKeywords.some((kw) => line.includes(kw))) continue;
      const sameLine = parsePdfLineNumber(line);
      if (sameLine > 0) return sameLine;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = parsePdfLineNumber(lines[j]);
        if (next > 0) return next;
      }
    }
    return 0;
  }

  const amount = findFor(PDF_AMOUNT_KEYWORDS) || findFor(PDF_TOTAL_KEYWORDS);
  // 保守料は「御見積金額」等を含む行を除外（誤拾い防止）
  const maintenanceFee = findFor(PDF_MAINTENANCE_KEYWORDS, PDF_AMOUNT_KEYWORDS);
  return { amount, maintenanceFee };
}

/**
 * 生成済み PDF バッファから金額を抽出する。LibreOffice/Gotenberg が出力した PDF テキストには
 * テンプレ数式が解決済みの値が入っているため、HF 評価が失敗しても拾える。
 * 失敗時は null。
 *
 * デバッグログ:
 *   抽出に失敗（amount=0 or maintenanceFee=0）したときは、原因分析のため
 *   ・PDF テキストの先頭スニペット
 *   ・金額系キーワードと保守系キーワードを含む行（前後 1 行も含む）
 *   をログに出す。
 */
export async function extractAmountsFromPdfBuffer(
  pdfBuffer: Buffer
): Promise<{ amount: number; maintenanceFee: number } | null> {
  try {
    const parsed = await pdfParse(pdfBuffer);
    if (!parsed?.text) return null;
    const result = extractAmountsFromPdfText(parsed.text);
    console.log(
      `[pdf-generator] PDF テキスト抽出: amount=${result.amount} maintenanceFee=${result.maintenanceFee} ` +
        `(textLen=${parsed.text.length})`
    );

    if (result.amount === 0 || result.maintenanceFee === 0) {
      const text = parsed.text;
      console.log(
        `[pdf-generator] PDF text snippet (先頭 600 chars): ${JSON.stringify(text.slice(0, 600))}`
      );
      const lines = text.split(/\r?\n/);
      const probeKeywords = ["金額", "見積", "保守", "合計", "ライセンス", "￥", "¥", "円"];
      const hits: string[] = [];
      lines.forEach((line, idx) => {
        if (probeKeywords.some((kw) => line.includes(kw))) {
          const ctx = [
            idx > 0 ? `[${idx - 1}] ${lines[idx - 1]}` : "",
            `[${idx}] ${line}`,
            idx < lines.length - 1 ? `[${idx + 1}] ${lines[idx + 1]}` : "",
          ]
            .filter(Boolean)
            .join(" / ");
          hits.push(ctx);
        }
      });
      // 重複除去して最初の 25 件まで
      const uniqueHits = [...new Set(hits)].slice(0, 25);
      console.log(
        `[pdf-generator] PDF keyword 行 (${uniqueHits.length} 件): ${JSON.stringify(uniqueHits)}`
      );
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pdf-generator] PDF テキスト抽出失敗:", msg);
    return null;
  }
}

/**
 * ExcelJS のセル値（数値 / 文字列 / formula オブジェクト）を金額の整数値へ正規化する。
 * - 数値はそのまま（負値や NaN は 0 に丸める）
 * - 文字列は通貨記号・カンマ・全角空白等を除去してパース
 * - { formula, result } 形式は result（最新評価値）を採用
 * - 解釈不能なら 0
 */
function coerceCellToAmount(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[¥￥,、\s　]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("result" in v) {
      const r = v.result;
      if (typeof r === "number" && Number.isFinite(r)) return Math.max(0, Math.floor(r));
      if (typeof r === "string") {
        const cleaned = r.replace(/[¥￥,、\s　]/g, "");
        const n = Number(cleaned);
        if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
      }
    }
  }
  return 0;
}

/**
 * ExcelJS のセル値からテンプレ保存時にキャッシュされた評価結果を取り出す。
 * 形式 `{ formula, result }` の result を採用。プレーン値はそのまま返す。
 * HF 評価が失敗した場合のフォールバック用。
 */
function readCachedCellResult(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[¥￥,、\s　]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("result" in v) {
      const r = v.result;
      if (typeof r === "number" && Number.isFinite(r)) return Math.max(0, Math.floor(r));
      if (typeof r === "string") {
        const cleaned = r.replace(/[¥￥,、\s　]/g, "");
        const n = Number(cleaned);
        if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
      }
    }
  }
  return 0;
}

/** デバッグ用に ExcelJS セル値を JSON 互換のサマリへ変換する */
function describeCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value.slice(0, 80));
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    if ("formula" in v) summary.formula = String(v.formula).slice(0, 120);
    if ("sharedFormula" in v) summary.sharedFormula = String(v.sharedFormula).slice(0, 120);
    if ("result" in v) summary.result = v.result;
    if (Object.keys(summary).length > 0) return JSON.stringify(summary);
  }
  return String(value).slice(0, 80);
}

/**
 * 自動入力済み Excel をローカルで HyperFormula 評価し、表紙シートの固定セルから
 * 見積金額（C21）と保守料（C24）を直接読む。
 *
 * 多段フォールバック:
 *   1. HF 評価後の値を採用（最優先・最新の計算結果）
 *   2. HF 評価で 0 や失敗が出たら、Excel 内の cached result を使う
 *      （テンプレが Excel/LibreOffice で保存された時点の評価値）
 *
 * 評価は破壊的なので、必ず新規ロードしたワークブックに対して実行する。
 * 失敗時は null を返し、呼び出し側は DB 更新をスキップする（手動入力で上書き可）。
 */
export async function extractAmountsFromWorkbookBuffer(
  excelBuffer: Buffer
): Promise<{ amount: number; maintenanceFee: number } | null> {
  try {
    const wb = await loadWorkbook(excelBuffer);
    const coverBefore = wb.getWorksheet("表紙");
    if (!coverBefore) {
      console.warn("[pdf-generator] 表紙 シートが見つからず金額抽出をスキップしました");
      return null;
    }

    // 評価前: テンプレが保存しているキャッシュ済み result を採る（フォールバック用）
    const rawAmountCell = coverBefore.getCell(COVER_AMOUNT_CELL).value;
    const rawMaintCell = coverBefore.getCell(COVER_MAINTENANCE_CELL).value;
    const cachedAmount = readCachedCellResult(rawAmountCell);
    const cachedMaint = readCachedCellResult(rawMaintCell);
    console.log(
      `[pdf-generator] 金額セル評価前: 表紙!${COVER_AMOUNT_CELL}=${describeCellValue(rawAmountCell)} ` +
        `表紙!${COVER_MAINTENANCE_CELL}=${describeCellValue(rawMaintCell)} ` +
        `(cached: amount=${cachedAmount} maint=${cachedMaint})`
    );

    let evaluatedAmount = 0;
    let evaluatedMaint = 0;
    let evalError: string | null = null;
    try {
      evaluateAndStripWorkbook(wb);
      const coverAfter = wb.getWorksheet("表紙");
      if (coverAfter) {
        const evalAmountCell = coverAfter.getCell(COVER_AMOUNT_CELL).value;
        const evalMaintCell = coverAfter.getCell(COVER_MAINTENANCE_CELL).value;
        evaluatedAmount = coerceCellToAmount(evalAmountCell);
        evaluatedMaint = coerceCellToAmount(evalMaintCell);
        console.log(
          `[pdf-generator] 金額セル評価後: 表紙!${COVER_AMOUNT_CELL}=${describeCellValue(evalAmountCell)} ` +
            `表紙!${COVER_MAINTENANCE_CELL}=${describeCellValue(evalMaintCell)}`
        );
      }
    } catch (hfErr) {
      evalError = hfErr instanceof Error ? hfErr.message : String(hfErr);
      console.warn("[pdf-generator] HyperFormula 評価失敗、cached フォールバックに切替:", evalError);
    }

    // 評価値が 0 または失敗のときは cached を使う
    const amount = evaluatedAmount > 0 ? evaluatedAmount : cachedAmount;
    const maintenanceFee = evaluatedMaint > 0 ? evaluatedMaint : cachedMaint;
    console.log(
      `[pdf-generator] 金額抽出 確定値: amount=${amount} maintenanceFee=${maintenanceFee} ` +
        `(eval=${evaluatedAmount}/${evaluatedMaint}, cached=${cachedAmount}/${cachedMaint}` +
        (evalError ? `, evalError=${evalError}` : "") +
        ")"
    );
    return { amount, maintenanceFee };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pdf-generator] Excel 評価による金額抽出失敗:", msg);
    return null;
  }
}

/**
 * stream.PassThrough 経由で ExcelJS にバッファを読み込む
 * Vercel 環境では xlsx.load(Buffer) が信頼できないため、
 * ストリームとして渡すことで確実に全シートを読み込む。
 */
async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const pass = new PassThrough();
  const readPromise = workbook.xlsx.read(pass);
  pass.end(buf);
  await readPromise;
  return workbook;
}

/**
 * 数式中の未引用シート名参照（例: `設定情報!C5`）を `'設定情報'!C5` に正規化する。
 * HyperFormula のパーサは日本語などの非 ASCII シート名を引用なしで受けると
 * `#ERROR!` を返すことがあるため。既に引用済みの参照は触らない。
 */
function quoteSheetNamesInFormula(formula: string, sheetNames: ReadonlyArray<string>): string {
  let result = formula;
  // 長い名前から処理（"設定" が "設定情報" の前にマッチするのを避ける）
  const sorted = [...sheetNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 直前が `'` ではない（= 未引用の）シート名のみ置換
    const re = new RegExp(`(?<!['A-Za-z0-9_])${escaped}!`, "g");
    result = result.replace(re, `'${name}'!`);
  }
  return result;
}

/**
 * 任意の ExcelJS セル値を HyperFormula に渡せるスカラへ正規化する。
 *
 * preferCachedResult=true（非印刷シート用）:
 *   数式セルでも result が存在すれば result を返す。
 *   excel-writer.ts は 設定情報 の数式セルに正しい result を書き込み済みのため、
 *   VLOOKUP 等の複雑な数式を HyperFormula で再評価せず済む。
 *   再評価しようとすると参照テーブルシートが存在しないため #NAME?/#VALUE! が
 *   全印刷シートに連鎖してしまう。
 *
 * preferCachedResult=false（印刷シート用）:
 *   数式文字列をそのまま HyperFormula に渡して評価させる（設定情報参照を解決するため）。
 */
function excelCellToHfValue(
  value: ExcelJS.CellValue,
  sheetNames: ReadonlyArray<string>,
  preferCachedResult = false
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    // 非印刷シートはキャッシュ済み result を優先して数式の再評価を回避する
    if (preferCachedResult && "result" in v) {
      const r = v.result;
      if (typeof r === "number" || typeof r === "string" || typeof r === "boolean") return r;
      if (r instanceof Date) return r.toISOString();
    }
    if (typeof v.formula === "string") return "=" + quoteSheetNamesInFormula(v.formula, sheetNames);
    if (typeof v.sharedFormula === "string")
      return "=" + quoteSheetNamesInFormula(v.sharedFormula, sheetNames);
    if ("result" in v) {
      const r = v.result;
      if (typeof r === "number" || typeof r === "string" || typeof r === "boolean") return r;
    }
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((rt) => (rt as { text?: unknown }).text ?? "").join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
  }
  return String(value);
}

/**
 * HyperFormula の評価結果を ExcelJS のセル値に変換する。
 * エラー（#REF!, #N/A など）は文字列化して可視化する。
 */
function hfValueToExcelCellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // HyperFormula の DetailedCellError
    if (typeof v.type === "string" && typeof v.value === "string") {
      return v.value;
    }
  }
  return String(value);
}

/**
 * 印刷対象シート（表紙・ライセンス・保守料）の数式セルを HyperFormula で評価し、
 * 評価結果を直接書き込む（数式は除去）。これにより設定情報シートへの参照が解消される。
 * その後、印刷対象外シートをワークブックから物理削除する。
 *
 * LibreOffice（Gotenberg）は xlsx の veryHidden シートをスキップしないケースがあるため、
 * 不要シートを削除することで確実に 3 シートのみ PDF 化させる。
 */
export function evaluateAndStripWorkbook(workbook: ExcelJS.Workbook): void {
  // 1. 全シートのデータを HyperFormula 用に抽出
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  const sheetsData: Record<string, (string | number | boolean | null)[][]> = {};
  for (const ws of workbook.worksheets) {
    const isPrintSheet = PRINT_SHEETS.includes(ws.name);
    const rows: (string | number | boolean | null)[][] = [];
    const rowCount = ws.actualRowCount > 0 ? ws.rowCount : 0;
    const colCount = ws.actualColumnCount > 0 ? ws.columnCount : 0;
    for (let r = 1; r <= rowCount; r++) {
      const row: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= colCount; c++) {
        const cell = ws.getCell(r, c);
        // 非印刷シート（設定情報等）は result を優先することで、
        // VLOOKUP など HyperFormula が解釈できない数式を再評価しない。
        row.push(excelCellToHfValue(cell.value, sheetNames, !isPrintSheet));
      }
      rows.push(row);
    }
    sheetsData[ws.name] = rows;
  }

  // 2. HyperFormula を構築。gpl-v3 ライセンスは OSS 利用で無償。
  const hf = HyperFormula.buildFromSheets(sheetsData, {
    licenseKey: "gpl-v3",
    smartRounding: true,
  });

  // ワークブックに定義された名前付き範囲を HyperFormula に登録する（ベストエフォート）。
  // Excel の Name Manager で定義された名前（例: 仕切り率テーブル）を数式内で使う
  // テンプレートがある場合、未登録だと #NAME? エラーになるため。
  try {
    type WbModel = { definedNames?: Array<{ name: string; formula?: string }> };
    const wbModel = (workbook as unknown as { model?: WbModel }).model;
    if (Array.isArray(wbModel?.definedNames)) {
      for (const dn of wbModel.definedNames) {
        if (!dn.name || !dn.formula) continue;
        try {
          const expr = "=" + quoteSheetNamesInFormula(dn.formula.replace(/^=/, ""), sheetNames);
          hf.addNamedExpression(dn.name, expr);
        } catch {
          /* 個別の名前付き範囲登録失敗は無視 */
        }
      }
    }
  } catch {
    /* 名前付き範囲取得失敗は無視 */
  }

  // 3. 印刷対象シート内の数式セルを評価結果で置き換える
  for (const ws of workbook.worksheets) {
    if (!PRINT_SHEETS.includes(ws.name)) continue;
    const sheetId = hf.getSheetId(ws.name);
    if (sheetId === undefined) continue;

    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const hasFormula =
          v !== null &&
          typeof v === "object" &&
          ("formula" in (v as object) || "sharedFormula" in (v as object));
        if (!hasFormula) return;

        const computed = hf.getCellValue({
          sheet: sheetId,
          row: cell.fullAddress.row - 1,
          col: cell.fullAddress.col - 1,
        });

        // HyperFormula がエラーオブジェクトを返した場合は
        // エラー文字列（#NAME? 等）をセルに書き込まない。
        // キャッシュ済み result があればそれを使い、なければ null（空セル）にする。
        const computedAsUnknown = computed as unknown;
        const isHfError =
          computedAsUnknown !== null &&
          typeof computedAsUnknown === "object" &&
          typeof (computedAsUnknown as Record<string, unknown>).type === "string";

        if (isHfError) {
          const vo = v as unknown as Record<string, unknown>;
          const cached = "result" in vo ? vo.result : undefined;
          if (
            typeof cached === "number" ||
            typeof cached === "string" ||
            typeof cached === "boolean"
          ) {
            cell.value = cached;
            console.warn(
              `[pdf-generator] 数式評価エラー→キャッシュ値使用: ${ws.name}!${cell.address} ` +
                `(${(computedAsUnknown as Record<string, unknown>).type})`
            );
          } else {
            cell.value = null;
            console.warn(
              `[pdf-generator] 数式評価エラー・キャッシュ値なし→空: ${ws.name}!${cell.address} ` +
                `(${(computedAsUnknown as Record<string, unknown>).type})`
            );
          }
        } else {
          cell.value = hfValueToExcelCellValue(computed);
        }
      });
    });
  }

  hf.destroy();

  // 4. 印刷対象外シートを物理削除
  const toRemove = workbook.worksheets
    .filter((ws) => !PRINT_SHEETS.includes(ws.name))
    .map((ws) => ({ name: ws.name, id: ws.id }));
  for (const { id } of toRemove) {
    workbook.removeWorksheet(id);
  }
  if (toRemove.length > 0) {
    console.log(
      `[pdf-generator] 印刷対象外シートを削除: ${toRemove.map((s) => s.name).join(", ")}`
    );
  }
}

/**
 * 非印刷シート（設定情報・単価マスタ等）の数式セルを評価結果に固定する。
 *
 * 目的:
 *   excel-writer.ts は 設定情報 の数式セル（VLOOKUP 等）に対し formula を保持したまま
 *   result だけ正しい値で更新する。しかし LibreOffice は xlsx を開くと cached result を
 *   無視して formula を再評価するため、参照テーブルや名前付き範囲が解決できないと
 *   excel-writer.ts が書き込んだ値が消えてしまう。
 *
 *   このため Gotenberg に渡す前に、非印刷シートの数式セルを HyperFormula で評価して
 *   プレーン値に置換する。HyperFormula も解釈できない場合は cached result にフォールバック。
 *
 * 印刷シート（表紙・ライセンス・保守料）の数式は触らない:
 *   LibreOffice が固定済みの非印刷シート値を使って正確に評価する。
 */
export function freezeNonPrintSheetFormulas(workbook: ExcelJS.Workbook): void {
  const sheetNames = workbook.worksheets.map((ws) => ws.name);

  // 1. HyperFormula 用にデータを抽出（全シート、formula を渡す）
  const sheetsData: Record<string, (string | number | boolean | null)[][]> = {};
  for (const ws of workbook.worksheets) {
    const rows: (string | number | boolean | null)[][] = [];
    const rowCount = ws.actualRowCount > 0 ? ws.rowCount : 0;
    const colCount = ws.actualColumnCount > 0 ? ws.columnCount : 0;
    for (let r = 1; r <= rowCount; r++) {
      const row: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= colCount; c++) {
        const cell = ws.getCell(r, c);
        row.push(excelCellToHfValue(cell.value, sheetNames, false));
      }
      rows.push(row);
    }
    sheetsData[ws.name] = rows;
  }

  const hf = HyperFormula.buildFromSheets(sheetsData, {
    licenseKey: "gpl-v3",
    smartRounding: true,
  });

  // 名前付き範囲をベストエフォートで登録（model.definedNames の形は ranges[] 配列）
  try {
    type DefinedNameModel = { name: string; ranges?: string[] };
    type WbModel = { definedNames?: DefinedNameModel[] };
    const wbModel = (workbook as unknown as { model?: WbModel }).model;
    if (Array.isArray(wbModel?.definedNames)) {
      for (const dn of wbModel.definedNames) {
        if (!dn.name || !Array.isArray(dn.ranges) || dn.ranges.length === 0) continue;
        try {
          const expr =
            "=" + quoteSheetNamesInFormula(dn.ranges[0].replace(/^=/, ""), sheetNames);
          hf.addNamedExpression(dn.name, expr);
        } catch {
          /* 個別の登録失敗は無視 */
        }
      }
    }
  } catch {
    /* 取得失敗は無視 */
  }

  // 2. 非印刷シートの数式セルを評価結果に置換
  let frozen = 0;
  let fallbackCached = 0;
  let fallbackNull = 0;
  for (const ws of workbook.worksheets) {
    if (PRINT_SHEETS.includes(ws.name)) continue;
    const sheetId = hf.getSheetId(ws.name);
    if (sheetId === undefined) continue;

    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const hasFormula =
          v !== null &&
          typeof v === "object" &&
          ("formula" in (v as object) || "sharedFormula" in (v as object));
        if (!hasFormula) return;

        const computed = hf.getCellValue({
          sheet: sheetId,
          row: cell.fullAddress.row - 1,
          col: cell.fullAddress.col - 1,
        });

        const computedAsUnknown = computed as unknown;
        const isHfError =
          computedAsUnknown !== null &&
          typeof computedAsUnknown === "object" &&
          typeof (computedAsUnknown as Record<string, unknown>).type === "string";

        if (isHfError) {
          // HF 失敗時は excel-writer.ts が書き込んだ cached result を採用
          const vo = v as unknown as Record<string, unknown>;
          const cached = "result" in vo ? vo.result : undefined;
          if (
            typeof cached === "number" ||
            typeof cached === "string" ||
            typeof cached === "boolean"
          ) {
            cell.value = cached;
            fallbackCached++;
          } else if (cached instanceof Date) {
            cell.value = cached;
            fallbackCached++;
          } else {
            cell.value = null;
            fallbackNull++;
          }
        } else {
          cell.value = hfValueToExcelCellValue(computed);
          frozen++;
        }
      });
    });
  }

  hf.destroy();
  console.log(
    `[pdf-generator] 非印刷シート数式の固定: HF評価=${frozen}, キャッシュ採用=${fallbackCached}, 空セル=${fallbackNull}`
  );
}

/**
 * 全シートの数式セルから cached result（`<v>` 要素）を物理除去する。
 *
 * 背景:
 *   Gotenberg にホストされた LibreOffice は xlsx を開く際、formula セルに
 *   cached value が残っていればそれを優先し、数式を再計算しないことがある
 *   （`fullCalcOnLoad=1` を立てても headless 変換のパスでは再計算されないケースが
 *    実環境で確認された）。テンプレ作成時に保存された古い cached value（前回顧客の
 *    データや空白・0）がそのまま PDF に焼き付いてしまう。
 *
 * 対策:
 *   formula セルから `result` プロパティを削除し、ExcelJS が出力する xlsx の
 *   `<c><f>...</f></c>` から `<v>...</v>` が消えるようにする。cached value が
 *   無い formula セルは xlsx 仕様上 "dirty" 扱いになり、どの spreadsheet engine も
 *   開封時に計算しなければならない（計算不能な場合は #ERROR で可視化）。
 *
 *   印刷対象シートだけでなく 設定情報 も対象にする。なぜなら 設定情報!C15 のような
 *   中間 formula セルの cached value も古いままで、印刷シートがそれを参照すると
 *   結果が古くなるため。単価マスタ等のテンプレ固定データは formula を持たないので
 *   影響なし。
 */
function stripFormulaCachedResults(workbook: ExcelJS.Workbook): void {
  let stripped = 0;
  for (const ws of workbook.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        // 数値型 formula セル（t 属性なし）は cell.value から result が見えないが
        // cell.model.result には残り、保存時に <v> として再出力される。確実に消すため
        // model から直接 delete する。
        const model = cell.model as { formula?: string; sharedFormula?: string; result?: unknown };
        if ((model.formula || model.sharedFormula) && "result" in model) {
          delete model.result;
          stripped++;
        }
      });
    });
  }
  console.log(`[pdf-generator] formula セルの cached result を除去: ${stripped} 件`);
}

/**
 * 全シート共通の前処理: 編集ロック解除 + 印刷対象シートを visible に。
 */
function unlockAndShowPrintSheets(workbook: ExcelJS.Workbook): void {
  for (const ws of workbook.worksheets) {
    const sheet = ws as ExcelJS.Worksheet & { sheetProtection?: unknown; unprotect?: () => void };
    if (sheet.sheetProtection) {
      if (typeof sheet.unprotect === "function") sheet.unprotect();
      else sheet.sheetProtection = null;
    }
    if (PRINT_SHEETS.includes(ws.name)) {
      ws.state = "visible";
    }
  }
}

/**
 * 印刷対象シートを先頭に並び替える（PRINT_SHEETS の順序を保持）。
 * Gotenberg 経路で nativePageRanges=1-3 が確実に印刷対象シートを指すようにするため。
 */
export function reorderPrintSheetsFirst(workbook: ExcelJS.Workbook): void {
  // ExcelJS の orderNo は型定義に含まれないが、ランタイムには存在し
  // ワークブック保存時のシート順序を決定する
  const setOrder = (ws: ExcelJS.Worksheet, order: number): void => {
    (ws as unknown as { orderNo: number }).orderNo = order;
  };

  let order = 1;
  // 1. 印刷対象シートを PRINT_SHEETS 定義順に並べる
  for (const name of PRINT_SHEETS) {
    const ws = workbook.getWorksheet(name);
    if (ws) {
      setOrder(ws, order);
      order++;
    }
  }
  // 2. それ以外のシートを後ろに（既存順序のまま）並べる
  for (const ws of workbook.worksheets) {
    if (!PRINT_SHEETS.includes(ws.name)) {
      setOrder(ws, order);
      order++;
    }
  }
}

/**
 * Gotenberg 経路用の前処理:
 *   全シートを保持したまま、印刷対象シートを先頭に並び替える。
 *   数式評価は LibreOffice に任せる（HyperFormula で対応できない名前付き範囲も正しく評価される）。
 *   PDF 化後に Gotenberg の nativePageRanges で先頭 N ページのみ取り出す。
 */
export async function prepareExcelForGotenberg(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(excelBuffer);

  const beforeNames = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 読み込みシート: ${beforeNames.join(", ")}`);

  unlockAndShowPrintSheets(workbook);
  reorderPrintSheetsFirst(workbook);
  // 設定情報の数式上書きは excel-writer.ts 側で行う（setCell が数式を除去してプレーン値を書く）。
  // それ以外の数式（C28=C26+5 等、ユーザが触らないテンプレ計算）は LibreOffice にそのまま評価させる。

  // LibreOffice (Gotenberg) はテンプレ作成時に保存された cached value を優先して
  // 数式を再計算しないケースがある。fullCalcOnLoad=1 を立てるだけでは headless 経路で
  // 不十分なため、formula セルの cached result を物理除去して xlsx を "dirty" 状態にし、
  // LibreOffice が必ず再計算するようにする。
  workbook.calcProperties.fullCalcOnLoad = true;
  stripFormulaCachedResults(workbook);

  const afterNames = workbook.worksheets.map((ws) => `"${ws.name}"`);
  console.log(`[pdf-generator] 並び替え後（Gotenberg 用・全シート保持・キャッシュ除去済み）: ${afterNames.join(", ")}`);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * CloudConvert 経路用の前処理:
 *   CloudConvert は PDF ページ範囲指定 API を持たないため、印刷シートの数式を
 *   HyperFormula で事前評価して値に確定し、非印刷シートを物理削除する。
 *   ※テンプレートが Name Manager の名前付き範囲を多用していると一部値が空欄になる可能性あり。
 */
async function prepareExcelForCloudConvert(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(excelBuffer);

  const beforeNames = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 読み込みシート: ${beforeNames.join(", ")}`);

  unlockAndShowPrintSheets(workbook);
  evaluateAndStripWorkbook(workbook);

  const afterNames = workbook.worksheets.map((ws) => `"${ws.name}"`);
  console.log(`[pdf-generator] 変換後（CloudConvert 用・3 シートのみ）: ${afterNames.join(", ")}`);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function convertBufferWithCloudConvert(pdfReadyBuffer: Buffer): Promise<ConvertResult> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "PDF 生成には CLOUDCONVERT_API_KEY が必要です。" +
        "CloudConvert ダッシュボードで API キーを作成し（task.read / task.write）、" +
        "Vercel の Environment Variables に設定してください。"
    );
  }

  if (pdfReadyBuffer.length > CLOUDCONVERT_BASE64_IMPORT_MAX_BYTES) {
    throw new Error(
      `Excel が ${CLOUDCONVERT_BASE64_IMPORT_MAX_BYTES} バイトを超えています。` +
        "CloudConvert の import/base64 は大きなファイル向けではないため、ファイルを分割するか縮小してください。"
    );
  }

  const syncUrl = (process.env.CLOUDCONVERT_SYNC_URL?.trim() || DEFAULT_SYNC_JOBS_URL).replace(/\/$/, "");
  const engine = process.env.CLOUDCONVERT_EXCEL_ENGINE?.trim().toLowerCase();
  /** office（既定）または libreoffice。空・auto なら engine 指定なし */
  const useEngine =
    engine === "" || engine === "auto" ? null : engine === "libreoffice" ? "libreoffice" : "office";

  const base64 = pdfReadyBuffer.toString("base64");

  const convertTask: Record<string, unknown> = {
    operation: "convert",
    input: "import_xlsx",
    input_format: "xlsx",
    output_format: "pdf",
  };
  if (useEngine) convertTask.engine = useEngine;

  const body = {
    tasks: {
      import_xlsx: {
        operation: "import/base64",
        file: base64,
        filename: "estimate.xlsx",
      },
      convert_pdf: convertTask,
      export_pdf: {
        operation: "export/url",
        input: "convert_pdf",
      },
    },
    tag: "estimate-webapp-excel-pdf",
  };

  const res = await fetch(syncUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    const detail = formatCloudConvertHttpError(res.status, text);
    throw new Error(`CloudConvert API ${res.status}: ${detail}`);
  }

  const job = parseCloudConvertJob(text);
  if (!job) {
    throw new Error(`CloudConvert: 想定外の応答です: ${text.slice(0, 400)}`);
  }

  if (job.status === "error") {
    const detail = formatCloudConvertFailure(res.status, text);
    throw new Error(`CloudConvert ジョブエラー: ${detail}`);
  }

  if (job.status !== "finished") {
    throw new Error(`CloudConvert: ジョブが完了しませんでした (status=${job.status ?? "?"})`);
  }

  const pdfUrl = findFinishedExportUrl(job, "export_pdf");
  if (!pdfUrl) {
    throw new Error("CloudConvert: export_pdf にダウンロード URL がありません");
  }

  const dlRes = await fetch(pdfUrl);
  if (!dlRes.ok) {
    throw new Error(`CloudConvert PDF ダウンロード失敗: HTTP ${dlRes.status}`);
  }
  const pdf = Buffer.from(await dlRes.arrayBuffer());
  return { pdf, amounts: null };
}

/**
 * Gotenberg（Render などにホスト）で xlsx → pdf 変換する。
 * 見積金額抽出は extractAmountsFromWorkbookBuffer が担当するため、ここでは行わない。
 */
async function convertBufferWithGotenberg(pdfReadyBuffer: Buffer): Promise<ConvertResult> {
  const baseUrl = process.env.GOTENBERG_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("GOTENBERG_URL is not set");
  }

  const username = process.env.GOTENBERG_USERNAME?.trim() ?? "";
  const password = process.env.GOTENBERG_PASSWORD?.trim() ?? "";

  // multipart/form-data: フィールド名は Gotenberg 仕様で `files`
  const form = new FormData();
  const blob = new Blob([new Uint8Array(pdfReadyBuffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  form.append("files", blob, "estimate.xlsx");

  // 全シートを保持して LibreOffice に渡しているため、先頭の N ページ
  //（= 印刷対象シートの枚数。既定 3）のみを PDF に残す。
  // テンプレートが 1 シート = 1 ページ前提（PDF サンプルでも 3 ページに収まっている）。
  // 印刷シートが複数ページに渡るテンプレートを使う場合は env で上書き可能。
  const pageRanges =
    process.env.GOTENBERG_NATIVE_PAGE_RANGES?.trim() || `1-${PRINT_SHEETS.length}`;
  form.append("nativePageRanges", pageRanges);
  console.log(`[pdf-generator] Gotenberg nativePageRanges=${pageRanges}`);

  const headers: Record<string, string> = {};
  if (username && password) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  const res = await fetch(`${baseUrl}/forms/libreoffice/convert`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Gotenberg 認証エラー HTTP ${res.status}: GOTENBERG_USERNAME / GOTENBERG_PASSWORD と Render 側の ` +
          `GOTENBERG_API_BASIC_AUTH_USERNAME / GOTENBERG_API_BASIC_AUTH_PASSWORD が一致しているか確認してください。 ` +
          `応答: ${text.slice(0, 300)}`
      );
    }
    throw new Error(`Gotenberg HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const pdf = Buffer.from(await res.arrayBuffer());
  return { pdf, amounts: null };
}

/**
 * Excel 経由（HF 評価）と PDF 経由（pdf-parse）の抽出結果を合成する。
 * 各値について、片方が 0 ならもう片方を採用、両方とも > 0 なら Excel 側（最も信頼できる）を優先。
 */
function mergeAmountSources(
  fromExcel: { amount: number; maintenanceFee: number } | null,
  fromPdf: { amount: number; maintenanceFee: number } | null
): { amount: number; maintenanceFee: number } | null {
  if (!fromExcel && !fromPdf) return null;
  const ex = fromExcel ?? { amount: 0, maintenanceFee: 0 };
  const pd = fromPdf ?? { amount: 0, maintenanceFee: 0 };
  return {
    amount: ex.amount > 0 ? ex.amount : pd.amount,
    maintenanceFee: ex.maintenanceFee > 0 ? ex.maintenanceFee : pd.maintenanceFee,
  };
}

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<ConvertResult> {
  // 第一段: Excel を HF 評価して 表紙!C21/C24 を読む（template の数式が HF サポート関数のみで
  // 完結する場合は最速で正確）。
  const fromExcel = await extractAmountsFromWorkbookBuffer(excelBuffer);

  // 既定は Gotenberg。未設定なら従来の CloudConvert にフォールバック。
  // 経路によって xlsx 前処理が異なる（Gotenberg: 全シート保持・並び替え / CloudConvert: 数式評価＋削除）。
  const gotenbergUrl = process.env.GOTENBERG_URL?.trim();
  let pdf: Buffer;
  if (gotenbergUrl) {
    const ready = await prepareExcelForGotenberg(excelBuffer);
    pdf = (await convertBufferWithGotenberg(ready)).pdf;
  } else {
    const ready = await prepareExcelForCloudConvert(excelBuffer);
    pdf = (await convertBufferWithCloudConvert(ready)).pdf;
  }

  // 第二段: Excel 抽出で 0 が残った場合は生成済み PDF テキストから読み取って補完する。
  // LibreOffice/Office は HF 未サポートの関数（UDF・特殊定義名等）も評価できるため、
  // PDF には正しい値が描画されているケースがある。
  const needsPdfFallback = !fromExcel || fromExcel.amount === 0 || fromExcel.maintenanceFee === 0;
  const fromPdf = needsPdfFallback ? await extractAmountsFromPdfBuffer(pdf) : null;

  const amounts = mergeAmountSources(fromExcel, fromPdf);
  console.log(
    `[pdf-generator] 金額確定: amount=${amounts?.amount ?? 0} maintenanceFee=${amounts?.maintenanceFee ?? 0} ` +
      `(excel=${fromExcel?.amount ?? "null"}/${fromExcel?.maintenanceFee ?? "null"}, ` +
      `pdf=${fromPdf?.amount ?? "n/a"}/${fromPdf?.maintenanceFee ?? "n/a"})`
  );
  return { pdf, amounts };
}
