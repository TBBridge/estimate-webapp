"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import type { Role } from "@/lib/constants";

export function AuthGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: Role[];
}) {
  const { user, isAuthenticated } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      router.replace("/");
      return;
    }
  }, [isAuthenticated, user, allowedRoles, router]);

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="font-body text-[var(--color-ink-muted)]">{t(locale, "common.loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
