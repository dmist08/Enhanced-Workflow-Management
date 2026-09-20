"""
Propagation Engine — Pure Function
===================================
Input:  tasks       list of task dicts (id, planned_start, planned_duration_days,
                    actual_start, actual_end, status, projected_start, projected_end)
        dependencies list of dep dicts (predecessor_task_id, successor_task_id)

Output: (updated_tasks, project_projected_end)
        updated_tasks has projected_start and projected_end set on every task.
        project_projected_end is the max projected_end across all sink tasks.

No DB calls inside this function — pass data in, get data out.
"""

from datetime import date, timedelta
from collections import defaultdict, deque
from typing import Any


def run_propagation(
    tasks: list[dict[str, Any]],
    dependencies: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], date | None]:
    """
    Topologically sort tasks (Kahn's algorithm) then compute projected_start
    and projected_end in topological order.

    Returns (updated_tasks_list, project_projected_end).
    Raises ValueError if a cycle is detected (should never happen if cycle
    detection at POST /dependencies is working, but guarded here too).
    """
    if not tasks:
        return [], None

    task_map: dict[str, dict] = {t["id"]: dict(t) for t in tasks}

    # Build adjacency structures
    successors: dict[str, list[str]] = defaultdict(list)   # pred → [succ]
    predecessors: dict[str, list[str]] = defaultdict(list) # succ → [pred]
    in_degree: dict[str, int] = {t["id"]: 0 for t in tasks}

    for dep in dependencies:
        pred = dep["predecessor_task_id"]
        succ = dep["successor_task_id"]
        successors[pred].append(succ)
        predecessors[succ].append(pred)
        in_degree[succ] += 1

    # Kahn's topological sort
    queue: deque[str] = deque(
        tid for tid, deg in in_degree.items() if deg == 0
    )
    topo_order: list[str] = []

    while queue:
        tid = queue.popleft()
        topo_order.append(tid)
        for succ in successors[tid]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)

    if len(topo_order) != len(tasks):
        raise ValueError("Cycle detected in task dependency graph.")

    # Forward pass: compute projected_start and projected_end
    for tid in topo_order:
        t = task_map[tid]
        planned_start: date = _parse_date(t["planned_start"])

        # projected_start = max(planned_start, max(projected_end of all predecessors))
        pred_ends: list[date] = []
        for pred_id in predecessors[tid]:
            pe = task_map[pred_id].get("projected_end")
            if pe:
                pred_ends.append(_parse_date(pe))

        projected_start = planned_start
        if pred_ends:
            latest_pred_end = max(pred_ends)
            if latest_pred_end > planned_start:
                projected_start = latest_pred_end

        # projected_end
        if t.get("status") == "COMPLETED" and t.get("actual_end"):
            # Completed tasks use actual_end as ground truth (early finish propagates too)
            projected_end = _parse_date(t["actual_end"])
        else:
            duration = t["planned_duration_days"]
            projected_end = projected_start + timedelta(days=duration)

        task_map[tid]["projected_start"] = projected_start.isoformat()
        task_map[tid]["projected_end"] = projected_end.isoformat()

    updated_tasks = list(task_map.values())

    # Project projected_end = max(projected_end) across all sink tasks (no successors)
    successor_ids = {dep["successor_task_id"] for dep in dependencies}
    sink_ids = {t["id"] for t in tasks} - successor_ids
    # Actually: sink = tasks with no outgoing edges (no successors)
    has_successor = set()
    for dep in dependencies:
        has_successor.add(dep["predecessor_task_id"])
    sink_tasks = [t for t in updated_tasks if t["id"] not in has_successor]

    project_projected_end: date | None = None
    if sink_tasks:
        project_projected_end = max(
            _parse_date(t["projected_end"]) for t in sink_tasks if t.get("projected_end")
        )

    return updated_tasks, project_projected_end


def _parse_date(val) -> date:
    """Accept date object or ISO string."""
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val))


# ---------------------------------------------------------------------------
# Cycle detection — called at POST /dependencies BEFORE insert
# ---------------------------------------------------------------------------

def has_cycle_after_add(
    existing_deps: list[dict[str, Any]],
    new_predecessor: str,
    new_successor: str,
    all_task_ids: list[str],
) -> tuple[bool, list[str]]:
    """
    Returns (True, cycle_path) if adding new_predecessor→new_successor would
    create a cycle. Returns (False, []) if safe to insert.

    Uses DFS from new_successor; if we can reach new_predecessor, it's a cycle.
    """
    adj: dict[str, list[str]] = defaultdict(list)
    for dep in existing_deps:
        adj[dep["predecessor_task_id"]].append(dep["successor_task_id"])
    # Tentatively add the new edge
    adj[new_predecessor].append(new_successor)

    # DFS from new_successor — can we reach new_predecessor?
    visited: set[str] = set()
    path: list[str] = []

    def dfs(node: str) -> bool:
        if node == new_predecessor:
            path.append(node)
            return True
        if node in visited:
            return False
        visited.add(node)
        path.append(node)
        for neighbor in adj[node]:
            if dfs(neighbor):
                return True
        path.pop()
        return False

    cycle_found = dfs(new_successor)
    if cycle_found:
        return True, [new_predecessor] + path
    return False, []


# ---------------------------------------------------------------------------
# Manual test — 5-task hand-computed case
# Run: python -m app.engines.propagation
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Task layout:
    # T1 (5 days, start 2026-01-01) → T3
    # T2 (3 days, start 2026-01-01) → T3
    # T3 (4 days) → T4
    # T4 (2 days) → T5
    # T5 (1 day)
    #
    # Hand computation:
    # T1: projected_start=Jan1, projected_end=Jan6
    # T2: projected_start=Jan1, projected_end=Jan4
    # T3: projected_start=max(Jan1,Jan6,Jan4)=Jan6, projected_end=Jan10
    # T4: projected_start=Jan10, projected_end=Jan12
    # T5: projected_start=Jan12, projected_end=Jan13

    tasks = [
        {"id": "T1", "planned_start": "2026-01-01", "planned_duration_days": 5,
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T2", "planned_start": "2026-01-01", "planned_duration_days": 3,
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T3", "planned_start": "2026-01-01", "planned_duration_days": 4,
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T4", "planned_start": "2026-01-01", "planned_duration_days": 2,
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T5", "planned_start": "2026-01-01", "planned_duration_days": 1,
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
    ]
    deps = [
        {"predecessor_task_id": "T1", "successor_task_id": "T3"},
        {"predecessor_task_id": "T2", "successor_task_id": "T3"},
        {"predecessor_task_id": "T3", "successor_task_id": "T4"},
        {"predecessor_task_id": "T4", "successor_task_id": "T5"},
    ]

    updated, proj_end = run_propagation(tasks, deps)
    tm = {t["id"]: t for t in updated}

    assert tm["T1"]["projected_end"] == "2026-01-06", f"T1 fail: {tm['T1']['projected_end']}"
    assert tm["T2"]["projected_end"] == "2026-01-04", f"T2 fail: {tm['T2']['projected_end']}"
    assert tm["T3"]["projected_start"] == "2026-01-06", f"T3 start fail: {tm['T3']['projected_start']}"
    assert tm["T3"]["projected_end"] == "2026-01-10", f"T3 end fail: {tm['T3']['projected_end']}"
    assert tm["T4"]["projected_start"] == "2026-01-10", f"T4 start fail: {tm['T4']['projected_start']}"
    assert tm["T4"]["projected_end"] == "2026-01-12", f"T4 end fail: {tm['T4']['projected_end']}"
    assert tm["T5"]["projected_end"] == "2026-01-13", f"T5 fail: {tm['T5']['projected_end']}"
    assert proj_end == date(2026, 1, 13), f"proj_end fail: {proj_end}"

    # Test cycle detection
    cycle, path = has_cycle_after_add(deps, "T5", "T1", ["T1","T2","T3","T4","T5"])
    assert cycle, "Cycle T5→T1 should be detected"

    # Test self-reference
    cycle2, _ = has_cycle_after_add(deps, "T3", "T3", ["T1","T2","T3","T4","T5"])
    assert cycle2, "Self-reference T3→T3 should be detected"

    print("✅ All propagation engine tests passed.")
