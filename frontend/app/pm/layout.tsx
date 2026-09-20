"use client";
import AppShell from "@/components/AppShell";

export default function PMLayout({ children }: { children: React.ReactNode }) {
  return <AppShell allowedRoles={["PROJECT_MANAGER", "ADMIN"]}>{children}</AppShell>;
}
