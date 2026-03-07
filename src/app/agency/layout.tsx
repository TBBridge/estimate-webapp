"use client";

import { AuthGuard } from "@/components/auth-guard";
import DashboardLayout from "@/components/dashboard-layout";

export default function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allowedRoles={["agency"]}>
      <DashboardLayout role="agency">{children}</DashboardLayout>
    </AuthGuard>
  );
}
