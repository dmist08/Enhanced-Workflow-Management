"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project, User } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import { useRouter } from "next/navigation";

type ProjectForm = {
  name: string; department: string; site_lat: string; site_lng: string;
  geofence_radius_m: string; budget: string; planned_start: string;
  planned_end: string; status: string; manager_id: string;
};
const emptyForm = (): ProjectForm => ({
  name: "", department: "", site_lat: "", site_lng: "", geofence_radius_m: "200",
  budget: "", planned_start: "", planned_end: "", status: "ACTIVE", manager_id: "",
});

export default function AdminProjects() {
  const router = useRouter();
  const qc = useQueryClient();
  const [modal, setModal] = useState<"create" | string | null>(null); // string = project id for edit
  const [form, setForm] = useState<ProjectForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["admin-projects"],
    queryFn: () => api.get("/admin/projects").then(r => r.data),
  });
  const { data: users } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/admin/users").then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: ProjectForm) => {
      const payload = {
        ...data,
        site_lat: parseFloat(data.site_lat),
        site_lng: parseFloat(data.site_lng),
        geofence_radius_m: parseFloat(data.geofence_radius_m),
        budget: data.budget ? parseFloat(data.budget) : null,
        manager_id: data.manager_id || null,
      };
      return modal === "create"
        ? api.post("/admin/projects", payload)
        : api.patch(`/admin/projects/${modal}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-projects"] });
      setModal(null); setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error ?? "Save failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-projects"] }),
  });

  function openEdit(p: Project) {
    setForm({
      name: p.name, department: p.department ?? "", site_lat: String(p.site_lat),
      site_lng: String(p.site_lng), geofence_radius_m: String(p.geofence_radius_m),
      budget: p.budget ? String(p.budget) : "", planned_start: p.planned_start,
      planned_end: p.planned_end, status: p.status, manager_id: p.manager_id ?? "",
    });
    setModal(p.id);
  }

  function openCreate() { setForm(emptyForm()); setModal("create"); }

  const field = (label: string, key: keyof ProjectForm, type = "text") => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
      />
    </div>
  );

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
        <button onClick={openCreate} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors">
          New project
        </button>
      </div>

      {(!projects || projects.length === 0) ? (
        <EmptyState title="No projects" description="Create the first project." />
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Planned end</th>
              <th className="text-left px-4 py-2 font-medium">Manager</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">
                  <button
                    onClick={() => router.push(`/pm/projects/${p.id}`)}
                    className="hover:underline text-left font-medium text-gray-900"
                  >
                    {p.name}
                  </button>
                </td>
                <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-2 text-gray-500">{p.planned_end}</td>
                <td className="px-4 py-2 text-gray-500">{p.manager_name ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-3 justify-end items-center">
                    <button
                      onClick={() => router.push(`/pm/projects/${p.id}`)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                    >
                      View CPM
                    </button>
                    <button onClick={() => openEdit(p)} className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2">Edit</button>
                    <button onClick={() => deleteMutation.mutate(p.id)} className="text-xs text-red-500 hover:text-red-700 underline underline-offset-2">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-900">{modal === "create" ? "New project" : "Edit project"}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
            </div>
            <div className="space-y-3">
              {field("Name *", "name")}
              {field("Department", "department")}
              {field("Site latitude *", "site_lat", "number")}
              {field("Site longitude *", "site_lng", "number")}
              {field("Geofence radius (m)", "geofence_radius_m", "number")}
              {field("Budget", "budget", "number")}
              {field("Planned start *", "planned_start", "date")}
              {field("Planned end *", "planned_end", "date")}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
                >
                  {["ACTIVE","ON_HOLD","COMPLETED","CANCELLED"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project manager</label>
                <select
                  value={form.manager_id}
                  onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
                >
                  <option value="">— None —</option>
                  {(users ?? []).filter(u => u.role === "PROJECT_MANAGER" || u.role === "ADMIN").map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setModal(null)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
