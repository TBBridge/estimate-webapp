"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (!ok) {
      setError(t(locale, "login.error"));
      return;
    }
    router.push("/");
  }

  const inputCls =
    "mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 font-body text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-subtle)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--color-surface)] px-4 py-12">
      {/* ツールバー */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      {/* カード */}
      <div className="w-full max-w-[400px]">
        {/* ロゴ */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-white shadow-md">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
              {t(locale, "login.title")}
            </h1>
            <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
              {t(locale, "login.subtitle")}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-7 shadow-[var(--shadow-md)]"
        >
          <div>
            <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
              {t(locale, "login.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputCls}
              placeholder="your@email.com"
            />
          </div>

          <div className="mt-4">
            <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
              {t(locale, "login.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 font-body text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/50 disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {t(locale, "common.loading")}
              </>
            ) : (
              t(locale, "login.submit")
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
