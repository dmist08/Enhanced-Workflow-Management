'use client';
import { useMemo } from 'react';
import { Task, Dependency } from '@/lib/types';
import EmptyState from './EmptyState';

interface CriticalPathGraphProps {
  tasks: Task[];
  dependencies: Dependency[];
}

const NODE_W = 140;
const NODE_H = 50;
const H_GAP = 60;
const V_GAP = 20;
const PADDING = 24;

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// Assign topological levels using BFS
function computeLevels(tasks: Task[], deps: Dependency[]): Map<string, number> {
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    children.set(t.id, []);
  }

  for (const d of deps) {
    inDegree.set(d.successor_task_id, (inDegree.get(d.successor_task_id) ?? 0) + 1);
    children.get(d.predecessor_task_id)?.push(d.successor_task_id);
  }

  const queue: string[] = [];
  Array.from(inDegree.entries()).forEach(([id, deg]) => {
    if (deg === 0) queue.push(id);
  });

  const level = new Map<string, number>();
  while (queue.length) {
    const id = queue.shift()!;
    const lvl = level.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      const newLvl = lvl + 1;
      if (!level.has(child) || level.get(child)! < newLvl) {
        level.set(child, newLvl);
      }
      inDegree.set(child, inDegree.get(child)! - 1);
      if (inDegree.get(child) === 0) queue.push(child);
    }
    if (!level.has(id)) level.set(id, 0);
  }

  // Remaining (cycles) — place at end
  for (const t of tasks) {
    if (!level.has(t.id)) level.set(t.id, 0);
  }

  return level;
}

export default function CriticalPathGraph({ tasks, dependencies }: CriticalPathGraphProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks"
        description="Add tasks to see the dependency graph."
      />
    );
  }

  const { positions, svgWidth, svgHeight } = useMemo(() => {
    const levels = computeLevels(tasks, dependencies);

    // Group tasks by level
    const byLevel = new Map<number, Task[]>();
    for (const task of tasks) {
      const lvl = levels.get(task.id) ?? 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl)!.push(task);
    }

    const levelKeys = Array.from(byLevel.keys());
    const levelVals = Array.from(byLevel.values());
    const maxLevel = Math.max(...levelKeys);
    const maxColCount = Math.max(...levelVals.map((a) => a.length));

    const svgWidth = PADDING * 2 + (maxLevel + 1) * (NODE_W + H_GAP) - H_GAP;
    const svgHeight = PADDING * 2 + maxColCount * (NODE_H + V_GAP) - V_GAP;

    const positions = new Map<string, { x: number; y: number }>();
    Array.from(byLevel.entries()).forEach(([lvl, levelTasks]) => {
      const colX = PADDING + lvl * (NODE_W + H_GAP);
      levelTasks.forEach((task, idx) => {
        const colY = PADDING + idx * (NODE_H + V_GAP);
        positions.set(task.id, { x: colX, y: colY });
      });
    });

    return { positions, svgWidth, svgHeight };
  }, [tasks, dependencies]);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white p-2">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="block"
        style={{ minWidth: svgWidth, minHeight: svgHeight }}
      >
        {/* Edges */}
        {dependencies.map((dep, i) => {
          const from = positions.get(dep.predecessor_task_id);
          const to = positions.get(dep.successor_task_id);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Arrowhead marker */}
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Nodes */}
        {tasks.map((task) => {
          const pos = positions.get(task.id);
          if (!pos) return null;
          return (
            <g key={task.id}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={task.is_critical ? '#fef2f2' : '#f8fafc'}
                stroke={task.is_critical ? '#f87171' : '#cbd5e1'}
                strokeWidth={task.is_critical ? 2 : 1.5}
              />
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + NODE_H / 2 - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={task.is_critical ? 600 : 400}
                fill={task.is_critical ? '#991b1b' : '#1e293b'}
              >
                {truncate(task.name, 15)}
              </text>
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + NODE_H / 2 + 10}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {task.status.replace(/_/g, ' ')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
