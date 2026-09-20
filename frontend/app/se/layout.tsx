"use client";
import AppShell from "@/components/AppShell";

export default function SELayout({ children }: { children: React.ReactNode }) {
  return <AppShell allowedRoles={["SITE_ENGINEER", "ADMIN"]}>{children}</AppShell>;
}
