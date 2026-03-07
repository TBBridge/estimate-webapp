"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import LanguageSwitcher from "@/components/language-switcher";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const ok = await login(email, password);
    if (!ok) {
      setError(t(locale, "login.error"));
      return;
    }
    router.push("/");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            {t(locale, "login.title")}
          </h1>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
            {t(locale, "login.subtitle")}
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-6 shadow-sm dark:border-stone-700/80"
        >
          <label className="block font-body text-sm font-medium text-[var(--color-ink)]">
            {t(locale, "login.email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
            placeholder="admin@example.com"
          />
          <label className="mt-4 block font-body text-sm font-medium text-[var(--color-ink)]">
            {t(locale, "login.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-body text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 dark:border-stone-600 dark:bg-stone-800"
          />
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-body text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/50"
          >
            {t(locale, "login.submit")}
          </button>
        </form>
        <p className="mt-4 text-center font-body text-xs text-[var(--color-ink-muted)]">
          {t(locale, "login.devHint")}
        </p>
      </div>
    </div>
  );
}
