/**
 * 承認通知ヘルパー
 * DB の app_settings テーブルから通知設定を取得して送信する。
 *
 * app_settings キー:
 *   active_channel  = "slack" | "teams" | "gmail"
 *   slack_target    = Slack Incoming Webhook URL
 *   teams_target    = Teams Incoming Webhook URL
 *   gmail_target    = 送信先メールアドレス
 *   gmail_from      = 送信元メールアドレス
 *   gmail_password  = Gmail アプリパスワード
 */

import { getDb } from "./db";
import {
  getApprovalSubject,
  getApprovalBody,
  getApprovalShortTitle,
  type NotificationVars,
} from "./notification-templates";

export type NotifyResult = { ok: boolean; error?: string };

type NotifySettings = {
  active_channel: "slack" | "teams" | "gmail";
  slack_target: string;
  teams_target: string;
  gmail_target: string;
  gmail_from: string;
  gmail_password: string;
};

async function loadSettings(): Promise<NotifySettings> {
  try {
    const sql = getDb();
    const rows = await sql`SELECT key, value FROM app_settings`;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      active_channel: (map["active_channel"] as NotifySettings["active_channel"]) ?? "slack",
      slack_target:   map["slack_target"]   ?? "",
      teams_target:   map["teams_target"]   ?? "",
      gmail_target:   map["gmail_target"]   ?? "",
      gmail_from:     map["gmail_from"]     ?? "",
      gmail_password: map["gmail_password"] ?? "",
    };
  } catch {
    // DB 接続失敗時はデフォルトを返す
    return {
      active_channel: "slack",
      slack_target: process.env.NOTIFICATION_TARGET ?? "",
      teams_target: "",
      gmail_target: "",
      gmail_from: process.env.GMAIL_FROM ?? "",
      gmail_password: process.env.GMAIL_APP_PASSWORD ?? "",
    };
  }
}

export async function sendApprovalNotification(vars: NotificationVars): Promise<NotifyResult> {
  const cfg = await loadSettings();
  const channel = cfg.active_channel;

  try {
    switch (channel) {
      case "slack":
        if (!cfg.slack_target) return { ok: true }; // 未設定はスキップ
        return await sendSlack(cfg.slack_target, vars);
      case "teams":
        if (!cfg.teams_target) return { ok: true };
        return await sendTeams(cfg.teams_target, vars);
      case "gmail":
        if (!cfg.gmail_target || !cfg.gmail_from || !cfg.gmail_password) return { ok: true };
        return await sendGmail(cfg, vars);
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

// ── Gmail (nodemailer) ─────────────────────────────────
async function sendGmail(
  cfg: Pick<NotifySettings, "gmail_target" | "gmail_from" | "gmail_password">,
  vars: NotificationVars,
): Promise<NotifyResult> {
  const { default: nm } = await import("nodemailer");
  const transporter = nm.createTransport({
    service: "gmail",
    auth: { user: cfg.gmail_from, pass: cfg.gmail_password },
  });

  await transporter.sendMail({
    from: cfg.gmail_from,
    to: cfg.gmail_target,
    subject: getApprovalSubject(vars),
    text: getApprovalBody(vars),
  });
  return { ok: true };
}
