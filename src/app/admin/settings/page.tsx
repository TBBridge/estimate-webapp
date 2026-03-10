"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";

type Channel = "slack" | "teams" | "gmail";

type Settings = {
  active_channel: Channel;
  slack_target: string;
  teams_target: string;
  gmail_target: string;
  gmail_from: string;
  gmail_password: string;
};

const DEFAULT_SETTINGS: Settings = {
  active_channel: "slack",
  slack_target: "",
  teams_target: "",
  gmail_target: "",
  gmail_from: "",
  gmail_password: "",
};

const CHANNELS: { value: Channel; labelKey: string; icon: string }[] = [
  { value: "slack",  labelKey: "admin.settings.slack",  icon: "🟩" },
  { value: "teams",  labelKey: "admin.settings.teams",  icon: "🟦" },
  { value: "gmail",  labelKey: "admin.settings.gmail",  icon: "🟥" },
];

export default function AdminSettingsPage() {
  const { locale } = useLocale();
  const l = (k: string) => t(locale, k);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: Partial<Settings>) => {
        setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof Settings, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800";

  if (loading) {
    return (
      <div className="p-8 text-center font-body text-sm text-[var(--color-ink-muted)]">
        {l("common.loading")}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {l("admin.settingsTitle")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {l("admin.settingsDescription")}
        </p>
      </div>

      <div className="space-y-6">
        {/* ── 有効チャネル選択 ── */}
        <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-sm dark:border-stone-700/80">
          <h2 className="mb-3 font-body text-sm font-medium text-[var(--color-ink)]">
            {l("admin.settings.activeChannel")}
          </h2>
          <div className="space-y-2">
            {CHANNELS.map((ch) => (
              <label
                key={ch.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  settings.active_channel === ch.value
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-muted)]"
                    : "border-stone-300 hover:border-stone-400 dark:border-stone-600 dark:hover:border-stone-500"
                }`}
              >
                <input
                  type="radio"
                  name="activeChannel"
                  value={ch.value}
                  checked={settings.active_channel === ch.value}
                  onChange={() => set("active_channel", ch.value)}
                  className="accent-[var(--color-brand)]"
                />
                <span className="text-lg">{ch.icon}</span>
                <span className="font-body text-sm font-medium text-[var(--color-ink)]">
                  {l(ch.labelKey)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ── チャネル別設定 ── */}
        <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-sm dark:border-stone-700/80 space-y-6">
          <h2 className="font-body text-sm font-medium text-[var(--color-ink)]">
            {l("admin.settings.channelConfig")}
          </h2>

          {/* Slack */}
          <div className="space-y-2 rounded-lg border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-700 dark:bg-stone-800/30">
            <div className="flex items-center gap-2">
              <span className="text-base">🟩</span>
              <span className="font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.settings.slack")}</span>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs text-[var(--color-ink-muted)]">{l("admin.settings.slackTarget")}</label>
              <input
                type="url"
                value={settings.slack_target}
                onChange={(e) => set("slack_target", e.target.value)}
                placeholder={l("admin.settings.slackTargetHint")}
                className={inputCls}
              />
            </div>
          </div>

          {/* Teams */}
          <div className="space-y-2 rounded-lg border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-700 dark:bg-stone-800/30">
            <div className="flex items-center gap-2">
              <span className="text-base">🟦</span>
              <span className="font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.settings.teams")}</span>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs text-[var(--color-ink-muted)]">{l("admin.settings.teamsTarget")}</label>
              <input
                type="url"
                value={settings.teams_target}
                onChange={(e) => set("teams_target", e.target.value)}
                placeholder={l("admin.settings.teamsTargetHint")}
                className={inputCls}
              />
            </div>
          </div>

          {/* Gmail */}
          <div className="space-y-2 rounded-lg border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-700 dark:bg-stone-800/30">
            <div className="flex items-center gap-2">
              <span className="text-base">🟥</span>
              <span className="font-body text-sm font-medium text-[var(--color-ink)]">{l("admin.settings.gmail")}</span>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs text-[var(--color-ink-muted)]">{l("admin.settings.gmailTarget")}</label>
              <input
                type="email"
                value={settings.gmail_target}
                onChange={(e) => set("gmail_target", e.target.value)}
                placeholder={l("admin.settings.gmailTargetHint")}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs text-[var(--color-ink-muted)]">{l("admin.settings.gmailFrom")}</label>
              <input
                type="email"
                value={settings.gmail_from}
                onChange={(e) => set("gmail_from", e.target.value)}
                placeholder={l("admin.settings.gmailFromHint")}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs text-[var(--color-ink-muted)]">{l("admin.settings.gmailPassword")}</label>
              <input
                type="password"
                value={settings.gmail_password}
                onChange={(e) => set("gmail_password", e.target.value)}
                placeholder={l("admin.settings.gmailPasswordHint")}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* 保存ボタン */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? l("admin.settings.saving") : l("admin.settings.save")}
          </button>
          {saved && (
            <p className="font-body text-sm text-[var(--color-brand)]">
              {l("admin.settings.saved")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
