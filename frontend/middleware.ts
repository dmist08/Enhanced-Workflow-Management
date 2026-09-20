// middleware.ts — Next.js Edge middleware for auth + role-based routing
import { NextRequest, NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
}

// ADMIN can access everything. Other roles are restricted to their prefix.
const ROLE_PREFIXES: Record<string, string[]> = {
  ADMIN: ["/admin", "/pm", "/se", "/contractor"],
  PROJECT_MANAGER: ["/pm"],
  SITE_ENGINEER: ["/se"],
  CONTRACTOR: ["/contractor"],
};

const ROLE_DASHBOARDS: Record<string, string> = {
  ADMIN: "/admin/dashboard",
  PROJECT_MANAGER: "/pm/dashboard",
  SITE_ENGINEER: "/se/dashboard",
  CONTRACTOR: "/contractor/dashboard",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let payload: JwtPayload;
  try {
    payload = jwtDecode<JwtPayload>(token);
    if (payload.exp * 1000 < Date.now()) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = payload.role;
  const allowedPrefixes = ROLE_PREFIXES[role] ?? [];

  // Check if the current path starts with any allowed prefix
  const isProtectedRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/pm") ||
    pathname.startsWith("/se") ||
    pathname.startsWith("/contractor");

  if (isProtectedRoute) {
    const allowed = allowedPrefixes.some((prefix) => pathname.startsWith(prefix));
    if (!allowed) {
      return NextResponse.redirect(new URL(ROLE_DASHBOARDS[role] ?? "/login", req.url));
    }
  }

  // Root "/" redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL(ROLE_DASHBOARDS[role] ?? "/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
