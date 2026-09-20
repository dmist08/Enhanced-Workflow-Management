"""
Critical Path Engine — Pure Function
======================================
Input:  tasks       list of task dicts (must already have projected_start /
                    projected_end set by run_propagation)
        dependencies list of dep dicts
        project_planned_end  date — the project's original planned end date

Output: updated_tasks with is_critical (bool) and slack_days (int) set.

Algorithm: CPM forward pass + backward pass.
No DB calls inside this function.
"""

from datetime import date, timedelta
from collections import defaultdict, deque
from typing import Any


def run_critical_path(
    tasks: list[dict[str, Any]],
    dependencies: list[dict[str, Any]],
    project_planned_end: date,
) -> list[dict[str, Any]]:
    """
    Forward pass computes ES (earliest start) / EF (earliest finish).
    Backward pass computes LS (latest start) / LF (latest finish).
    slack_days = LS - ES.
    is_critical = (slack_days == 0).

    Multiple parallel critical paths (slack=0 on more than one chain) are
    valid and all marked.
    """
    if not tasks:
        return []

    task_map: dict[str, dict] = {t["id"]: dict(t) for t in tasks}

    successors: dict[str, list[str]] = defaultdict(list)
    predecessors: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {t["id"]: 0 for t in tasks}

    for dep in dependencies:
        pred = dep["predecessor_task_id"]
        succ = dep["successor_task_id"]
        successors[pred].append(succ)
        predecessors[succ].append(pred)
        in_degree[succ] += 1

    # Kahn's topo sort (forward)
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

    # --- Forward pass ---
    earliest_start: dict[str, date] = {}
    earliest_finish: dict[str, date] = {}

    for tid in topo_order:
        t = task_map[tid]
        planned_start = _parse_date(t["planned_start"])
        duration = t["planned_duration_days"]

        pred_efs = [
            earliest_finish[p] for p in predecessors[tid] if p in earliest_finish
        ]
        es = max([planned_start] + pred_efs) if pred_efs else planned_start
        ef = es + timedelta(days=duration)

        earliest_start[tid] = es
        earliest_finish[tid] = ef

    # --- Backward pass ---
    latest_finish: dict[str, date] = {}
    latest_start: dict[str, date] = {}

    # Sink tasks: no outgoing edges
    has_successor = {dep["predecessor_task_id"] for dep in dependencies}
    sink_ids = [t["id"] for t in tasks if t["id"] not in has_successor]

    for tid in reversed(topo_order):
        t = task_map[tid]
        duration = t["planned_duration_days"]

        succ_lss = [
            latest_start[s] for s in successors[tid] if s in latest_start
        ]
        if not succ_lss:
            # Sink task: LF = project planned_end
            lf = project_planned_end
        else:
            lf = min(succ_lss)

        ls = lf - timedelta(days=duration)

        latest_finish[tid] = lf
        latest_start[tid] = ls

    # --- Slack + critical flag ---
    for tid in topo_order:
        slack = (latest_start[tid] - earliest_start[tid]).days
        task_map[tid]["slack_days"] = slack
        task_map[tid]["is_critical"] = slack == 0

    return list(task_map.values())


def _parse_date(val) -> date:
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val))


# ---------------------------------------------------------------------------
# Self-test — same 5-task topology as propagation test
# Run: python -m app.engines.critical_path
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # T1(5)→T3(4)→T4(2)→T5(1)
    # T2(3)→T3
    # project_planned_end = 2026-01-13
    # From propagation: T1 EF=Jan6, T2 EF=Jan4, T3 EF=Jan10, T4 EF=Jan12, T5 EF=Jan13
    # Backward pass (from Jan13):
    # T5: LF=Jan13, LS=Jan12, slack=0 → critical
    # T4: LF=Jan12, LS=Jan10, slack=0 → critical
    # T3: LF=Jan10, LS=Jan6,  slack=0 → critical
    # T1: LF=Jan6,  LS=Jan1,  slack=0 → critical
    # T2: LF=Jan6,  LS=Jan3,  slack=2 → NOT critical

    tasks = [
        {"id": "T1", "planned_start": "2026-01-01", "planned_duration_days": 5,
         "projected_start": "2026-01-01", "projected_end": "2026-01-06",
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T2", "planned_start": "2026-01-01", "planned_duration_days": 3,
         "projected_start": "2026-01-01", "projected_end": "2026-01-04",
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T3", "planned_start": "2026-01-01", "planned_duration_days": 4,
         "projected_start": "2026-01-06", "projected_end": "2026-01-10",
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T4", "planned_start": "2026-01-01", "planned_duration_days": 2,
         "projected_start": "2026-01-10", "projected_end": "2026-01-12",
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
        {"id": "T5", "planned_start": "2026-01-01", "planned_duration_days": 1,
         "projected_start": "2026-01-12", "projected_end": "2026-01-13",
         "actual_start": None, "actual_end": None, "status": "NOT_STARTED"},
    ]
    deps = [
        {"predecessor_task_id": "T1", "successor_task_id": "T3"},
        {"predecessor_task_id": "T2", "successor_task_id": "T3"},
        {"predecessor_task_id": "T3", "successor_task_id": "T4"},
        {"predecessor_task_id": "T4", "successor_task_id": "T5"},
    ]

    from datetime import date as dt
    result = run_critical_path(tasks, deps, dt(2026, 1, 13))
    tm = {t["id"]: t for t in result}

    assert tm["T1"]["is_critical"] is True,  f"T1 should be critical"
    assert tm["T2"]["is_critical"] is False, f"T2 should NOT be critical, slack={tm['T2']['slack_days']}"
    assert tm["T3"]["is_critical"] is True,  f"T3 should be critical"
    assert tm["T4"]["is_critical"] is True,  f"T4 should be critical"
    assert tm["T5"]["is_critical"] is True,  f"T5 should be critical"
    assert tm["T2"]["slack_days"] == 2, f"T2 slack should be 2, got {tm['T2']['slack_days']}"

    print("✅ All critical path engine tests passed.")
