"""
Shared read-only endpoints, role-filtered server-side.
"""
from flask import Blueprint, request, g
from datetime import datetime, timezone
from ..extensions import db
from ..models import Project, Task, Dependency, Evidence, Escalation, EscalationRule, Approval
from ..middleware.auth import require_auth
from ..utils.errors import bad_request, not_found, forbidden, ok
from ..engines.attribution import run_attribution

shared_bp = Blueprint("shared", __name__)

ALL_ROLES = ["ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACTOR"]


def _project_access_check(project_id: str):
    project = Project.query.get(project_id)
    if not project:
        return None, not_found("Project not found.")
    role = g.user["role"]
    if role == "PROJECT_MANAGER" and project.manager_id != g.user["id"]:
        return None, forbidden()
    if role in ("SITE_ENGINEER", "CONTRACTOR"):
        # Can only view project if they have a task there
        has_task = Task.query.filter_by(project_id=project_id, owner_id=g.user["id"]).first()
        if not has_task:
            return None, forbidden()
    return project, None


# ─── Project tasks ────────────────────────────────────────────────────────────

@shared_bp.route("/projects/<project_id>/tasks", methods=["GET"])
@require_auth(ALL_ROLES)
def list_project_tasks(project_id):
    project, err = _project_access_check(project_id)
    if err:
        return err

    role = g.user["role"]
    if role in ("SITE_ENGINEER", "CONTRACTOR"):
        tasks = Task.query.filter_by(project_id=project_id, owner_id=g.user["id"]).all()
    else:
        tasks = Task.query.filter_by(project_id=project_id).all()

    return ok([t.to_dict() for t in tasks])


@shared_bp.route("/tasks/<task_id>", methods=["GET"])
@require_auth(ALL_ROLES)
def get_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    role = g.user["role"]
    if role in ("SITE_ENGINEER", "CONTRACTOR") and task.owner_id != g.user["id"]:
        return forbidden()

    return ok(task.to_dict())


@shared_bp.route("/tasks/<task_id>/dependencies", methods=["GET"])
@require_auth(ALL_ROLES)
def get_task_dependencies(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    deps = Dependency.query.filter(
        (Dependency.predecessor_task_id == task_id) |
        (Dependency.successor_task_id == task_id)
    ).all()
    return ok([d.to_dict() for d in deps])


@shared_bp.route("/tasks/<task_id>/evidence", methods=["GET"])
@require_auth(ALL_ROLES)
def get_task_evidence(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    role = g.user["role"]
    if role in ("SITE_ENGINEER", "CONTRACTOR") and task.owner_id != g.user["id"]:
        return forbidden()

    evidence = Evidence.query.filter_by(task_id=task_id)\
                             .order_by(Evidence.captured_at.desc()).all()
    return ok([e.to_dict() for e in evidence])


# ─── Critical path ────────────────────────────────────────────────────────────

@shared_bp.route("/projects/<project_id>/critical-path", methods=["GET"])
@require_auth(ALL_ROLES)
def get_critical_path(project_id):
    project, err = _project_access_check(project_id)
    if err:
        return err

    tasks = Task.query.filter_by(project_id=project_id).all()
    deps = Dependency.query.filter(
        Dependency.predecessor_task_id.in_([t.id for t in tasks])
    ).all()

    return ok({
        "tasks": [t.to_dict() for t in tasks],
        "dependencies": [d.to_dict() for d in deps],
        "critical_tasks": [t.to_dict() for t in tasks if t.is_critical],
    })


# ─── Attribution ──────────────────────────────────────────────────────────────

@shared_bp.route("/projects/<project_id>/attribution", methods=["GET"])
@require_auth(ALL_ROLES)
def get_attribution(project_id):
    project, err = _project_access_check(project_id)
    if err:
        return err

    tasks = Task.query.filter_by(project_id=project_id).all()
    critical_tasks = [t.to_dict() for t in tasks if t.is_critical]

    critical_task_ids = [t["id"] for t in critical_tasks]
    approvals = Approval.query.filter(
        Approval.task_id.in_(critical_task_ids)
    ).all() if critical_task_ids else []

    rules = EscalationRule.query.all()

    result = run_attribution(
        critical_tasks=critical_tasks,
        approvals=[a.to_dict() for a in approvals],
        escalation_rules=[r.to_dict() for r in rules],
        project_planned_end=project.planned_end,
    )
    return ok(result)


# ─── Escalations ──────────────────────────────────────────────────────────────

@shared_bp.route("/escalations", methods=["GET"])
@require_auth(ALL_ROLES)
def list_escalations():
    role = g.user["role"]

    if role == "ADMIN":
        escalations = Escalation.query.order_by(Escalation.raised_at.desc()).all()
    elif role == "PROJECT_MANAGER":
        # Only escalations for tasks in the PM's own projects
        from ..models import Project as Proj
        pm_project_ids = [p.id for p in Proj.query.filter_by(manager_id=g.user["id"]).all()]
        escalations = (
            Escalation.query
            .join(Task, Escalation.task_id == Task.id)
            .filter(Task.project_id.in_(pm_project_ids))
            .order_by(Escalation.raised_at.desc())
            .all()
        )
    else:
        # SE / Contractor: only their own tasks
        escalations = (
            Escalation.query
            .join(Task, Escalation.task_id == Task.id)
            .filter(Task.owner_id == g.user["id"])
            .order_by(Escalation.raised_at.desc())
            .all()
        )

    return ok([e.to_dict() for e in escalations])


@shared_bp.route("/escalations/<escalation_id>/resolve", methods=["PATCH"])
@require_auth(["ADMIN", "PROJECT_MANAGER"])
def resolve_escalation(escalation_id):
    escalation = Escalation.query.get(escalation_id)
    if not escalation:
        return not_found("Escalation not found.")

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    justification = data.get("justification", "").strip()
    if not justification:
        return bad_request(
            "justification is required to resolve an escalation.", field="justification"
        )

    escalation.justification = justification
    escalation.resolved_at = datetime.now(tz=timezone.utc)
    db.session.commit()
    return ok(escalation.to_dict())
