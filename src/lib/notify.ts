/**
 * 通知ヘルパー
 * DB の app_settings テーブルから通知設定を取得して送信する。
 *
 * 通知は 2 系統:
 *
 * 1. 申請通知（代理店 → 承認者・管理者）: active_channel に従って 1 チャネル送信
 *    active_channel  = "slack" | "teams" | "gmail"
 *    slack_target    = Slack Incoming Webhook URL
 *    teams_target    = Teams Incoming Webhook URL
 *    gmail_target    = 送信先メールアドレス
 *    gmail_from      = 申請通知の送信元（Gmail チャネル時のみ）
 *    gmail_password  = 申請通知の Gmail アプリパスワード
 *
 * 2. 承認通知（承認者・管理者 → 代理店担当者）: 常に Gmail 固定
 *    decision_gmail_from       = 承認通知の送信元（例: overseas@cimtops.co.jp）
 *    decision_gmail_password   = 承認通知の Gmail アプリパスワード
 *    decision_subject_template = 件名テンプレート（{{...}} プレースホルダ）
 *    decision_body_template    = 本文テンプレート（同上）
 */

import { getDb } from "./db";
import {
  getApprovalSubject,
  getApprovalBody,
  getApprovalShortTitle,
  getAgencyDecisionSubject,
  getAgencyDecisionBody,
  type AgencyDecisionNotificationVars,
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
  decision_gmail_from: string;
  decision_gmail_password: string;
  decision_subject_template: string;
  decision_body_template: string;
};

function emptySettings(): NotifySettings {
  return {
    active_channel: "slack",
    slack_target: "",
    teams_target: "",
    gmail_target: "",
    gmail_from: "",
    gmail_password: "",
    decision_gmail_from: "",
    decision_gmail_password: "",
    decision_subject_template: "",
    decision_body_template: "",
  };
}

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
      decision_gmail_from:
        map["decision_gmail_from"] ?? process.env.DECISION_GMAIL_FROM ?? "",
      decision_gmail_password:
        map["decision_gmail_password"] ?? process.env.DECISION_GMAIL_APP_PASSWORD ?? "",
      decision_subject_template: map["decision_subject_template"] ?? "",
      decision_body_template:    map["decision_body_template"]    ?? "",
    };
  } catch (e) {
    // DB 接続失敗時は env フォールバックに落とす（黙って失敗しないよう警告を残す）
    console.warn("[notify] loadSettings failed; falling back to env defaults", e);
    return {
      ...emptySettings(),
      slack_target: process.env.NOTIFICATION_TARGET ?? "",
      gmail_from: process.env.GMAIL_FROM ?? "",
      gmail_password: process.env.GMAIL_APP_PASSWORD ?? "",
      decision_gmail_from: process.env.DECISION_GMAIL_FROM ?? "",
      decision_gmail_password: process.env.DECISION_GMAIL_APP_PASSWORD ?? "",
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

export async function sendAgencyDecisionGmailNotification(
  vars: AgencyDecisionNotificationVars & { recipientEmail: string }
): Promise<NotifyResult> {
  const recipientEmail = vars.recipientEmail.trim();
  if (!recipientEmail) {
    console.warn(
      "[notify] decision notification skipped: recipientEmail is empty (set estimateRequesterEmail in form, or agencies.email)"
    );
    return { ok: false, error: "decision_recipient_email_missing" };
  }

  const cfg = await loadSettings();
  if (!cfg.decision_gmail_from || !cfg.decision_gmail_password) {
    console.warn(
      "[notify] decision notification skipped: decision_gmail_from / decision_gmail_password not configured (admin: /admin/settings)"
    );
    return { ok: false, error: "decision_gmail_config_missing" };
  }

  try {
    return await sendGmailMessage({
      from: cfg.decision_gmail_from,
      password: cfg.decision_gmail_password,
      to: recipientEmail,
      subject: getAgencyDecisionSubject(vars, cfg.decision_subject_template),
      text: getAgencyDecisionBody(vars, cfg.decision_body_template),
    });
  } catch (e) {
    console.error("[notify] Failed to send agency decision notification:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  return sendGmailMessage({
    from: cfg.gmail_from,
    password: cfg.gmail_password,
    to: cfg.gmail_target,
    subject: getApprovalSubject(vars),
    text: getApprovalBody(vars),
  });
}

async function sendGmailMessage(input: {
  from: string;
  password: string;
  to: string;
  subject: string;
  text: string;
}): Promise<NotifyResult> {
  const { default: nm } = await import("nodemailer");
  const transporter = nm.createTransport({
    service: "gmail",
    auth: { user: input.from, pass: input.password },
  });

  await transporter.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return { ok: true };
}
