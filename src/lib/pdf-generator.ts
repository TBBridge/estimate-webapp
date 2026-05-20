/**
 * Excel → PDF 変換ユーティリティ
 *
 * 流れ:
 * 1. 自動入力済み Excel をコピーして PDF 用の一時ワークブックとする
 * 2. 一時ワークブックを開き、編集ロックがあれば解除する
 * 3. 「表紙」「ライセンス」「保守料」を visible、その他（設定情報など）を veryHidden に設定
 *    ※ 設定情報シートは数式参照元のため削除不可。非表示にすることで変換エンジンの対象から除外する
 * 4. 表紙・ライセンス・保守料の3シートのみが PDF 化される
 *
 * 変換エンジン:
 *   1. 既定: Render 上の Gotenberg（LibreOffice）— GOTENBERG_URL が設定されているとき使う。
 *      日次フリー枠が無い OSS 構成のため見積件数に比例した課金は発生しない。
 *      ・必須: GOTENBERG_URL
 *      ・推奨: GOTENBERG_USERNAME / GOTENBERG_PASSWORD（Basic Auth）
 *   2. フォールバック: CloudConvert API v2 — 上記が未設定のときのみ動作する。
 *      ・必須: CLOUDCONVERT_API_KEY（task.read / task.write）
 *
 * 見積金額の抽出:
 *   Excel テンプレート内の数式は ExcelJS だけでは評価できないため、
 *   PDF 化エンジンが評価した結果から金額を読み戻す:
 *     - Gotenberg 経路: 生成された PDF のテキストを抽出してキーワード一致で抽出
 *     - CloudConvert 経路: 並行生成した CSV から抽出
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

function findAllFinishedExportUrls(job: CloudConvertJobData, taskName: string): string[] {
  for (const t of job.tasks ?? []) {
    if (t.name === taskName && t.operation === "export/url" && t.status === "finished") {
      return (t.result?.files ?? [])
        .map((f) => f.url)
        .filter((u): u is string => !!u && isAllowedCloudConvertUrl(u));
    }
  }
  return [];
}

export type ConvertResult = {
  pdf: Buffer;
  amounts: { amount: number; maintenanceFee: number } | null;
};

const AMOUNT_KEYWORDS = ["御見積金額", "見積金額", "お見積金額"] as const;
const MAINTENANCE_KEYWORDS = ["保守", "年額保守", "保守料"] as const;
const TOTAL_KEYWORDS = ["合計", "税抜合計"] as const;

/**
 * テキスト行群（CSV / PDF）からキーワード一致で見積金額を抽出する共通ロジック。
 * 数値の抽出方法だけ呼び出し側に委ねる。
 */
function extractAmountsFromLines(
  lines: ReadonlyArray<string>,
  extractNums: (line: string) => number[]
): { amount: number; maintenanceFee: number } {
  let amount = 0;
  let maintenanceFee = 0;

  for (const line of lines) {
    const nums = extractNums(line);
    if (nums.length === 0) continue;
    const maxNum = Math.max(...nums);

    if (AMOUNT_KEYWORDS.some((kw) => line.includes(kw))) {
      amount = Math.max(amount, maxNum);
    } else if (
      MAINTENANCE_KEYWORDS.some((kw) => line.includes(kw)) &&
      !AMOUNT_KEYWORDS.some((kw) => line.includes(kw))
    ) {
      maintenanceFee = Math.max(maintenanceFee, maxNum);
    } else if (amount === 0 && TOTAL_KEYWORDS.some((kw) => line.includes(kw))) {
      amount = Math.max(amount, maxNum);
    }
  }

  return { amount: Math.floor(amount), maintenanceFee: Math.floor(maintenanceFee) };
}

/**
 * CloudConvert が出力した表紙 CSV から見積金額を抽出する。
 * 「御見積金額」「見積金額」「合計」等のキーワード行にある最大の数値を取る。
 */
export function extractAmountsFromCsv(csv: string): { amount: number; maintenanceFee: number } {
  return extractAmountsFromLines(csv.split(/\r?\n/), (line) => {
    const nums: number[] = [];
    for (const cell of line.split(",")) {
      const cleaned = cell.replace(/[""¥￥,、\s]/g, "");
      const n = Number(cleaned);
      if (Number.isFinite(n) && n > 0) nums.push(n);
    }
    return nums;
  });
}

/**
 * Gotenberg が出力した PDF を pdf-parse で抽出したテキストから見積金額を抽出する。
 * PDF テキストには CSV のような明確なセル境界が無いので、数値トークンを正規表現で拾う。
 */
export function extractAmountsFromPdfText(text: string): { amount: number; maintenanceFee: number } {
  return extractAmountsFromLines(text.split(/\r?\n/), (line) => {
    const nums: number[] = [];
    // `1,234,567` / `1234567` / `1234567.89` を許容（カンマ区切りの整数 / 小数）
    const matches = line.match(/[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?/g) ?? [];
    for (const m of matches) {
      const cleaned = m.replace(/,/g, "");
      const n = Number(cleaned);
      if (Number.isFinite(n) && n > 0) nums.push(n);
    }
    return nums;
  });
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
 * 自動入力済み Excel をコピーし、PDF 用に以下を行う:
 * - ワークブック・シートの編集ロックを解除
 * - 印刷対象シート（表紙・ライセンス・保守料）内の数式を HyperFormula で評価して値に確定
 * - 設定情報など印刷対象外シートをワークブックから削除
 * 返すバッファは Gotenberg / CloudConvert で PDF 化する用。
 */
async function prepareExcelForPdf(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(excelBuffer);

  const sheetNames = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 読み込みシート: ${sheetNames.join(", ")}`);

  // 編集ロック解除と可視化（削除前に必須）
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

  // 数式評価 + 印刷対象外シート削除
  evaluateAndStripWorkbook(workbook);

  const afterStates = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 変換後シート: ${afterStates.join(", ")}`);

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

  const convertCsvTask: Record<string, unknown> = {
    operation: "convert",
    input: "import_xlsx",
    input_format: "xlsx",
    output_format: "csv",
  };
  if (useEngine) convertCsvTask.engine = useEngine;

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
      convert_csv: convertCsvTask,
      export_csv: {
        operation: "export/url",
        input: "convert_csv",
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

  let amounts: ConvertResult["amounts"] = null;
  try {
    const csvUrls = findAllFinishedExportUrls(job, "export_csv");
    if (csvUrls.length > 0) {
      const parts: string[] = [];
      for (const url of csvUrls) {
        const csvRes = await fetch(url);
        if (csvRes.ok) parts.push(await csvRes.text());
      }
      if (parts.length > 0) {
        amounts = extractAmountsFromCsv(parts.join("\n"));
      }
    }
  } catch (csvErr) {
    console.error("[pdf-generator] CSV 金額抽出失敗（PDF 生成は継続）:", csvErr);
  }

  return { pdf, amounts };
}

/**
 * Gotenberg（Render などにホスト）で xlsx → pdf 変換し、生成 PDF からテキストを抽出して
 * 見積金額を読み戻す。Gotenberg のレスポンスは PDF バイナリのみ。
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

  let amounts: ConvertResult["amounts"] = null;
  try {
    const parsed = await pdfParse(pdf);
    if (parsed?.text) {
      amounts = extractAmountsFromPdfText(parsed.text);
    }
  } catch (parseErr) {
    console.error("[pdf-generator] PDF テキスト抽出失敗（PDF 生成は継続）:", parseErr);
  }

  return { pdf, amounts };
}

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<ConvertResult> {
  const pdfReadyBuffer = await prepareExcelForPdf(excelBuffer);

  // 既定は Gotenberg。未設定なら従来の CloudConvert にフォールバック。
  const gotenbergUrl = process.env.GOTENBERG_URL?.trim();
  if (gotenbergUrl) {
    return convertBufferWithGotenberg(pdfReadyBuffer);
  }
  return convertBufferWithCloudConvert(pdfReadyBuffer);
}
