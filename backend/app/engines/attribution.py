"""
Attribution Engine — Pure Function
====================================
Runs on demand to name the root cause of a project delay.

Input:
  critical_tasks   list of task dicts (is_critical=True), with projected_end,
                   planned_duration_days, actual_start, actual_end, status, etc.
  approvals        list of approval dicts for tasks in the critical path
  escalation_rules list of rule dicts (condition_key, threshold)
  project_planned_end  date

Output: dict | None
  {
    task_id, task_name, owner_id, owner_name,
    cause_type,   # "task_overrun" | "approval_bottleneck" | "unattributed"
    days_late,
    since_date,
    sentence,     # human-readable one-liner for the UI banner
  }
  Returns None if project is not late.

Priority: task_overrun > approval_bottleneck (spec §4.3).
"""

from datetime import date, timedelta
from typing import Any


def run_attribution(
    critical_tasks: list[dict[str, Any]],
    approvals: list[dict[str, Any]],
    escalation_rules: list[dict[str, Any]],
    project_planned_end: date,
) -> dict[str, Any] | None:
    """
    Walk critical path backward (latest projected_end first).
    Return first match or unattributed if nothing matches.
    Return None if project is currently on time.
    """
    if not critical_tasks:
        return None

    # Check if project is actually late
    max_proj_end = max(
        _parse_date(t["projected_end"]) for t in critical_tasks if t.get("projected_end")
    )
    if max_proj_end <= project_planned_end:
        return None  # No delay detected

    days_late = (max_proj_end - project_planned_end).days

    # Find approval_pending_days threshold from rules
    approval_threshold = 3.0  # default from spec seed
    for rule in escalation_rules:
        if rule["condition_key"] == "approval_pending_days":
            approval_threshold = float(rule["threshold"])
            break

    # Build approval lookup: task_id → list of pending approvals
    pending_approvals: dict[str, list[dict]] = {}
    for appr in approvals:
        if appr.get("decision") == "PENDING":
            tid = appr["task_id"]
            if tid not in pending_approvals:
                pending_approvals[tid] = []
            pending_approvals[tid].append(appr)

    # Sort critical tasks by projected_end descending (latest first)
    sorted_tasks = sorted(
        [t for t in critical_tasks if t.get("projected_end")],
        key=lambda t: _parse_date(t["projected_end"]),
        reverse=True,
    )

    today = date.today()

    for task in sorted_tasks:
        tid = task["id"]

        # --- Check task overrun (priority 1) ---
        actual_end = task.get("actual_end")
        actual_start = task.get("actual_start")
        planned_duration = task.get("planned_duration_days", 0)

        if actual_start and actual_end:
            actual_duration = (_parse_date(actual_end) - _parse_date(actual_start)).days
            if actual_duration > planned_duration:
                overrun_days = actual_duration - planned_duration
                return _result(
                    task=task,
                    cause_type="task_overrun",
                    days_late=days_late,
                    since_date=_parse_date(actual_start) + timedelta(days=planned_duration),
                    detail=f"overran by {overrun_days} days",
                )

        # --- Check approval bottleneck (priority 2) ---
        task_approvals = pending_approvals.get(tid, [])
        for appr in task_approvals:
            requested_at = _parse_datetime(appr.get("requested_at"))
            if requested_at:
                pending_days = (today - requested_at).days
                if pending_days >= approval_threshold:
                    return _result(
                        task=task,
                        cause_type="approval_bottleneck",
                        days_late=days_late,
                        since_date=requested_at,
                        detail=f"approval pending {pending_days} days",
                    )

    # Nothing attributable found
    return {
        "task_id": None,
        "task_name": None,
        "owner_id": None,
        "owner_name": None,
        "cause_type": "unattributed",
        "days_late": days_late,
        "since_date": None,
        "sentence": (
            f"Projected {days_late} day{'s' if days_late != 1 else ''} late. "
            "Root cause: unattributed (planned dates may have been incorrect)."
        ),
    }


def _result(task, cause_type, days_late, since_date, detail):
    name = task.get("name", "Unknown task")
    owner = task.get("owner_name", "Unknown owner")
    sentence = (
        f"Projected {days_late} day{'s' if days_late != 1 else ''} late. "
        f"Root cause: {name} ({owner}), {cause_type.replace('_', ' ')} since {since_date}."
    )
    return {
        "task_id": task["id"],
        "task_name": name,
        "owner_id": task.get("owner_id"),
        "owner_name": owner,
        "cause_type": cause_type,
        "days_late": days_late,
        "since_date": since_date.isoformat() if hasattr(since_date, "isoformat") else str(since_date),
        "sentence": sentence,
    }


def _parse_date(val) -> date:
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def _parse_datetime(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except ValueError:
        return None
