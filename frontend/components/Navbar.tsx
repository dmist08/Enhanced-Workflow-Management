"use client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  SITE_ENGINEER: "Site Engineer",
  CONTRACTOR: "Contractor",
};

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-6">
        <span className="text-sm font-semibold text-gray-900 tracking-tight">Workflow Management</span>
        {user && (
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs font-medium text-gray-800">{user.name}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[user.role]}</p>
            </div>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
