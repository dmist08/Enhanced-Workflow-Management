"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Task } from "@/lib/types";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import TaskCard from "@/components/TaskCard";

export default function ContractorDashboard() {
  const router = useRouter();

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["my-tasks"],
    queryFn: () => api.get("/me/tasks").then(r => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  const byStatus: Record<string, Task[]> = {};
  (tasks ?? []).forEach(t => {
    if (!byStatus[t.status]) byStatus[t.status] = [];
    byStatus[t.status].push(t);
  });
  const statusOrder = ["IN_PROGRESS", "BLOCKED", "NOT_STARTED", "COMPLETED"];

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold text-gray-900">My tasks</h1>
      {(!tasks || tasks.length === 0) ? (
        <EmptyState title="No tasks assigned" description="No tasks have been assigned to you yet." />
      ) : (
        statusOrder.map(status => {
          const group = byStatus[status];
          if (!group?.length) return null;
          return (
            <section key={status}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                {status.replace(/_/g, " ")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => router.push(`/contractor/tasks/${task.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
