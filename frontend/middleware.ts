// middleware.ts — Next.js Edge middleware for role-based routing
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

  // Skip public paths and static assets
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session_token")?.value;

  // If edge has a valid session token, enforce role boundaries
  if (token) {
    try {
      const payload = jwtDecode<JwtPayload>(token);
      if (payload.exp * 1000 > Date.now()) {
        const role = payload.role;
        const allowedPrefixes = ROLE_PREFIXES[role] ?? [];
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
      }
    } catch {
      // Invalid token cookie — let client AppShell / useAuth handle rehydration or redirect
    }
  }

  // Root redirect
  if (pathname === "/") {
    if (token) {
      try {
        const payload = jwtDecode<JwtPayload>(token);
        return NextResponse.redirect(new URL(ROLE_DASHBOARDS[payload.role] ?? "/login", req.url));
      } catch {}
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // For protected routes where cookie is not yet at edge (e.g. cross-domain SPA hydration),
  // allow the page to render so AppShell / useAuth verifies auth via localStorage & /auth/me
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
