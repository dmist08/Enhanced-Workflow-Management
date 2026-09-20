import { Task } from "@/lib/types";
import StatusBadge from "./StatusBadge";

interface Props {
  task: Task;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`
        border bg-white p-4 text-sm cursor-pointer
        hover:bg-gray-50 transition-colors
        ${task.is_critical ? "border-red-300" : "border-gray-200"}
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-gray-900 leading-snug">{task.name}</p>
        <StatusBadge status={task.status} />
      </div>

      <div className="text-xs text-gray-400 space-y-0.5">
        {task.phase && <p>Phase: {task.phase}</p>}
        {task.owner_name && <p>Owner: {task.owner_name}</p>}
        <p>Start: {task.planned_start} · {task.planned_duration_days}d planned</p>
        {task.projected_end && <p>Projected end: {task.projected_end}</p>}
        <p>
          Slack: {task.slack_days}d
          {task.is_critical && <span className="ml-2 text-red-500 font-medium">Critical path</span>}
        </p>
      </div>
    </div>
  );
}
