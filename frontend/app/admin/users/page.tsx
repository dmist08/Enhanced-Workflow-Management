"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { User } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

const ROLES = ["ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACTOR"];
type UserForm = { name: string; email: string; password: string; role: string };
const emptyForm = (): UserForm => ({ name: "", email: "", password: "", role: "SITE_ENGINEER" });

export default function AdminUsers() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<"create" | string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/admin/users").then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: UserForm) =>
      modal === "create"
        ? api.post("/admin/users", data)
        : api.patch(`/admin/users/${modal}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setModal(null); setFormError(null); },
    onError: (err: any) => setFormError(err.response?.data?.error ?? "Save failed."),
  });

  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setModal(u.id);
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Users</h1>
        <button onClick={() => { setForm(emptyForm()); setModal("create"); }}
          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors">
          New user
        </button>
      </div>

      {(!users || users.length === 0) ? (
        <EmptyState title="No users" description="Create the first user." />
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2"><StatusBadge status={u.role.replace("_", " ")} /></td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(u)} className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-900">{modal === "create" ? "New user" : "Edit user"}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
            </div>
            <div className="space-y-3">
              {(["name", "email"] as const).map(k => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{k}</label>
                  <input type={k === "email" ? "email" : "text"} value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password {modal !== "create" && "(leave blank to keep)"}</label>
                <input type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600">
                  {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
                className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
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
