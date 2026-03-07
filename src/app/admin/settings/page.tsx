"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { DEFAULT_SETTINGS, type NotificationChannel } from "@/lib/mock-data";

const CHANNELS: { value: NotificationChannel; icon: string; labelKey: string }[] = [
  { value: "teams", icon: "🟦", labelKey: "admin.settings.teams" },
  { value: "slack", icon: "🟩", labelKey: "admin.settings.slack" },
  { value: "gmail", icon: "🟥", labelKey: "admin.settings.gmail" },
];

export default function AdminSettingsPage() {
  const { locale } = useLocale();
  const l = (k: string) => t(locale, k);

  const [channel, setChannel] = useState<NotificationChannel>(DEFAULT_SETTINGS.notificationChannel);
  const [target, setTarget] = useState(DEFAULT_SETTINGS.notificationTarget);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

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

      <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-sm dark:border-stone-700/80 space-y-6">
        {/* チャネル選択 */}
        <div>
          <label className="mb-2 block font-body text-sm font-medium text-[var(--color-ink)]">
            {l("admin.settings.channel")}
          </label>
          <div className="space-y-2">
            {CHANNELS.map((ch) => (
              <label
                key={ch.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                  channel === ch.value
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-muted)]"
                    : "border-stone-300 hover:border-stone-400 dark:border-stone-600 dark:hover:border-stone-500"
                }`}
              >
                <input
                  type="radio"
                  name="channel"
                  value={ch.value}
                  checked={channel === ch.value}
                  onChange={() => setChannel(ch.value)}
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

        {/* 送信先 */}
        <div>
          <label className="mb-1 block font-body text-sm font-medium text-[var(--color-ink)]">
            {l("admin.settings.target")}
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={channel === "gmail" ? "approver@example.com" : channel === "slack" ? "#approval-requests" : "https://teams.webhook..."}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-body text-sm font-medium text-white hover:opacity-90"
          >
            {l("admin.settings.save")}
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
