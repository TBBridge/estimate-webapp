"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import LanguageSwitcher from "@/components/language-switcher";
import type { Role } from "@/lib/constants";

type NavItem = { href: string; labelKey: string };

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", labelKey: "nav.dashboard" },
  { href: "/admin/agents", labelKey: "nav.agencies" },
  { href: "/admin/masters", labelKey: "nav.masters" },
  { href: "/admin/estimates", labelKey: "nav.estimates" },
  { href: "/admin/settings", labelKey: "nav.settings" },
];

const AGENCY_NAV: NavItem[] = [
  { href: "/agency", labelKey: "nav.home" },
  { href: "/agency/estimates", labelKey: "nav.estimates" },
];

const APPROVER_NAV: NavItem[] = [
  { href: "/approver", labelKey: "nav.pendingApproval" },
];

function getNav(role: Role): NavItem[] {
  if (role === "admin") return ADMIN_NAV;
  if (role === "agency") return AGENCY_NAV;
  return APPROVER_NAV;
}

export default function DashboardLayout({
  children,
  role,
}: {
  children: React.ReactNode;
  role: Role;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { locale } = useLocale();
  const navItems = getNav(role);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface)]">
      <aside className="flex w-56 flex-col border-r border-stone-200/80 bg-[var(--color-surface-elevated)] dark:border-stone-700/80">
        <div className="border-b border-stone-200/80 p-4 dark:border-stone-700/80">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]"
          >
            {t(locale, "app.name")}
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 font-body text-sm transition ${
                  active
                    ? "bg-[var(--color-brand-muted)] font-medium text-[var(--color-brand)]"
                    : "text-[var(--color-ink-muted)] hover:bg-stone-100 hover:text-[var(--color-ink)] dark:hover:bg-stone-800"
                }`}
              >
                {t(locale, item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-stone-200/80 p-3 dark:border-stone-700/80">
          <div className="mb-2 flex justify-end px-1">
            <LanguageSwitcher />
          </div>
          <p className="truncate px-3 py-1 font-body text-xs text-[var(--color-ink-muted)]">
            {user?.name}
          </p>
          <p className="truncate px-3 font-body text-xs text-[var(--color-ink-muted)]">
            {user?.email}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left font-body text-sm text-[var(--color-ink-muted)] hover:bg-stone-100 hover:text-[var(--color-ink)] dark:hover:bg-stone-800"
          >
            {t(locale, "common.logout")}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
