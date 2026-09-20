"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { EscalationRule } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

export default function AdminEscalationRulesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({}); // id -> threshold value
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rules, isLoading } = useQuery<EscalationRule[]>({
    queryKey: ["escalation-rules"],
    queryFn: () => api.get("/admin/escalation-rules").then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number }) =>
      api.patch(`/admin/escalation-rules/${id}`, { threshold }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["escalation-rules"] });
      setEditing(e => { const n = { ...e }; delete n[vars.id]; return n; });
      setErrors(e => { const n = { ...e }; delete n[vars.id]; return n; });
    },
    onError: (err: any, vars) =>
      setErrors(e => ({ ...e, [vars.id]: err.response?.data?.error ?? "Update failed." })),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Escalation rules</h1>
      <p className="text-xs text-gray-500">These rules determine when the system raises an escalation automatically.</p>

      {(!rules || rules.length === 0) ? (
        <EmptyState title="No rules configured" description="No escalation rules exist." />
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Condition</th>
              <th className="text-left px-4 py-2 font-medium">Threshold</th>
              <th className="text-left px-4 py-2 font-medium">Severity</th>
              <th className="text-left px-4 py-2 font-medium">Escalate to</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.condition_key}</td>
                <td className="px-4 py-2">
                  {editing[r.id] !== undefined ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editing[r.id]}
                        onChange={e => setEditing(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-gray-600"
                      />
                      <button
                        onClick={() => updateMutation.mutate({ id: r.id, threshold: parseInt(editing[r.id]) })}
                        disabled={updateMutation.isPending}
                        className="text-xs text-gray-900 underline underline-offset-2 hover:opacity-70 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(e => { const n = { ...e }; delete n[r.id]; return n; })}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-700">{r.threshold}</span>
                  )}
                  {errors[r.id] && <p className="text-xs text-red-600 mt-1">{errors[r.id]}</p>}
                </td>
                <td className="px-4 py-2"><StatusBadge status={r.severity} /></td>
                <td className="px-4 py-2 text-gray-500 text-xs">{r.escalate_to_role.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-right">
                  {editing[r.id] === undefined && (
                    <button
                      onClick={() => setEditing(e => ({ ...e, [r.id]: String(r.threshold) }))}
                      className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
                    >
                      Edit threshold
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
