/**
 * 承認通知テンプレート（要件仕様書 13）
 * 運用で選択した 1 チャネル（Teams / Slack / Gmail）で同一文面を使用
 */

export type NotificationVars = {
  estimateNo: string;
  customerName: string;
  deliveryType: string;
  contractType: string;
  requestedAt: string;
  agencyName: string;
  approvalUrl: string;
};

export type EstimateDecisionStatus = "approved" | "rejected";

export type AgencyDecisionNotificationVars = {
  recipientEmail?: string;
  recipientName?: string;
  status: EstimateDecisionStatus;
  estimateNo: string;
  customerName: string;
  agencyName: string;
  decidedAt: string;
};

function decisionLabel(status: EstimateDecisionStatus): string {
  return status === "approved" ? "承認" : "差し戻し";
}

export function getApprovalSubject(v: NotificationVars): string {
  return `【見積承認依頼】見積番号：${v.estimateNo} - ${v.customerName}`;
}

export function getApprovalBody(v: NotificationVars): string {
  return `見積の承認依頼があります。

■ 見積番号：${v.estimateNo}
■ 顧客名：${v.customerName}
■ 提供形態：${v.deliveryType}
■ 契約形態：${v.contractType}
■ 申請日時：${v.requestedAt}
■ 申請者（代理店）：${v.agencyName}

以下のリンクから承認画面にアクセスし、承認または差し戻しを行ってください。

${v.approvalUrl}

※ 本メッセージは見積自動作成システムから自動送信されています。`;
}

/** Slack / Teams 用短いタイトル */
export function getApprovalShortTitle(v: NotificationVars): string {
  return `見積承認依頼：${v.estimateNo} - ${v.customerName}`;
}

/**
 * 承認通知の既定テンプレート。
 * 管理者が `app_settings` の `decision_subject_template` / `decision_body_template` で
 * 上書きできる。プレースホルダは {{...}} 形式。
 */
export const DEFAULT_DECISION_SUBJECT_TEMPLATE =
  "【見積依頼 {{decisionLabel}}】見積番号：{{estimateNo}} - {{customerName}}";

export const DEFAULT_DECISION_BODY_TEMPLATE = `{{recipientGreeting}}見積依頼が{{decisionLabel}}されました。

■ 見積番号：{{estimateNo}}
■ 顧客名：{{customerName}}
■ 代理店：{{agencyName}}
■ 結果：{{decisionLabel}}
■ 処理日時：{{decidedAt}}

代理店画面で見積内容をご確認ください。

※ 本メッセージは見積自動作成システムから自動送信されています。`;

/** テンプレートのプレースホルダキー（UI ヒント表示にも利用） */
export const DECISION_TEMPLATE_PLACEHOLDERS = [
  "estimateNo",
  "customerName",
  "agencyName",
  "decisionLabel",
  "decidedAt",
  "recipientName",
  "recipientGreeting",
] as const;

function buildDecisionPlaceholderMap(
  v: AgencyDecisionNotificationVars
): Record<string, string> {
  const recipientName = v.recipientName?.trim() ?? "";
  return {
    estimateNo: v.estimateNo,
    customerName: v.customerName,
    agencyName: v.agencyName,
    decisionLabel: decisionLabel(v.status),
    decidedAt: v.decidedAt,
    recipientName,
    recipientGreeting: recipientName ? `${recipientName} 様\n\n` : "",
  };
}

/**
 * `{{key}}` 形式のプレースホルダを置換する。未定義キーは空文字に置換する。
 * `\n` リテラルは改行として解釈する（管理画面のテキストエリアから入った値を素直に表示するため）。
 */
export function renderDecisionTemplate(
  template: string,
  v: AgencyDecisionNotificationVars
): string {
  const values = buildDecisionPlaceholderMap(v);
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : ""
  );
}

export function getAgencyDecisionSubject(
  v: AgencyDecisionNotificationVars,
  template?: string
): string {
  const tpl = template?.trim() ? template : DEFAULT_DECISION_SUBJECT_TEMPLATE;
  return renderDecisionTemplate(tpl, v);
}

export function getAgencyDecisionBody(
  v: AgencyDecisionNotificationVars,
  template?: string
): string {
  const tpl = template?.trim() ? template : DEFAULT_DECISION_BODY_TEMPLATE;
  return renderDecisionTemplate(tpl, v);
}
