/**
 * HubSpot メモ（Note エンゲージメント）の作成と PDF 添付
 *
 *  1) Files API v3（POST /files/v3/files, multipart）に PDF をアップロードして file ID を得る
 *  2) Note を作成（POST /crm/v3/objects/notes）し、deal に関連付け（associationTypeId 214）、
 *     hs_attachment_ids に file ID を設定する
 *
 * 必要な Private App スコープ:
 *   - files（ファイルアップロード）
 *   - crm.objects.deals.write（Note 作成と deal への関連付け）
 *
 * 任意の環境変数:
 *   - HUBSPOT_NOTE_FILE_FOLDER_PATH（既定 "estimate-webapp"）: アップロード先フォルダ
 *   - HUBSPOT_NOTE_FILE_ACCESS（既定 "PUBLIC_NOT_INDEXED"）: ファイルアクセス権
 */
import type { HubSpotConfig } from "@/lib/hubspot-env";
import { hubspotFetchJson, formatHubSpotErrorBody } from "@/lib/hubspot-deals";

const USER_AGENT = "estimate-webapp/hubspot-notes";

/** Note → Deal の HubSpot 定義済み関連付け type ID */
const NOTE_TO_DEAL_ASSOCIATION_TYPE_ID = 214;

function noteFileFolderPath(): string {
  return process.env.HUBSPOT_NOTE_FILE_FOLDER_PATH?.trim() || "estimate-webapp";
}

function noteFileAccess(): string {
  // HubSpot Files v3 の有効値は PUBLIC_INDEXABLE / PUBLIC_NOT_INDEXABLE / PRIVATE。
  // 添付を CRM から閲覧できるよう既定は PUBLIC_NOT_INDEXABLE（URL 直アクセス可・検索非対象）。
  return process.env.HUBSPOT_NOTE_FILE_ACCESS?.trim() || "PUBLIC_NOT_INDEXABLE";
}

/** hs_note_body は HTML として描画されるため、エスケープ＋改行を <br> に変換する */
function toNoteHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/** PDF などのバイナリを HubSpot Files にアップロードして file ID を返す */
async function uploadFileToHubSpot(
  config: HubSpotConfig,
  input: { buffer: Buffer; fileName: string; contentType: string }
): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    // Buffer をそのまま渡すと BlobPart 型に合わないため Uint8Array に変換する
    const blob = new Blob([new Uint8Array(input.buffer)], { type: input.contentType });
    form.append("file", blob, input.fileName);
    form.append("fileName", input.fileName);
    form.append("folderPath", noteFileFolderPath());
    // options には access に加えて重複検証方針が必須。未指定だと検証エラーで失敗する。
    // 承認のたびに新規ファイルとして登録するため NONE（重複チェックなし）にする。
    form.append(
      "options",
      JSON.stringify({
        access: noteFileAccess(),
        overwrite: false,
        duplicateValidationStrategy: "NONE",
        duplicateValidationScope: "EXACT_FOLDER",
      })
    );

    const url = `${config.apiBase}/files/v3/files`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        // Content-Type は FormData が boundary 付きで自動設定するため指定しない
      },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: formatHubSpotErrorBody(res.status, text) };
    }
    const json = (text ? JSON.parse(text) : {}) as { id?: string };
    if (!json.id) {
      return { ok: false, error: "HubSpot Files アップロードのレスポンスに id がありません。" };
    }
    return { ok: true, fileId: String(json.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type AddEstimateNoteInput = {
  dealId: string;
  /** メモ本文（プレーンテキスト、\n 区切り）。HTML 化はこのモジュールで行う */
  body: string;
  /** 添付する PDF。null/undefined のときは本文のみ作成 */
  pdf?: { buffer: Buffer; fileName: string } | null;
};

export type AddEstimateNoteResult =
  | { ok: true; noteId: string; attachmentUploaded: boolean; attachmentError?: string }
  | { ok: false; error: string };

/**
 * 見積メモを deal に追加する（任意で PDF を添付）。
 * PDF 添付のアップロードに失敗しても、本文のみのメモ作成は試みる。
 */
export async function addEstimateNoteToDeal(
  config: HubSpotConfig,
  input: AddEstimateNoteInput
): Promise<AddEstimateNoteResult> {
  try {
    let attachmentIds = "";
    let attachmentUploaded = false;
    let attachmentError: string | undefined;

    if (input.pdf) {
      const up = await uploadFileToHubSpot(config, {
        buffer: input.pdf.buffer,
        fileName: input.pdf.fileName,
        contentType: "application/pdf",
      });
      if (up.ok) {
        attachmentIds = up.fileId;
        attachmentUploaded = true;
      } else {
        // 添付に失敗してもメモ本文は登録する（添付なし）。失敗理由は呼び出し側へ伝える。
        attachmentError = up.error;
        console.warn("[hubspot-notes] PDF 添付アップロード失敗（メモは本文のみ作成）:", up.error);
      }
    }

    const properties: Record<string, string> = {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: toNoteHtml(input.body),
    };
    if (attachmentIds) properties.hs_attachment_ids = attachmentIds;

    const created = await hubspotFetchJson<{ id?: string }>(
      config,
      "POST",
      "/crm/v3/objects/notes",
      {
        properties,
        associations: [
          {
            to: { id: input.dealId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: NOTE_TO_DEAL_ASSOCIATION_TYPE_ID,
              },
            ],
          },
        ],
      }
    );
    if (!created.id) {
      return { ok: false, error: "HubSpot Note 作成のレスポンスに id がありません。" };
    }
    return {
      ok: true,
      noteId: String(created.id),
      attachmentUploaded,
      ...(attachmentError ? { attachmentError } : {}),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
