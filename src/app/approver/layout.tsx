"use client";

import { AuthGuard } from "@/components/auth-guard";
import DashboardLayout from "@/components/dashboard-layout";

export default function ApproverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allowedRoles={["approver"]}>
      <DashboardLayout role="approver">{children}</DashboardLayout>
    </AuthGuard>
  );
}
