"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import EmptyState from "@/components/EmptyState";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation";

export default function SEDashboard() {
  const router = useRouter();
  const { data: tasks, isLoading, error } = useQuery<Task[]>({
    queryKey: ["my-tasks"],
    queryFn: () => api.get("/me/tasks").then(r => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <p className="text-red-600 text-center py-10">Failed to load tasks.</p>;

  const byStatus: Record<string, Task[]> = {};
  (tasks || []).forEach(t => {
    if (!byStatus[t.status]) byStatus[t.status] = [];
    byStatus[t.status].push(t);
  });

  const statusOrder = ["IN_PROGRESS", "BLOCKED", "NOT_STARTED", "COMPLETED"];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Tasks</h1>
      {(!tasks || tasks.length === 0) ? (
        <EmptyState
          title="No tasks assigned"
          description="No tasks have been assigned to you yet. Contact your project manager."
        />
      ) : (
        <div className="space-y-8">
          {statusOrder.map(status => {
            const group = byStatus[status];
            if (!group || group.length === 0) return null;
            return (
              <section key={status}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  {status.replace("_", " ")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => router.push(`/se/tasks/${task.id}`)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
