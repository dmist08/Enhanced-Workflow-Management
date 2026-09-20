"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task, Dependency, Evidence, Approval } from "@/lib/types";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";

interface Props { params: { id: string; tid: string } }

export default function PMTaskDetailPage({ params }: Props) {
  const qc = useQueryClient();
  const { id: projectId, tid: taskId } = params;
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phase: "", planned_start: "", planned_duration_days: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then(r => r.data),
  });

  const { data: deps } = useQuery<Dependency[]>({
    queryKey: ["task-deps", taskId],
    queryFn: () => api.get(`/tasks/${taskId}/dependencies`).then(r => r.data),
  });

  const { data: evidence } = useQuery<Evidence[]>({
    queryKey: ["evidence", taskId],
    queryFn: () => api.get(`/tasks/${taskId}/evidence`).then(r => r.data),
  });

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["task-approvals", taskId],
    queryFn: () =>
      api.get(`/pm/approvals/pending`)
        .then(r => (r.data as Approval[]).filter(a => a.task_id === taskId))
        .catch(() => [] as Approval[]),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/pm/tasks/${taskId}`, {
      name: editForm.name,
      phase: editForm.phase || null,
      planned_start: editForm.planned_start,
      planned_duration_days: parseInt(editForm.planned_duration_days),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      setEditing(false); setEditError(null);
    },
    onError: (err: any) => setEditError(err.response?.data?.error ?? "Update failed."),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!task) return <p className="text-sm text-gray-500 text-center py-10">Task not found.</p>;

  function startEdit() {
    setEditForm({
      name: task!.name,
      phase: task!.phase ?? "",
      planned_start: task!.planned_start,
      planned_duration_days: String(task!.planned_duration_days),
    });
    setEditing(true);
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold text-gray-900">{task.name}</h1>
            <StatusBadge status={task.status} />
            {task.is_critical && (
              <span className="text-xs text-red-600 font-medium">Critical path</span>
            )}
          </div>
          {task.phase && <p className="text-xs text-gray-400">Phase: {task.phase}</p>}
        </div>
        {!editing && (
          <button onClick={startEdit} className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900">
            Edit
          </button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="border border-gray-200 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Edit task</h2>
          {[
            { label: "Name", key: "name" as const },
            { label: "Phase", key: "phase" as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Planned start</label>
            <input type="date" value={editForm.planned_start}
              onChange={e => setEditForm(f => ({ ...f, planned_start: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Duration (days)</label>
            <input type="number" min="1" value={editForm.planned_duration_days}
              onChange={e => setEditForm(f => ({ ...f, planned_duration_days: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
          </div>
          {editError && <p className="text-xs text-red-600">{editError}</p>}
          <div className="flex gap-3">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
              className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </div>
      )}

      {/* Details table */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            ["Owner", task.owner_name ?? "—"],
            ["Planned start", task.planned_start],
            ["Duration", `${task.planned_duration_days} days`],
            ["Actual start", task.actual_start ?? "—"],
            ["Actual end", task.actual_end ?? "—"],
            ["Projected start", task.projected_start ?? "—"],
            ["Projected end", task.projected_end ?? "—"],
            ["Slack", `${task.slack_days} days`],
          ].map(([label, val]) => (
            <div key={label}>
              <dt className="text-xs text-gray-400">{label}</dt>
              <dd className="font-medium text-gray-800">{val}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Dependencies */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dependencies</h2>
        {(!deps || deps.length === 0) ? (
          <p className="text-xs text-gray-400">No dependencies.</p>
        ) : (
          <ul className="space-y-1 text-xs text-gray-600">
            {deps.map(d => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="text-gray-400">
                  {d.predecessor_task_id === taskId ? "→ successor:" : "← predecessor:"}
                </span>
                <span>{d.predecessor_task_id === taskId ? d.successor_task_id : d.predecessor_task_id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Evidence */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Evidence</h2>
        {(!evidence || evidence.length === 0) ? (
          <p className="text-xs text-gray-400">No evidence uploads.</p>
        ) : (
          <table className="w-full text-xs border border-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="text-left px-3 py-1.5 font-medium">Status</th>
                <th className="text-left px-3 py-1.5 font-medium">Distance</th>
                <th className="text-left px-3 py-1.5 font-medium">Uploaded by</th>
                <th className="text-left px-3 py-1.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map(ev => (
                <tr key={ev.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">
                    <span className={ev.geo_verified ? "text-green-600" : "text-orange-600"}>
                      {ev.geo_verified ? "Verified" : "Outside geofence"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{ev.distance_from_site_m?.toFixed(0)}m</td>
                  <td className="px-3 py-1.5 text-gray-500">{ev.uploaded_by_name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-400">{ev.captured_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Approvals */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approval history</h2>
        {(!approvals || approvals.length === 0) ? (
          <p className="text-xs text-gray-400">No approval requests.</p>
        ) : (
          <ul className="space-y-2">
            {approvals.map(a => (
              <li key={a.id} className="flex items-center gap-3 text-xs">
                <StatusBadge status={a.decision} />
                <span className="text-gray-500">by {a.requested_by_name ?? "—"}</span>
                <span className="text-gray-400">{a.requested_at?.slice(0, 10)}</span>
                {a.remarks && <span className="text-gray-600 italic">{a.remarks}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
