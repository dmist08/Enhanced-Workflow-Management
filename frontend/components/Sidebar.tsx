"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Role } from "@/lib/auth";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Sliders,
  AlertOctagon,
  CheckSquare,
  ListTodo,
  Camera,
  History,
  LogOut,
  HardHat,
} from "lucide-react";
import React from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function getNavSections(role: Role): NavSection[] {
  const sections: NavSection[] = [];

  if (role === "ADMIN") {
    sections.push({
      title: "Organization Admin",
      items: [
        { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
        { label: "Projects", href: "/admin/projects", icon: FolderKanban },
        { label: "Users", href: "/admin/users", icon: Users },
        { label: "Escalation rules", href: "/admin/escalation-rules", icon: Sliders },
        { label: "Escalations", href: "/admin/escalations", icon: AlertOctagon },
      ],
    });
    sections.push({
      title: "Project Management",
      items: [
        { label: "Projects & CPM", href: "/pm/dashboard", icon: FolderKanban },
        { label: "Approvals queue", href: "/pm/approvals", icon: CheckSquare },
      ],
    });
    sections.push({
      title: "Field Operations",
      items: [
        { label: "SE Task view", href: "/se/dashboard", icon: ListTodo },
        { label: "Evidence log", href: "/se/evidence-log", icon: Camera },
        { label: "Contractor view", href: "/contractor/dashboard", icon: HardHat },
        { label: "Contractor approvals", href: "/contractor/approvals", icon: History },
      ],
    });
  }

  if (role === "PROJECT_MANAGER") {
    sections.push({
      title: "Project Management",
      items: [
        { label: "Projects", href: "/pm/dashboard", icon: FolderKanban },
        { label: "Approvals queue", href: "/pm/approvals", icon: CheckSquare },
      ],
    });
  }

  if (role === "SITE_ENGINEER") {
    sections.push({
      title: "Field Work",
      items: [
        { label: "Assigned tasks", href: "/se/dashboard", icon: ListTodo },
        { label: "Evidence log", href: "/se/evidence-log", icon: Camera },
      ],
    });
  }

  if (role === "CONTRACTOR") {
    sections.push({
      title: "Contractor Portal",
      items: [
        { label: "My tasks", href: "/contractor/dashboard", icon: ListTodo },
        { label: "Approval history", href: "/contractor/approvals", icon: History },
      ],
    });
  }

  return sections;
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const sections = getNavSections(user.role as Role);

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-screen">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded bg-gray-900 flex items-center justify-center text-white font-bold text-xs tracking-wider">
          WM
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 tracking-tight leading-none">Workflow Mgmt</p>
          <p className="text-[10px] text-gray-400 tracking-wide mt-1">Infrastructure Monitor</p>
        </div>
      </div>

      {/* Nav Sections */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (pathname.startsWith(item.href + "/") && item.href !== "/pm/dashboard");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs transition-colors ${
                        active
                          ? "bg-gray-900 text-white font-medium shadow-xs"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-gray-400"}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User profile footer */}
      <div className="border-t border-gray-200 p-3 bg-gray-50/70">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{user.name}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{user.role.replace(/_/g, " ")}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
