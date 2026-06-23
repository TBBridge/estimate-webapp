/**
 * HubSpot メモ（Note）本文の組み立て
 *
 * 1 取引に複数見積を集約するため、承認時に見積内容を 1 メモとして deal に追加する。
 * 本文は日本語固定で、顧客名・代理店・提供形態・契約形態・ライセンス数・オプション・金額を並べる。
 */
import { CONTRACT_TYPES, DELIVERY_TYPES } from "@/lib/constants";
import { OPTION_ITEMS } from "@/lib/estimate-schema";

export type EstimateNoteData = {
  customerName: string;
  agencyName: string;
  /** DB の delivery_type（onprem / subscription / cloud） */
  deliveryType: string;
  /** DB の contract_type（new / license_add / option_add） */
  contractType: string;
  /** 本体金額（yen, 整数） */
  amount: number;
  /** 保守料等（yen, 整数） */
  maintenanceFee: number;
  formInputs: Record<string, unknown>;
};

function deliveryLabelJa(v: string): string {
  return DELIVERY_TYPES.find((d) => d.value === v)?.labelJa ?? v;
}

function contractLabelJa(v: string): string {
  return CONTRACT_TYPES.find((c) => c.value === v)?.labelJa ?? v;
}

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * ライセンス数の表示。
 * - 新規系: licenseCount をそのまま
 * - ライセンス追加: 追加後 / 既存 を併記
 * - オプション追加: 既存ライセンス数のみ
 */
function formatLicenseCount(f: Record<string, unknown>): string {
  const license = toNumber(f.licenseCount);
  if (license !== undefined) return String(license);

  const added = toNumber(f.addedLicenseCount);
  const existing = toNumber(f.existingLicenseCount);
  if (added !== undefined) {
    return existing !== undefined ? `追加後 ${added}（既存 ${existing}）` : `追加後 ${added}`;
  }
  if (existing !== undefined) return `既存 ${existing}`;
  return "—";
}

/**
 * オプションの表示。options（{ hasOptions, [OPTION_ITEMS キー]: boolean }）と
 * optionLicenseCounts（{ [OPTION_ITEMS キー]: number }）から、選択済みオプション名
 * （ライセンス数があれば併記）を「、」連結で返す。
 */
function formatOptions(f: Record<string, unknown>): string {
  const options = (f.options as Record<string, unknown>) ?? {};
  if (options.hasOptions !== true) return "無";

  const counts = (f.optionLicenseCounts as Record<string, unknown>) ?? {};
  const names: string[] = [];
  for (const key of Object.keys(OPTION_ITEMS) as (keyof typeof OPTION_ITEMS)[]) {
    if (options[key] !== true) continue;
    const opt = OPTION_ITEMS[key];
    const c = toNumber(counts[key]);
    names.push(c !== undefined ? `${opt.labelJa}：${c}` : opt.labelJa);
  }
  if (names.length === 0) return "有（オプション未選択）";
  return names.join("、");
}

function formatAmountYen(n: number): string {
  return `¥${Math.trunc(n).toLocaleString("ja-JP")}`;
}

/**
 * HubSpot メモ本文（プレーンテキスト、\n 区切り）。
 * HTML 化は呼び出し側（hubspot-notes）で行う。
 */
export function buildEstimateNoteBody(data: EstimateNoteData): string {
  const f = (data.formInputs ?? {}) as Record<string, unknown>;
  const amount = Number(data.amount ?? 0);
  const maint = Number(data.maintenanceFee ?? 0);
  const total =
    (Number.isFinite(amount) ? amount : 0) + (Number.isFinite(maint) ? maint : 0);

  const lines = [
    `顧客名：${data.customerName || "—"}`,
    `代理店：${data.agencyName || "—"}`,
    `提供形態：${deliveryLabelJa(data.deliveryType)}`,
    `契約形態：${contractLabelJa(data.contractType)}`,
    `ライセンス数：${formatLicenseCount(f)}`,
    `オプション：${formatOptions(f)}`,
    `金額：${formatAmountYen(total)}`,
  ];
  return lines.join("\n");
}
