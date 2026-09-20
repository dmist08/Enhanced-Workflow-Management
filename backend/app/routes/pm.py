"""
PM routes — Project Manager (and Admin) actions.
Ownership enforced: PM can only manage their own projects.
"""
from flask import Blueprint, request, g
from datetime import date, datetime, timezone
from ..extensions import db
from ..models import Project, Task, Dependency, Approval, User
from ..middleware.auth import require_auth
from ..utils.errors import bad_request, not_found, forbidden, conflict, ok
from ..engines.propagation import run_propagation, has_cycle_after_add
from ..engines.critical_path import run_critical_path
from ..engines.attribution import run_attribution

pm_bp = Blueprint("pm", __name__)

PM_ROLES = ["ADMIN", "PROJECT_MANAGER"]


def _get_project_for_pm(project_id: str):
    """Fetch project and enforce PM ownership (Admin bypasses)."""
    project = Project.query.get(project_id)
    if not project:
        return None, not_found("Project not found.")
    if g.user["role"] == "PROJECT_MANAGER" and project.manager_id != g.user["id"]:
        return None, forbidden()
    return project, None


# ─── PM dashboard ────────────────────────────────────────────────────────────

@pm_bp.route("/pm/projects", methods=["GET"])
@require_auth(PM_ROLES)
def pm_list_projects():
    if g.user["role"] == "ADMIN":
        projects = Project.query.order_by(Project.created_at.desc()).all()
    else:
        projects = Project.query.filter_by(manager_id=g.user["id"])\
                                .order_by(Project.created_at.desc()).all()
    return ok([p.to_dict() for p in projects])


@pm_bp.route("/pm/projects/<project_id>", methods=["GET"])
@require_auth(PM_ROLES)
def pm_get_project(project_id):
    project, err = _get_project_for_pm(project_id)
    if err:
        return err
    return ok(project.to_dict())


# ─── Tasks ───────────────────────────────────────────────────────────────────

@pm_bp.route("/pm/projects/<project_id>/tasks", methods=["POST"])
@require_auth(PM_ROLES)
def create_task(project_id):
    project, err = _get_project_for_pm(project_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    required = ["name", "planned_start", "planned_duration_days"]
    for field in required:
        if field not in data or data[field] is None:
            return bad_request(f"{field} is required.", field=field)

    owner_id = data.get("owner_id")
    if owner_id and not User.query.get(owner_id):
        return not_found("owner_id does not reference a valid user.")

    try:
        task = Task(
            project_id=project_id,
            name=data["name"].strip(),
            phase=data.get("phase"),
            owner_id=owner_id,
            planned_start=date.fromisoformat(data["planned_start"]),
            planned_duration_days=int(data["planned_duration_days"]),
            status=data.get("status", "NOT_STARTED"),
        )
        db.session.add(task)
        db.session.flush()  # get task.id before commit

        # Run propagation to initialise projected dates
        _run_and_save_engines(project)

        db.session.commit()
        return ok(task.to_dict(), 201)
    except (ValueError, TypeError) as e:
        db.session.rollback()
        return bad_request(str(e))


@pm_bp.route("/pm/tasks/<task_id>", methods=["PATCH"])
@require_auth(PM_ROLES)
def update_task_meta(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    project, err = _get_project_for_pm(task.project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}

    # Strip engine-computed fields silently (spec requirement)
    for field in ["projected_start", "projected_end", "is_critical", "slack_days"]:
        data.pop(field, None)

    allowed = ["name", "phase", "owner_id", "planned_start", "planned_duration_days"]
    for field in allowed:
        if field in data:
            if field in ["planned_start"] and data[field]:
                setattr(task, field, date.fromisoformat(data[field]))
            elif field == "planned_duration_days" and data[field] is not None:
                setattr(task, field, int(data[field]))
            else:
                setattr(task, field, data[field])

    if "owner_id" in data and data["owner_id"]:
        if not User.query.get(data["owner_id"]):
            return not_found("owner_id does not reference a valid user.")

    _run_and_save_engines(project)
    db.session.commit()
    return ok(task.to_dict())


# ─── Dependencies ─────────────────────────────────────────────────────────────

@pm_bp.route("/pm/tasks/<task_id>/dependencies", methods=["POST"])
@require_auth(PM_ROLES)
def add_dependency(task_id):
    successor_task = Task.query.get(task_id)
    if not successor_task:
        return not_found("Task not found.")

    project, err = _get_project_for_pm(successor_task.project_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    predecessor_id = data.get("predecessor_task_id")
    if not predecessor_id:
        return bad_request("predecessor_task_id is required.", field="predecessor_task_id")

    # Self-reference check
    if predecessor_id == task_id:
        return bad_request("A task cannot depend on itself.", field="predecessor_task_id")

    predecessor_task = Task.query.get(predecessor_id)
    if not predecessor_task:
        return not_found("predecessor_task_id does not reference a valid task.")

    # Both tasks must belong to the same project
    if predecessor_task.project_id != successor_task.project_id:
        return bad_request("Both tasks must belong to the same project.")

    # Cycle detection BEFORE insert
    existing_deps = [
        {"predecessor_task_id": d.predecessor_task_id, "successor_task_id": d.successor_task_id}
        for d in Dependency.query.filter_by().all()
        if d.predecessor_task_id in {t.id for t in project.tasks}
    ]
    all_task_ids = [t.id for t in project.tasks]

    cycle, cycle_path = has_cycle_after_add(
        existing_deps, predecessor_id, task_id, all_task_ids
    )
    if cycle:
        return bad_request(
            f"Adding this dependency would create a cycle: {' → '.join(cycle_path)}",
        )

    # Check for duplicate
    existing = Dependency.query.filter_by(
        predecessor_task_id=predecessor_id,
        successor_task_id=task_id,
    ).first()
    if existing:
        return bad_request("This dependency already exists.")

    dep = Dependency(
        predecessor_task_id=predecessor_id,
        successor_task_id=task_id,
    )
    db.session.add(dep)
    db.session.flush()

    _run_and_save_engines(project)
    db.session.commit()
    return ok(dep.to_dict(), 201)


@pm_bp.route("/pm/tasks/<task_id>/dependencies/<dep_id>", methods=["DELETE"])
@require_auth(PM_ROLES)
def delete_dependency(task_id, dep_id):
    dep = Dependency.query.get(dep_id)
    if not dep:
        return not_found("Dependency not found.")
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")
    project, err = _get_project_for_pm(task.project_id)
    if err:
        return err
    db.session.delete(dep)
    _run_and_save_engines(project)
    db.session.commit()
    return ok({"message": "Dependency removed."})


# ─── Approvals ────────────────────────────────────────────────────────────────

@pm_bp.route("/pm/approvals/pending", methods=["GET"])
@require_auth(PM_ROLES)
def pending_approvals():
    if g.user["role"] == "ADMIN":
        approvals = Approval.query.filter_by(decision="PENDING").all()
    else:
        # Only approvals for tasks in PM's own projects
        approvals = (
            Approval.query
            .join(Task, Approval.task_id == Task.id)
            .join(Project, Task.project_id == Project.id)
            .filter(Project.manager_id == g.user["id"], Approval.decision == "PENDING")
            .all()
        )
    return ok([a.to_dict() for a in approvals])


@pm_bp.route("/approvals/<approval_id>/decide", methods=["PATCH"])
@require_auth(PM_ROLES)
def decide_approval(approval_id):
    approval = Approval.query.get(approval_id)
    if not approval:
        return not_found("Approval not found.")

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    decision = data.get("decision")
    if decision not in ("APPROVED", "REJECTED"):
        return bad_request("decision must be 'APPROVED' or 'REJECTED'.", field="decision")

    approval.decision = decision
    approval.decided_at = datetime.now(tz=timezone.utc)
    approval.approver_id = g.user["id"]
    approval.remarks = data.get("remarks")

    db.session.commit()
    return ok(approval.to_dict())


# ─── Engine helpers ───────────────────────────────────────────────────────────

def _run_and_save_engines(project: Project):
    """
    1. Collect all task + dependency data for the project.
    2. Run propagation (pure function).
    3. Run critical path (pure function).
    4. Write results back to DB rows.
    5. Update project.projected_end.
    Does NOT commit — caller must call db.session.commit().
    """
    tasks = project.tasks  # already loaded via relationship
    deps = Dependency.query.filter(
        Dependency.predecessor_task_id.in_([t.id for t in tasks])
    ).all()

    task_dicts = [t.to_dict() for t in tasks]
    dep_dicts = [d.to_dict() for d in deps]

    # Propagation
    updated_tasks, proj_end = run_propagation(task_dicts, dep_dicts)

    # Critical path
    planned_end = project.planned_end
    updated_tasks = run_critical_path(updated_tasks, dep_dicts, planned_end)

    # Write back
    task_map_db = {t.id: t for t in tasks}
    for ut in updated_tasks:
        db_task = task_map_db.get(ut["id"])
        if db_task:
            if ut.get("projected_start"):
                db_task.projected_start = date.fromisoformat(str(ut["projected_start"])[:10])
            if ut.get("projected_end"):
                db_task.projected_end = date.fromisoformat(str(ut["projected_end"])[:10])
            db_task.is_critical = ut.get("is_critical", False)
            db_task.slack_days = ut.get("slack_days", 0)

    if proj_end:
        project.projected_end = proj_end

