"use client";
import { Task } from "@/lib/types";
import EmptyState from "./EmptyState";

interface Props { tasks: Task[] }

export default function GanttChart({ tasks }: Props) {
  if (!tasks || tasks.length === 0) {
    return <EmptyState title="No tasks" description="Add tasks to see the Gantt chart." />;
  }

  // Find the overall date range
  const allDates = tasks.flatMap(t => [
    t.planned_start,
    t.projected_end ?? t.planned_start,
  ]).filter(Boolean).map(d => new Date(d!).getTime());

  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000)) + 10;

  const ROW_H = 32;
  const LABEL_W = 180;
  const BAR_AREA_W = 600;
  const SVG_W = LABEL_W + BAR_AREA_W + 8;
  const SVG_H = tasks.length * ROW_H + 28;

  function dayOffset(dateStr: string) {
    return Math.floor((new Date(dateStr).getTime() - minDate) / 86400000);
  }

  function toX(dayOff: number) {
    return LABEL_W + (dayOff / totalDays) * BAR_AREA_W;
  }

  return (
    <div className="overflow-x-auto border border-gray-200">
      <svg width={SVG_W} height={SVG_H} className="font-sans">
        {/* Background rows */}
        {tasks.map((_, i) => (
          <rect key={i} x={0} y={i * ROW_H + 24} width={SVG_W} height={ROW_H}
            fill={i % 2 === 0 ? "#fff" : "#f9fafb"} />
        ))}

        {/* Task rows */}
        {tasks.map((task, i) => {
          const y = i * ROW_H + 24;
          const plannedStart = dayOffset(task.planned_start);
          const plannedEnd = plannedStart + task.planned_duration_days;
          const projEnd = task.projected_end
            ? dayOffset(task.projected_end)
            : plannedEnd;

          const barY = y + 8;
          const barH = ROW_H - 16;
          const isLate = projEnd > plannedEnd;

          return (
            <g key={task.id}>
              {/* Label */}
              <text x={4} y={y + ROW_H / 2 + 4} fontSize={10} fill={task.is_critical ? "#dc2626" : "#374151"}>
                {task.name.length > 22 ? task.name.slice(0, 22) + "…" : task.name}
              </text>

              {/* Planned bar (blue/gray) */}
              <rect
                x={toX(plannedStart)}
                y={barY}
                width={Math.max(2, toX(plannedEnd) - toX(plannedStart))}
                height={barH}
                fill={task.is_critical ? "#fca5a5" : "#d1d5db"}
              />

              {/* Projected bar (shown only if late) */}
              {isLate && (
                <rect
                  x={toX(plannedEnd)}
                  y={barY}
                  width={Math.max(2, toX(projEnd) - toX(plannedEnd))}
                  height={barH}
                  fill="#f97316"
                  opacity={0.7}
                />
              )}

              {/* Horizontal line separating rows */}
              <line x1={0} y1={y + ROW_H} x2={SVG_W} y2={y + ROW_H} stroke="#e5e7eb" strokeWidth={0.5} />
            </g>
          );
        })}

        {/* Legend */}
        <rect x={LABEL_W + 4} y={6} width={12} height={8} fill="#d1d5db" />
        <text x={LABEL_W + 20} y={14} fontSize={9} fill="#6b7280">Planned</text>
        <rect x={LABEL_W + 70} y={6} width={12} height={8} fill="#f97316" />
        <text x={LABEL_W + 86} y={14} fontSize={9} fill="#6b7280">Delay</text>
        <rect x={LABEL_W + 120} y={6} width={12} height={8} fill="#fca5a5" />
        <text x={LABEL_W + 136} y={14} fontSize={9} fill="#6b7280">Critical</text>
      </svg>
    </div>
  );
}
