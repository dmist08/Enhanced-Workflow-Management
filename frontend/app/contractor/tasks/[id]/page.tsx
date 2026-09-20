"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task, Evidence, Approval } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import EvidenceUploader from "@/components/EvidenceUploader";
import LoadingSpinner from "@/components/LoadingSpinner";

interface Props { params: { id: string } }

const VALID_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS"],
  COMPLETED: [],
};

export default function ContractorTaskPage({ params }: Props) {
  const qc = useQueryClient();
  const taskId = params.id;
  const [statusError, setStatusError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalSent, setApprovalSent] = useState(false);

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then(r => r.data),
  });
  const { data: evidence } = useQuery<Evidence[]>({
    queryKey: ["evidence", taskId],
    queryFn: () => api.get(`/tasks/${taskId}/evidence`).then(r => r.data),
  });
  const { data: myApprovals } = useQuery<Approval[]>({
    queryKey: ["my-approvals"],
    queryFn: () => api.get("/me/approvals").then(r => r.data),
  });

  const taskApprovals = (myApprovals ?? []).filter(a => a.task_id === taskId);
  const hasPending = taskApprovals.some(a => a.decision === "PENDING");

  const statusMutation = useMutation({
    mutationFn: (s: string) => api.patch(`/tasks/${taskId}/status`, { status: s }),
    onSuccess: () => { setStatusError(null); qc.invalidateQueries({ queryKey: ["task", taskId] }); qc.invalidateQueries({ queryKey: ["my-tasks"] }); },
    onError: (err: any) => setStatusError(err.response?.data?.error ?? "Failed to update status."),
  });

  const approvalMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/approval-request`, {}),
    onSuccess: () => { setApprovalSent(true); setApprovalError(null); qc.invalidateQueries({ queryKey: ["my-approvals"] }); },
    onError: (err: any) => setApprovalError(err.response?.data?.error ?? "Request failed."),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!task) return <p className="text-sm text-gray-500 text-center py-10">Task not found.</p>;

  const transitions = VALID_TRANSITIONS[task.status] ?? [];

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-semibold text-gray-900">{task.name}</h1>
          <StatusBadge status={task.status} />
          {task.is_critical && <span className="text-xs text-red-600 font-medium">Critical path</span>}
        </div>
        {task.phase && <p className="text-xs text-gray-400">Phase: {task.phase}</p>}
      </div>

      {/* Details */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {[
          ["Planned start", task.planned_start],
          ["Duration", `${task.planned_duration_days} days`],
          ["Projected end", task.projected_end ?? "—"],
          ["Slack", `${task.slack_days} days`],
        ].map(([label, val]) => (
          <div key={label}>
            <dt className="text-xs text-gray-400">{label}</dt>
            <dd className="font-medium text-gray-800">{val}</dd>
          </div>
        ))}
      </dl>

      {/* Status update */}
      {transitions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Update status</h2>
          <div className="flex gap-3 flex-wrap">
            {transitions.map(s => (
              <button key={s} onClick={() => statusMutation.mutate(s)} disabled={statusMutation.isPending}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {statusMutation.isPending ? "Updating…" : `Mark ${s.replace(/_/g, " ")}`}
              </button>
            ))}
          </div>
          {statusError && <p className="mt-2 text-xs text-red-600">{statusError}</p>}
        </div>
      )}

      {/* Evidence upload */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upload evidence</h2>
        <EvidenceUploader taskId={taskId} onSuccess={() => qc.invalidateQueries({ queryKey: ["evidence", taskId] })} />
      </div>

      {/* Evidence list */}
      {evidence && evidence.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Evidence uploads</h2>
          <table className="w-full text-xs border border-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="text-left px-3 py-1.5 font-medium">Status</th>
                <th className="text-left px-3 py-1.5 font-medium">Distance</th>
                <th className="text-left px-3 py-1.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map(ev => (
                <tr key={ev.id} className="border-b border-gray-100">
                  <td className={`px-3 py-1.5 font-medium ${ev.geo_verified ? "text-green-600" : "text-orange-600"}`}>
                    {ev.geo_verified ? "Verified" : "Outside geofence"}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{ev.distance_from_site_m?.toFixed(0)}m</td>
                  <td className="px-3 py-1.5 text-gray-400">{ev.captured_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approval</h2>
        {(approvalSent || hasPending) ? (
          <p className="text-xs text-yellow-700">Approval request pending.</p>
        ) : (
          <button onClick={() => approvalMutation.mutate()} disabled={approvalMutation.isPending}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {approvalMutation.isPending ? "Submitting…" : "Request approval"}
          </button>
        )}
        {approvalError && <p className="mt-1 text-xs text-red-600">{approvalError}</p>}

        {taskApprovals.length > 0 && (
          <ul className="mt-3 space-y-1">
            {taskApprovals.map(a => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <StatusBadge status={a.decision} />
                <span className="text-gray-400">{a.requested_at?.slice(0, 10)}</span>
                {a.remarks && <span className="text-gray-600">— {a.remarks}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
