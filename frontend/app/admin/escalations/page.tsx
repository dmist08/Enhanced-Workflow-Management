"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Escalation } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

export default function AdminEscalationsPage() {
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<Record<string, string>>({}); // id -> justification
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: escalations, isLoading } = useQuery<Escalation[]>({
    queryKey: ["escalations"],
    queryFn: () => api.get("/escalations").then(r => r.data),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, justification }: { id: string; justification: string }) =>
      api.patch(`/escalations/${id}/resolve`, { justification }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["escalations"] });
      setResolving(r => { const n = { ...r }; delete n[vars.id]; return n; });
      setErrors(e => { const n = { ...e }; delete n[vars.id]; return n; });
    },
    onError: (err: any, vars) =>
      setErrors(e => ({ ...e, [vars.id]: err.response?.data?.error ?? "Resolve failed." })),
  });

  function handleResolve(id: string) {
    const j = resolving[id]?.trim();
    if (!j) { setErrors(e => ({ ...e, [id]: "Justification is required." })); return; }
    resolveMutation.mutate({ id, justification: j });
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  const open = (escalations ?? []).filter(e => !e.resolved_at);
  const closed = (escalations ?? []).filter(e => e.resolved_at);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold text-gray-900">Escalations</h1>

      {/* Open */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyState title="No open escalations" description="All escalations have been resolved." />
        ) : (
          <div className="divide-y divide-gray-200 border border-gray-200">
            {open.map(esc => (
              <div key={esc.id} className="px-5 py-4 bg-white">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={esc.severity} />
                      <span className="text-xs font-mono text-gray-600">{esc.rule_triggered}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Task: {esc.task_name ?? esc.task_id ?? "—"} ·
                      Raised to: {esc.raised_to_name ?? "—"} ·
                      {esc.raised_at?.slice(0, 10)}
                    </p>
                  </div>
                </div>

                {resolving[esc.id] !== undefined ? (
                  <div className="space-y-2 mt-2">
                    <input
                      placeholder="Justification (required)"
                      value={resolving[esc.id]}
                      onChange={e => setResolving(r => ({ ...r, [esc.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
                    />
                    {errors[esc.id] && <p className="text-xs text-red-600">{errors[esc.id]}</p>}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleResolve(esc.id)}
                        disabled={resolveMutation.isPending}
                        className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {resolveMutation.isPending ? "Resolving…" : "Confirm resolve"}
                      </button>
                      <button
                        onClick={() => setResolving(r => { const n = { ...r }; delete n[esc.id]; return n; })}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setResolving(r => ({ ...r, [esc.id]: "" }))}
                    className="mt-2 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Resolved */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Resolved ({closed.length})
          </h2>
          <table className="w-full text-xs border border-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="text-left px-3 py-1.5 font-medium">Rule</th>
                <th className="text-left px-3 py-1.5 font-medium">Severity</th>
                <th className="text-left px-3 py-1.5 font-medium">Task</th>
                <th className="text-left px-3 py-1.5 font-medium">Resolved</th>
                <th className="text-left px-3 py-1.5 font-medium">Justification</th>
              </tr>
            </thead>
            <tbody>
              {closed.map(esc => (
                <tr key={esc.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 font-mono text-gray-600">{esc.rule_triggered}</td>
                  <td className="px-3 py-1.5"><StatusBadge status={esc.severity} /></td>
                  <td className="px-3 py-1.5 text-gray-500">{esc.task_name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-400">{esc.resolved_at?.slice(0, 10)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{esc.justification ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
