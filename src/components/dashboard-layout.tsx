"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import type { Role } from "@/lib/constants";
import type { Locale } from "@/lib/translations";

type NavItem = { href: string; labelKey: string; icon: React.ReactNode };

const iconCls = "w-4 h-4 shrink-0";

const DashboardIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
const AgencyIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const MasterIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
  </svg>
);
const EstimateIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const SettingsIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>
);
const HomeIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const ApproveIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const LogoutIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const HamburgerIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const CloseIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ADMIN_NAV: NavItem[] = [
  { href: "/admin",           labelKey: "nav.dashboard",    icon: <DashboardIcon /> },
  { href: "/admin/agents",    labelKey: "nav.agencies",     icon: <AgencyIcon /> },
  { href: "/admin/masters",   labelKey: "nav.masters",      icon: <MasterIcon /> },
  { href: "/admin/estimates", labelKey: "nav.estimates",    icon: <EstimateIcon /> },
  { href: "/admin/settings",  labelKey: "nav.settings",     icon: <SettingsIcon /> },
];
const AGENCY_NAV: NavItem[] = [
  { href: "/agency",           labelKey: "nav.home",      icon: <HomeIcon /> },
  { href: "/agency/estimates", labelKey: "nav.estimates", icon: <EstimateIcon /> },
];
const APPROVER_NAV: NavItem[] = [
  { href: "/approver", labelKey: "nav.pendingApproval", icon: <ApproveIcon /> },
];

function getNav(role: Role): NavItem[] {
  if (role === "admin") return ADMIN_NAV;
  if (role === "agency") return AGENCY_NAV;
  return APPROVER_NAV;
}

// ── サイドバーの静的コンポーネント（関数ボディ外で定義）──────────
type SidebarProps = {
  navItems: NavItem[];
  pathname: string;
  locale: Locale;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  onNav?: () => void;
};

function Sidebar({ navItems, pathname, locale, userName, userEmail, onLogout, onNav }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* ロゴ */}
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--color-border)] px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <Link
          href="/"
          className="font-display text-sm font-semibold tracking-tight text-[var(--color-ink)]"
          onClick={onNav}
        >
          {t(locale, "app.name")}
        </Link>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm transition-all ${
                active
                  ? "bg-[var(--color-brand-muted)] font-medium text-[var(--color-brand)]"
                  : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)] hover:text-[var(--color-ink)]"
              }`}
            >
              <span className={active ? "text-[var(--color-brand)]" : ""}>{item.icon}</span>
              {t(locale, item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* フッター */}
      <div className="border-t border-[var(--color-border)] p-3 space-y-1">
        <div className="flex items-center px-2 pb-1">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-muted)] font-display text-sm font-semibold text-[var(--color-brand)]">
            {(userName || "U").charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-xs font-medium text-[var(--color-ink)]">{userName}</p>
            <p className="truncate font-body text-xs text-[var(--color-ink-muted)]">{userEmail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-body text-sm text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface-sub)] hover:text-[var(--color-ink)]"
        >
          <LogoutIcon />
          {t(locale, "common.logout")}
        </button>
      </div>
    </div>
  );
}

// ── メインレイアウト ──────────────────────────────────────────────
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const sidebarProps: SidebarProps = {
    navItems,
    pathname,
    locale,
    userName: user?.name ?? "",
    userEmail: user?.email ?? "",
    onLogout: handleLogout,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface)]">
      {/* ── デスクトップサイドバー ── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* ── モバイルドロワーオーバーレイ ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── モバイルドロワー ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)] transition-transform duration-300 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute right-3 top-3.5 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)]"
          aria-label="メニューを閉じる"
        >
          <CloseIcon />
        </button>
        <Sidebar {...sidebarProps} onNav={() => setSidebarOpen(false)} />
      </aside>

      {/* ── メインコンテンツ ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* トップヘッダー */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sub)] md:hidden"
            aria-label="メニューを開く"
          >
            <HamburgerIcon />
          </button>
          <span className="font-display text-sm font-semibold text-[var(--color-ink)] md:hidden">
            {t(locale, "app.name")}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <div className="ml-1 hidden sm:block">
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto bg-[var(--color-surface)] p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
