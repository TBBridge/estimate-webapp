"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    const role = user.role;
    if (role === "admin") router.replace("/admin");
    else if (role === "agency") router.replace("/agency");
    else if (role === "approver") router.replace("/approver");
    else router.replace("/login");
  }, [isAuthenticated, user, router]);

  return (
    <div className="grid min-h-screen place-items-center">
      <p className="font-body text-[var(--color-ink-muted)]">{t(locale, "common.loading")}</p>
    </div>
  );
}
