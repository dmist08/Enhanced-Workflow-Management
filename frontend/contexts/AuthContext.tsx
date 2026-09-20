// contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api from "@/lib/api";
import { CurrentUser, dashboardPathForRole } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface DecodedToken {
  sub: string;
  role: any;
  name: string;
  exp: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Rehydrate session on mount
    const token = typeof window !== "undefined" ? localStorage.getItem("session_token") : null;
    if (token) {
      try {
        const decoded = jwtDecode<DecodedToken>(token);
        if (decoded.exp * 1000 > Date.now()) {
          // Set initial user from valid local token to prevent premature redirect
          setUser({
            id: decoded.sub,
            role: decoded.role,
            name: decoded.name || "User",
            email: "",
          });
          // Ensure cookie is synced on current domain for edge middleware
          document.cookie = `session_token=${token}; path=/; max-age=86400; SameSite=Lax; Secure`;
        } else {
          localStorage.removeItem("session_token");
        }
      } catch {
        localStorage.removeItem("session_token");
      }
    }

    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        if (!token) {
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    setUser(res.data);

    if (res.data.token) {
      // Store in localStorage for cross-domain API requests
      localStorage.setItem("session_token", res.data.token);
      // Store in local domain cookie so Next.js Edge middleware on vercel.app validates it
      document.cookie = `session_token=${res.data.token}; path=/; max-age=86400; SameSite=Lax; Secure`;
    }

    router.push(dashboardPathForRole(res.data.role));
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("session_token");
    document.cookie = "session_token=; path=/; max-age=0; SameSite=Lax; Secure";
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
