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

export function getAgencyDecisionSubject(v: AgencyDecisionNotificationVars): string {
  return `【見積依頼 ${decisionLabel(v.status)}】見積番号：${v.estimateNo} - ${v.customerName}`;
}

export function getAgencyDecisionBody(v: AgencyDecisionNotificationVars): string {
  const label = decisionLabel(v.status);
  const greeting = v.recipientName?.trim() ? `${v.recipientName.trim()} 様

` : "";
  return `${greeting}見積依頼が${label}されました。

■ 見積番号：${v.estimateNo}
■ 顧客名：${v.customerName}
■ 代理店：${v.agencyName}
■ 結果：${label}
■ 処理日時：${v.decidedAt}

代理店画面で見積内容をご確認ください。

※ 本メッセージは見積自動作成システムから自動送信されています。`;
}
