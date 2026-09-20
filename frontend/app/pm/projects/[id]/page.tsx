"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task, Project, Dependency, Attribution, User } from "@/lib/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AttributionBanner from "@/components/AttributionBanner";
import TaskCard from "@/components/TaskCard";
import CriticalPathGraph from "@/components/CriticalPathGraph";
import GanttChart from "@/components/GanttChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";

interface Props { params: { id: string } }

type Tab = "list" | "graph" | "gantt";

export default function PMProjectPage({ params }: Props) {
  const qc = useQueryClient();
  const router = useRouter();
  const projectId = params.id;
  const [tab, setTab] = useState<Tab>("list");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDepModal, setShowDepModal] = useState<string | null>(null); // task id
  const [taskForm, setTaskForm] = useState({ name: "", phase: "", owner_id: "", planned_start: "", planned_duration_days: "7" });
  const [depPredecessorId, setDepPredecessorId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: project, isLoading: projLoading } = useQuery<Project>({
    queryKey: ["pm-project", projectId],
    queryFn: () => api.get(`/pm/projects/${projectId}`).then(r => r.data),
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["project-tasks", projectId],
    queryFn: () => api.get(`/projects/${projectId}/tasks`).then(r => r.data),
  });

  const { data: cpData } = useQuery<{ tasks: Task[]; dependencies: Dependency[]; critical_tasks: Task[] }>({
    queryKey: ["critical-path", projectId],
    queryFn: () => api.get(`/projects/${projectId}/critical-path`).then(r => r.data),
  });

  const { data: attribution } = useQuery<Attribution | null>({
    queryKey: ["attribution", projectId],
    queryFn: () => api.get(`/projects/${projectId}/attribution`).then(r => r.data),
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/admin/users").then(r => r.data),
  });

  const createTask = useMutation({
    mutationFn: () => api.post(`/pm/projects/${projectId}/tasks`, {
      ...taskForm,
      planned_duration_days: parseInt(taskForm.planned_duration_days),
      owner_id: taskForm.owner_id || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["critical-path", projectId] });
      setShowTaskModal(false); setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error ?? "Failed to create task."),
  });

  const addDep = useMutation({
    mutationFn: () => api.post(`/pm/tasks/${showDepModal}/dependencies`, { predecessor_task_id: depPredecessorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["critical-path", projectId] });
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      setShowDepModal(null); setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error ?? "Failed to add dependency."),
  });

  if (projLoading || tasksLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!project) return <p className="text-sm text-gray-500 text-center py-10">Project not found.</p>;

  const isLate = project.projected_end && project.projected_end > project.planned_end;
  const daysLate = isLate
    ? Math.round((new Date(project.projected_end!).getTime() - new Date(project.planned_end).getTime()) / 86400000)
    : 0;

  return (
    <div className="space-y-6">
      {/* Attribution banner */}
      <AttributionBanner attribution={attribution ?? null} />

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={project.status} />
            <span className="text-xs text-gray-400">Planned end: {project.planned_end}</span>
            {isLate ? (
              <span className="text-xs font-medium text-red-600">
                Projected: {project.projected_end} ({daysLate}d late)
              </span>
            ) : (
              <span className="text-xs text-gray-400">Projected: {project.projected_end ?? "—"}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => { setTaskForm({ name: "", phase: "", owner_id: "", planned_start: "", planned_duration_days: "7" }); setShowTaskModal(true); }}
          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
        >
          Add task
        </button>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 flex gap-6">
        {(["list", "graph", "gantt"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
          >
            {t === "list" ? "Task list" : t === "graph" ? "Dependency graph" : "Gantt chart"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "list" && (
        <>
          {(!tasks || tasks.length === 0) ? (
            <EmptyState title="No tasks" description="Add the first task to this project." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map(task => (
                <div key={task.id} className="relative group">
                  <TaskCard
                    task={task}
                    onClick={() => router.push(`/pm/projects/${projectId}/tasks/${task.id}`)}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); setDepPredecessorId(""); setShowDepModal(task.id); setFormError(null); }}
                    className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    + dep
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "graph" && (
        <CriticalPathGraph
          tasks={cpData?.tasks ?? []}
          dependencies={cpData?.dependencies ?? []}
        />
      )}

      {tab === "gantt" && <GanttChart tasks={tasks ?? []} />}

      {/* Add task modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-900">New task</h2>
              <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Name *", key: "name" as const },
                { label: "Phase", key: "phase" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input value={taskForm[key]} onChange={e => setTaskForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                <select value={taskForm.owner_id} onChange={e => setTaskForm(f => ({ ...f, owner_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600">
                  <option value="">— None —</option>
                  {(users ?? []).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Planned start *</label>
                <input type="date" value={taskForm.planned_start} onChange={e => setTaskForm(f => ({ ...f, planned_start: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Duration (days) *</label>
                <input type="number" min="1" value={taskForm.planned_duration_days}
                  onChange={e => setTaskForm(f => ({ ...f, planned_duration_days: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600" />
              </div>
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => createTask.mutate()} disabled={createTask.isPending}
                className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {createTask.isPending ? "Creating…" : "Create task"}
              </button>
              <button onClick={() => setShowTaskModal(false)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add dependency modal */}
      {showDepModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-900">Add dependency</h2>
              <button onClick={() => setShowDepModal(null)} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Select which task must complete <strong>before</strong> this one starts.</p>
            <select
              value={depPredecessorId}
              onChange={e => setDepPredecessorId(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
            >
              <option value="">— Select predecessor —</option>
              {(tasks ?? []).filter(t => t.id !== showDepModal).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => addDep.mutate()} disabled={!depPredecessorId || addDep.isPending}
                className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {addDep.isPending ? "Adding…" : "Add dependency"}
              </button>
              <button onClick={() => setShowDepModal(null)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
