"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project } from "@/lib/types";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";

export default function AdminDashboard() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get("/admin/dashboard").then(r => r.data),
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["admin-projects"],
    queryFn: () => api.get("/admin/projects").then(r => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  const s = data?.summary;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500">Organisation-wide summary</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 border border-gray-200">
        {[
          { label: "Projects", value: s?.total_projects ?? "—" },
          { label: "Active", value: s?.active_projects ?? "—" },
          { label: "Users", value: s?.total_users ?? "—" },
          { label: "Open escalations", value: s?.open_escalations ?? "—" },
        ].map(stat => (
          <div key={stat.label} className="bg-white px-5 py-4">
            <p className="text-xs text-gray-400">{stat.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Projects table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Projects</h2>
          <button
            onClick={() => router.push("/admin/projects")}
            className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
          >
            Manage →
          </button>
        </div>

        {(!projects || projects.length === 0) ? (
          <EmptyState title="No projects" description="Create a project to get started." />
        ) : (
          <table className="w-full text-sm border border-gray-200">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Department</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Planned end</th>
                <th className="text-left px-4 py-2 font-medium">Projected end</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/pm/projects/${p.id}`)}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}
                >
                  <td className="px-4 py-2 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2 text-gray-500">{p.department ?? "—"}</td>
                  <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2 text-gray-600">{p.planned_end}</td>
                  <td className={`px-4 py-2 ${p.projected_end && p.projected_end > p.planned_end ? "text-red-600 font-medium" : "text-gray-600"}`}>
                    {p.projected_end ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
