"""
Field routes — Site Engineer + Contractor (and PM/Admin) task operations.
Status update, evidence upload (with geofence check), approval requests.
"""
from flask import Blueprint, request, g
from datetime import datetime, date, timezone
from ..extensions import db
from ..models import Task, Project, Evidence, Approval, Escalation, EscalationRule, User, Dependency
from ..middleware.auth import require_auth
from ..utils.errors import bad_request, not_found, forbidden, conflict, ok
from ..engines.geofence import is_within_geofence
from ..routes.pm import _run_and_save_engines

field_bp = Blueprint("field", __name__)

FIELD_ROLES = ["ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACTOR"]


def _can_access_task(task: Task) -> bool:
    """Check if current user can access this task per RBAC."""
    role = g.user["role"]
    if role in ("ADMIN", "PROJECT_MANAGER"):
        return True
    # SE and Contractor: only assigned tasks
    return task.owner_id == g.user["id"]


# ─── My tasks ─────────────────────────────────────────────────────────────────

@field_bp.route("/me/tasks", methods=["GET"])
@require_auth(FIELD_ROLES)
def my_tasks():
    role = g.user["role"]
    if role == "ADMIN":
        tasks = Task.query.all()
    elif role == "PROJECT_MANAGER":
        # PM sees tasks for their managed projects
        managed_projects = Project.query.filter_by(manager_id=g.user["id"]).all()
        project_ids = [p.id for p in managed_projects]
        tasks = Task.query.filter(Task.project_id.in_(project_ids)).all() if project_ids else []
    else:
        tasks = Task.query.filter_by(owner_id=g.user["id"]).all()
    return ok([t.to_dict() for t in tasks])


# ─── Task status update ───────────────────────────────────────────────────────

@field_bp.route("/tasks/<task_id>/status", methods=["PATCH"])
@require_auth(FIELD_ROLES)
def update_task_status(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    if not _can_access_task(task):
        return forbidden()

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    new_status = data.get("status")
    valid_statuses = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]
    if new_status not in valid_statuses:
        return bad_request(f"status must be one of {valid_statuses}.", field="status")

    # Evidence gate — must have at least one geo_verified evidence to complete
    if new_status == "COMPLETED":
        verified_evidence = Evidence.query.filter_by(
            task_id=task_id, geo_verified=True
        ).first()
        if not verified_evidence:
            return conflict(
                "Task requires at least one geo-verified evidence upload before it can be marked COMPLETED."
            )

    old_status = task.status
    task.status = new_status

    if new_status == "IN_PROGRESS" and not task.actual_start:
        task.actual_start = date.today()
    if new_status == "COMPLETED" and not task.actual_end:
        task.actual_end = date.today()

    # Run propagation + critical path
    project = Project.query.get(task.project_id)
    _run_and_save_engines(project)

    db.session.commit()
    return ok(task.to_dict())


# ─── Evidence upload ──────────────────────────────────────────────────────────

@field_bp.route("/tasks/<task_id>/evidence", methods=["POST"])
@require_auth(FIELD_ROLES)
def upload_evidence(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    if not _can_access_task(task):
        return forbidden()

    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    required = ["lat", "lng", "photo_data"]
    for field in required:
        if field not in data or data[field] is None:
            return bad_request(f"{field} is required.", field=field)

    try:
        lat = float(data["lat"])
        lng = float(data["lng"])
    except (ValueError, TypeError):
        return bad_request("lat and lng must be valid numbers.")

    project = Project.query.get(task.project_id)

    # Geofence check (inline, per spec §6)
    distance_m, geo_verified = is_within_geofence(
        lat, lng, project.site_lat, project.site_lng, project.geofence_radius_m
    )

    evidence = Evidence(
        task_id=task_id,
        photo_path=data["photo_data"],  # base64 data URI
        lat=lat,
        lng=lng,
        distance_from_site_m=distance_m,
        geo_verified=geo_verified,
        uploaded_by_id=g.user["id"],
    )
    db.session.add(evidence)
    db.session.flush()

    # If not geo_verified → create escalation (do NOT reject the upload)
    if not geo_verified:
        _raise_geo_mismatch_escalation(task, project, g.user["id"])

    db.session.commit()
    return ok(
        {**evidence.to_dict(), "geo_verified": geo_verified, "distance_from_site_m": distance_m},
        201,
    )


def _raise_geo_mismatch_escalation(task: Task, project: Project, uploader_id: str):
    """Create a geo_mismatch escalation and notify the PROJECT_MANAGER."""
    # Find the project manager (or any admin) to raise to
    raised_to = None
    if project.manager_id:
        raised_to = project.manager_id
    else:
        admin = User.query.filter_by(role="ADMIN").first()
        if admin:
            raised_to = admin.id

    esc = Escalation(
        task_id=task.id,
        rule_triggered="geo_mismatch",
        severity="MEDIUM",
        raised_to_id=raised_to,
    )
    db.session.add(esc)


# ─── Approval request ─────────────────────────────────────────────────────────

@field_bp.route("/tasks/<task_id>/approval-request", methods=["POST"])
@require_auth(FIELD_ROLES)
def request_approval(task_id):
    task = Task.query.get(task_id)
    if not task:
        return not_found("Task not found.")

    if not _can_access_task(task):
        return forbidden()

    # Check for existing pending approval
    existing = Approval.query.filter_by(task_id=task_id, decision="PENDING").first()
    if existing:
        return conflict("There is already a pending approval request for this task.")

    approval = Approval(
        task_id=task_id,
        requested_by_id=g.user["id"],
        decision="PENDING",
    )
    db.session.add(approval)
    db.session.commit()
    return ok(approval.to_dict(), 201)


# ─── My approvals ─────────────────────────────────────────────────────────────

@field_bp.route("/me/approvals", methods=["GET"])
@require_auth(FIELD_ROLES)
def my_approvals():
    role = g.user["role"]
    if role == "ADMIN":
        approvals = Approval.query.order_by(Approval.requested_at.desc()).all()
    else:
        approvals = Approval.query.filter_by(requested_by_id=g.user["id"])\
                                  .order_by(Approval.requested_at.desc()).all()
    return ok([a.to_dict() for a in approvals])


# ─── My evidence ──────────────────────────────────────────────────────────────

@field_bp.route("/me/evidence", methods=["GET"])
@require_auth(FIELD_ROLES)
def my_evidence():
    role = g.user["role"]
    if role == "ADMIN":
        evidence = Evidence.query.order_by(Evidence.captured_at.desc()).all()
    else:
        evidence = Evidence.query.filter_by(uploaded_by_id=g.user["id"])\
                                 .order_by(Evidence.captured_at.desc()).all()
    return ok([e.to_dict() for e in evidence])

