"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task, Evidence, Approval } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import EvidenceUploader from "@/components/EvidenceUploader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useState } from "react";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface Props { params: { id: string } }

const VALID_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS"],
  COMPLETED: [],
};

export default function SETaskPage({ params }: Props) {
  const qc = useQueryClient();
  const taskId = params.id;
  const [statusError, setStatusError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState(false);

  const { data: task, isLoading: taskLoading } = useQuery<Task>({
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

  const taskApprovals = (myApprovals || []).filter(a => a.task_id === taskId);
  const hasPendingApproval = taskApprovals.some(a => a.decision === "PENDING");

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/tasks/${taskId}/status`, { status: newStatus }),
    onSuccess: () => {
      setStatusError(null);
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    onError: (err: any) => {
      setStatusError(err?.response?.data?.error || "Failed to update status.");
    },
  });

  const approvalMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/approval-request`, {}),
    onSuccess: () => {
      setApprovalError(null);
      setApprovalSuccess(true);
      qc.invalidateQueries({ queryKey: ["my-approvals"] });
    },
    onError: (err: any) => {
      setApprovalError(err?.response?.data?.error || "Failed to request approval.");
    },
  });

  if (taskLoading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (!task) return <p className="text-center py-10 text-gray-500">Task not found.</p>;

  const allowedTransitions = VALID_TRANSITIONS[task.status] || [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">{task.name}</h1>
          <StatusBadge status={task.status} />
          {task.is_critical && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              CRITICAL PATH
            </span>
          )}
        </div>
        {task.phase && <p className="text-sm text-gray-500">Phase: {task.phase}</p>}
      </div>

      {/* Task details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Planned start</span><p className="font-medium">{task.planned_start}</p></div>
        <div><span className="text-gray-500">Duration</span><p className="font-medium">{task.planned_duration_days} days</p></div>
        <div><span className="text-gray-500">Projected start</span><p className="font-medium">{task.projected_start || "—"}</p></div>
        <div><span className="text-gray-500">Projected end</span><p className="font-medium">{task.projected_end || "—"}</p></div>
        <div><span className="text-gray-500">Slack</span><p className="font-medium">{task.slack_days} days</p></div>
        <div><span className="text-gray-500">Actual start</span><p className="font-medium">{task.actual_start || "—"}</p></div>
      </div>

      {/* Status update */}
      {allowedTransitions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Update Status</h2>
          <div className="flex gap-3 flex-wrap">
            {allowedTransitions.map(s => (
              <button
                key={s}
                onClick={() => statusMutation.mutate(s)}
                disabled={statusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {statusMutation.isPending ? "Updating..." : `Mark as ${s.replace("_", " ")}`}
              </button>
            ))}
          </div>
          {statusError && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {statusError}
            </div>
          )}
        </div>
      )}

      {/* Evidence upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Upload Evidence</h2>
        <EvidenceUploader
          taskId={taskId}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["evidence", taskId] })}
        />
      </div>

      {/* Evidence list */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Evidence Uploads</h2>
        {(!evidence || evidence.length === 0) ? (
          <p className="text-sm text-gray-400">No evidence uploaded yet.</p>
        ) : (
          <ul className="space-y-3">
            {evidence.map(ev => (
              <li key={ev.id} className="flex items-center gap-3 text-sm border-b pb-2">
                {ev.geo_verified
                  ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                }
                <div>
                  <span className={ev.geo_verified ? "text-green-700" : "text-orange-700"}>
                    {ev.geo_verified ? "Geo-verified" : "Outside geofence"}
                  </span>
                  <span className="text-gray-400 ml-2">{ev.distance_from_site_m?.toFixed(0)}m from site</span>
                  <span className="text-gray-400 ml-2">{ev.captured_at}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Approval request */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Approval</h2>
        {approvalSuccess || hasPendingApproval ? (
          <div className="flex items-center gap-2 text-yellow-700 text-sm">
            <Clock className="w-4 h-4" />
            Approval request pending.
          </div>
        ) : (
          <button
            onClick={() => approvalMutation.mutate()}
            disabled={approvalMutation.isPending}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {approvalMutation.isPending ? "Submitting..." : "Request Approval"}
          </button>
        )}
        {approvalError && (
          <p className="mt-2 text-red-600 text-sm">{approvalError}</p>
        )}

        {taskApprovals.length > 0 && (
          <ul className="mt-4 space-y-2">
            {taskApprovals.map(a => (
              <li key={a.id} className="text-sm flex items-center gap-3">
                <StatusBadge status={a.decision} />
                <span className="text-gray-500">Requested {a.requested_at}</span>
                {a.remarks && <span className="text-gray-600">— {a.remarks}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
