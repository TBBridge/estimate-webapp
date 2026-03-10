/**
 * 承認通知ヘルパー
 * 環境変数で設定されたチャネル（Slack / Teams / Gmail）に通知を送信する
 *
 * 環境変数:
 *   NOTIFICATION_CHANNEL  = "slack" | "teams" | "gmail"
 *   NOTIFICATION_TARGET   = Slack: webhook URL, Teams: webhook URL, Gmail: 送信先メールアドレス
 *   GMAIL_FROM            = 送信元メールアドレス（Gmail の場合のみ）
 *   GMAIL_APP_PASSWORD    = Gmail アプリパスワード（Gmail の場合のみ）
 */

import { getApprovalSubject, getApprovalBody, getApprovalShortTitle, type NotificationVars } from "./notification-templates";

export type NotifyResult = { ok: boolean; error?: string };

export async function sendApprovalNotification(vars: NotificationVars): Promise<NotifyResult> {
  const channel = (process.env.NOTIFICATION_CHANNEL ?? "slack") as "slack" | "teams" | "gmail";
  const target = process.env.NOTIFICATION_TARGET ?? "";

  if (!target) {
    console.warn("[notify] NOTIFICATION_TARGET is not set. Skipping notification.");
    return { ok: true };
  }

  try {
    switch (channel) {
      case "slack":
        return await sendSlack(target, vars);
      case "teams":
        return await sendTeams(target, vars);
      case "gmail":
        return await sendGmail(target, vars);
      default:
        return { ok: false, error: `Unknown channel: ${channel}` };
    }
  } catch (e) {
    console.error("[notify] Failed to send notification:", e);
    return { ok: false, error: String(e) };
  }
}

// ── Slack Incoming Webhook ──────────────────────────────
async function sendSlack(webhookUrl: string, vars: NotificationVars): Promise<NotifyResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: getApprovalShortTitle(vars),
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: getApprovalShortTitle(vars) },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*見積番号*\n${vars.estimateNo}` },
            { type: "mrkdwn", text: `*顧客名*\n${vars.customerName}` },
            { type: "mrkdwn", text: `*提供形態*\n${vars.deliveryType}` },
            { type: "mrkdwn", text: `*契約形態*\n${vars.contractType}` },
            { type: "mrkdwn", text: `*申請者*\n${vars.agencyName}` },
            { type: "mrkdwn", text: `*申請日時*\n${vars.requestedAt}` },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "承認画面を開く" },
              url: vars.approvalUrl,
              style: "primary",
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `Slack HTTP ${res.status}` };
  return { ok: true };
}

// ── Microsoft Teams Incoming Webhook ───────────────────
async function sendTeams(webhookUrl: string, vars: NotificationVars): Promise<NotifyResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: getApprovalShortTitle(vars),
      themeColor: "0d6b5c",
      title: getApprovalShortTitle(vars),
      text: getApprovalBody(vars),
      potentialAction: [
        {
          "@type": "OpenUri",
          name: "承認画面を開く",
          targets: [{ os: "default", uri: vars.approvalUrl }],
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `Teams HTTP ${res.status}` };
  return { ok: true };
}

// ── Gmail (SMTP via nodemailer) ─────────────────────────
// nodemailer は動的インポートで解決（Vercel Edge 非対応のため Node.js Runtime）
async function sendGmail(toEmail: string, vars: NotificationVars): Promise<NotifyResult> {
  const from = process.env.GMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!from || !pass) {
    return { ok: false, error: "GMAIL_FROM / GMAIL_APP_PASSWORD not set" };
  }

    // nodemailer を動的インポート（Edge Runtime 非対応のため Node.js Runtime 限定）
  const { default: nm } = await import("nodemailer");
  const transporter = nm.createTransport({
    service: "gmail",
    auth: { user: from, pass },
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: getApprovalSubject(vars),
    text: getApprovalBody(vars),
  });
  return { ok: true };
}
