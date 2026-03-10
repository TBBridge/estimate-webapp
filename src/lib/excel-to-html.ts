/**
 * exceljs の Workbook（データ書き込み済み）を
 * PDF 変換用の HTML 文字列に変換するユーティリティ
 *
 * 見積書として体裁を整えた HTML を生成する。
 * テンプレートの全セルを忠実に再現するのではなく、
 * 書き込んだデータフィールドを見積書フォーマットで表示する。
 */

import ExcelJS from "exceljs";

export interface EstimateHtmlParams {
  agencyName: string;
  customerName: string;
  deliveryType: string;
  contractType: string;
  cloudBilling?: string;
  formInputs: Record<string, unknown>;
  estimateNo: string;
  createdAt: string;
}

/** 提供形態・契約形態の日本語ラベル */
const DELIVERY_LABEL: Record<string, string> = {
  onprem: "オンプレミス",
  subscription: "サブスクリプション",
  cloud: "クラウド",
};
const CONTRACT_LABEL: Record<string, string> = {
  new: "新規",
  license_add: "ライセンス追加",
  option_add: "オプション追加",
};
const BILLING_LABEL: Record<string, string> = {
  annual: "年額",
  period: "区切り",
};

/** year_month オブジェクトを "YYYY年MM月" に */
function fmtYM(ym: unknown): string {
  if (ym && typeof ym === "object") {
    const o = ym as Record<string, unknown>;
    if (o.year && o.month) return `${o.year}年${o.month}月`;
  }
  return "—";
}

/** 配列を改行区切りのリストに */
function fmtList(val: unknown): string {
  if (Array.isArray(val)) return val.join("<br>");
  return val ? String(val) : "—";
}

/** ExcelJS Workbook からセル値を読み取って HTML 生成 */
export async function workbookToHtml(
  workbook: ExcelJS.Workbook,
  params: EstimateHtmlParams
): Promise<string> {
  const {
    agencyName,
    customerName,
    deliveryType,
    contractType,
    cloudBilling,
    formInputs,
    estimateNo,
    createdAt,
  } = params;

  // 動的フィールドを構築
  const fields: { label: string; value: string }[] = [];

  if (deliveryType === "onprem" && contractType === "new") {
    fields.push({ label: "i-Reporter ライセンス数", value: String(formInputs.licenseCount ?? "—") });
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      fields.push({ label: "オプション", value: fmtList(opts) });
    }
  } else if (deliveryType === "onprem" && contractType === "license_add") {
    fields.push({ label: "既存ライセンス数", value: String(formInputs.existingLicenseCount ?? "—") });
    fields.push({ label: "追加後ライセンス数", value: String(formInputs.addedLicenseCount ?? "—") });
    fields.push({ label: "既存保守開始年月", value: fmtYM(formInputs.existingMaintenanceStart) });
    fields.push({ label: "既存保守終了年月", value: fmtYM(formInputs.existingMaintenanceEnd) });
    fields.push({ label: "発注予定年月", value: fmtYM(formInputs.orderPlanned) });
  } else if (deliveryType === "onprem" && contractType === "option_add") {
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      fields.push({ label: "追加オプション", value: fmtList(opts) });
    }
    const lc = formInputs.optionLicenseCounts as Record<string, number> | undefined;
    if (lc) {
      const entries = Object.entries(lc).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
      if (entries.length > 0) fields.push({ label: "オプション別ライセンス数", value: entries.join("<br>") });
    }
    fields.push({ label: "既存保守開始年月", value: fmtYM(formInputs.existingMaintenanceStart) });
    fields.push({ label: "既存保守終了年月", value: fmtYM(formInputs.existingMaintenanceEnd) });
    fields.push({ label: "発注予定年月", value: fmtYM(formInputs.orderPlanned) });
  } else if (deliveryType === "subscription" && contractType === "new") {
    fields.push({ label: "ライセンス数", value: String(formInputs.licenseCount ?? "—") });
    fields.push({ label: "契約月数", value: String(formInputs.contractMonths ?? "—") + " ヶ月" });
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      fields.push({ label: "オプション", value: fmtList(opts) });
    }
  } else if (deliveryType === "cloud" && contractType === "new") {
    if (cloudBilling) {
      fields.push({ label: "課金種別", value: BILLING_LABEL[cloudBilling] ?? cloudBilling });
    }
    if (cloudBilling === "period" && formInputs.periodMonths) {
      fields.push({ label: "月数", value: String(formInputs.periodMonths) + " ヶ月" });
    }
    fields.push({ label: "i-Reporter ライセンス数", value: String(formInputs.licenseCount ?? "—") });
    const opts = formInputs.options as string[] | undefined;
    if (opts && opts.length > 0) {
      fields.push({ label: "オプション", value: fmtList(opts) });
    }
  } else if (deliveryType === "cloud" && contractType === "license_add") {
    fields.push({ label: "既存ライセンス数", value: String(formInputs.existingLicenseCount ?? "—") });
    fields.push({ label: "追加後ライセンス数", value: String(formInputs.addedLicenseCount ?? "—") });
    fields.push({ label: "既存保守開始年月", value: fmtYM(formInputs.existingMaintenanceStart) });
    fields.push({ label: "既存保守終了年月", value: fmtYM(formInputs.existingMaintenanceEnd) });
    fields.push({ label: "発注予定年月", value: fmtYM(formInputs.orderPlanned) });
  }

  const deliveryStr = DELIVERY_LABEL[deliveryType] ?? deliveryType;
  const contractStr = CONTRACT_LABEL[contractType] ?? contractType;

  const rows = fields
    .map(
      (f) => `
      <tr>
        <th>${f.label}</th>
        <td>${f.value}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: #fff;
    padding: 20mm 20mm 20mm 20mm;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    border-bottom: 2px solid #1a4a7a;
    padding-bottom: 16px;
  }
  .title {
    font-size: 22pt;
    font-weight: bold;
    color: #1a4a7a;
    letter-spacing: 0.1em;
  }
  .meta {
    text-align: right;
    font-size: 9pt;
    color: #555;
    line-height: 1.8;
  }
  .meta strong { color: #1a1a1a; font-size: 10pt; }
  .section {
    margin-bottom: 20px;
  }
  .section-title {
    font-size: 10pt;
    font-weight: bold;
    color: #1a4a7a;
    background: #eef3fa;
    padding: 4px 10px;
    margin-bottom: 0;
    border-left: 4px solid #1a4a7a;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  table th, table td {
    border: 1px solid #ccc;
    padding: 7px 12px;
    text-align: left;
    vertical-align: top;
  }
  table th {
    background: #f5f7fb;
    color: #333;
    font-weight: bold;
    width: 40%;
    white-space: nowrap;
  }
  table td {
    background: #fff;
    color: #1a1a1a;
  }
  .footer {
    margin-top: 40px;
    font-size: 8pt;
    color: #888;
    text-align: center;
    border-top: 1px solid #ddd;
    padding-top: 10px;
  }
</style>
</head>
<body>

<div class="header">
  <div class="title">見 積 書</div>
  <div class="meta">
    <div>見積番号: <strong>${estimateNo}</strong></div>
    <div>作成日: <strong>${createdAt}</strong></div>
    <div>提供形態: <strong>${deliveryStr}</strong></div>
    <div>契約形態: <strong>${contractStr}</strong></div>
  </div>
</div>

<div class="section">
  <div class="section-title">基本情報</div>
  <table>
    <tr>
      <th>代理店名</th>
      <td>${agencyName}</td>
    </tr>
    <tr>
      <th>顧客名</th>
      <td>${customerName}</td>
    </tr>
  </table>
</div>

<div class="section">
  <div class="section-title">申請内容</div>
  <table>
    ${rows}
  </table>
</div>

<div class="footer">
  本見積書は ${createdAt} に作成されました。有効期限は作成日より30日間です。
</div>

</body>
</html>`;
}
