"use client";

import { AuthGuard } from "@/components/auth-guard";
import DashboardLayout from "@/components/dashboard-layout";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allowedRoles={["admin"]}>
      <DashboardLayout role="admin">{children}</DashboardLayout>
    </AuthGuard>
  );
}
