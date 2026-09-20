// lib/auth.ts — shared auth types and helpers (client-side)

export type Role = "ADMIN" | "PROJECT_MANAGER" | "SITE_ENGINEER" | "CONTRACTOR";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "PROJECT_MANAGER":
      return "/pm/dashboard";
    case "SITE_ENGINEER":
      return "/se/dashboard";
    case "CONTRACTOR":
      return "/contractor/dashboard";
  }
}
