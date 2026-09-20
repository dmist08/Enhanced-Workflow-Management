"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project } from "@/lib/types";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";

export default function PMDashboard() {
  const router = useRouter();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["pm-projects"],
    queryFn: () => api.get("/pm/projects").then(r => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">My projects</h1>
        <button
          onClick={() => router.push("/pm/approvals")}
          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
        >
          Pending approvals →
        </button>
      </div>

      {(!projects || projects.length === 0) ? (
        <EmptyState title="No projects assigned" description="Contact your administrator to be assigned to a project." />
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Project</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Planned end</th>
              <th className="text-left px-4 py-2 font-medium">Projected end</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => {
              const isLate = p.projected_end && p.projected_end > p.planned_end;
              return (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/pm/projects/${p.id}`)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2.5 text-gray-500">{p.planned_end}</td>
                  <td className={`px-4 py-2.5 ${isLate ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    {p.projected_end ?? "—"}
                    {isLate && <span className="ml-1 text-xs">⚠</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
