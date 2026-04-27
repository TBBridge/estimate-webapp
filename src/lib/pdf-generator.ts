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
 * 変換: CloudConvert API v2（同期 Jobs: import/base64 → convert → export/url）
 * 必須環境変数: CLOUDCONVERT_API_KEY（ダッシュボードで task.read / task.write を付与）
 */

import ExcelJS from "exceljs";
import { PassThrough } from "stream";

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

function findFinishedExportUrl(job: CloudConvertJobData): string | null {
  for (const t of job.tasks ?? []) {
    if (t.operation === "export/url" && t.status === "finished") {
      const url = t.result?.files?.[0]?.url;
      if (url) return url;
    }
  }
  return null;
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
 * 自動入力済み Excel をコピーし、PDF 用に以下を行う:
 * - ワークブック・シートの編集ロックを解除
 * - 印刷対象シート（表紙・ライセンス・保守料）を visible に設定
 * - 印刷対象外シート（設定情報など）を veryHidden に設定
 *   ※ 設定情報シートは数式参照元のため削除不可。非表示にすることで
 *     CloudConvert の変換対象から除外しつつ、数式参照を維持する。
 * 返すバッファは CloudConvert で PDF 化する用（設定情報は非表示として保持）
 */
async function prepareExcelForPdf(excelBuffer: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(excelBuffer);

  const sheetNames = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 読み込みシート: ${sheetNames.join(", ")}`);

  for (const ws of workbook.worksheets) {
    const sheet = ws as ExcelJS.Worksheet & { sheetProtection?: unknown; unprotect?: () => void };

    // 編集ロック解除（PDF 用一時ファイルを処理可能にする）
    if (sheet.sheetProtection) {
      if (typeof sheet.unprotect === "function") sheet.unprotect();
      else sheet.sheetProtection = null;
    }

    if (PRINT_SHEETS.includes(ws.name)) {
      // 印刷対象シートは必ず visible に
      ws.state = "visible";
    } else {
      // 印刷対象外シートは veryHidden に（変換時に対象外になりやすい）
      ws.state = "veryHidden";
    }
  }

  const afterStates = workbook.worksheets.map((ws) => `"${ws.name}"(${ws.state})`);
  console.log(`[pdf-generator] 変換後シート状態: ${afterStates.join(", ")}`);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function convertBufferWithCloudConvert(pdfReadyBuffer: Buffer): Promise<Buffer> {
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
      export_url: {
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

  const fileUrl = findFinishedExportUrl(job);
  if (!fileUrl) {
    throw new Error("CloudConvert: export/url にダウンロード URL がありません");
  }

  const dlRes = await fetch(fileUrl);
  if (!dlRes.ok) {
    throw new Error(`CloudConvert PDF ダウンロード失敗: HTTP ${dlRes.status}`);
  }
  return Buffer.from(await dlRes.arrayBuffer());
}

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  const pdfReadyBuffer = await prepareExcelForPdf(excelBuffer);
  return convertBufferWithCloudConvert(pdfReadyBuffer);
}
