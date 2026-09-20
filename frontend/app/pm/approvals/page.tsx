"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Approval } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

export default function PMApprovalsPage() {
  const qc = useQueryClient();
  const [deciding, setDeciding] = useState<Record<string, { decision: "APPROVED" | "REJECTED"; remarks: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ["pm-approvals-pending"],
    queryFn: () => api.get("/pm/approvals/pending").then(r => r.data),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, remarks }: { id: string; decision: string; remarks: string }) =>
      api.patch(`/approvals/${id}/decide`, { decision, remarks }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-approvals-pending"] });
      setDeciding(d => { const n = { ...d }; delete n[vars.id]; return n; });
      setErrors(e => { const n = { ...e }; delete n[vars.id]; return n; });
    },
    onError: (err: any, vars) => {
      setErrors(e => ({ ...e, [vars.id]: err.response?.data?.error ?? "Failed." }));
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  function daysAgo(dateStr: string) {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return days === 0 ? "today" : `${days}d ago`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Pending approvals</h1>

      {(!approvals || approvals.length === 0) ? (
        <EmptyState title="No pending approvals" description="Nothing requires your decision right now." />
      ) : (
        <div className="divide-y divide-gray-200 border border-gray-200">
          {approvals.map(a => {
            const d = deciding[a.id];
            return (
              <div key={a.id} className="px-5 py-4 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Task ID: <span className="font-mono text-xs text-gray-600">{a.task_id}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Requested by {a.requested_by_name ?? "—"} · {daysAgo(a.requested_at)}
                      {parseInt(daysAgo(a.requested_at)) >= 3 && (
                        <span className="ml-2 text-red-500 font-medium">Overdue</span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={a.decision} />
                </div>

                {!d ? (
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => setDeciding(prev => ({ ...prev, [a.id]: { decision: "APPROVED", remarks: "" } }))}
                      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setDeciding(prev => ({ ...prev, [a.id]: { decision: "REJECTED", remarks: "" } }))}
                      className="text-xs border border-gray-300 px-3 py-1.5 rounded text-gray-600 hover:border-gray-600 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${d.decision === "APPROVED" ? "text-green-700" : "text-red-600"}`}>
                        {d.decision}
                      </span>
                      <button
                        onClick={() => setDeciding(prev => { const n = { ...prev }; delete n[a.id]; return n; })}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Change
                      </button>
                    </div>
                    <input
                      placeholder="Remarks (optional)"
                      value={d.remarks}
                      onChange={e => setDeciding(prev => ({ ...prev, [a.id]: { ...d, remarks: e.target.value } }))}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
                    />
                    {errors[a.id] && <p className="text-xs text-red-600">{errors[a.id]}</p>}
                    <button
                      onClick={() => decideMutation.mutate({ id: a.id, decision: d.decision, remarks: d.remarks })}
                      disabled={decideMutation.isPending}
                      className="bg-gray-900 text-white text-xs font-medium px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {decideMutation.isPending ? "Submitting…" : "Confirm"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
