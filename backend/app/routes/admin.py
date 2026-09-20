"""
Admin routes — all require role=ADMIN.
"""
from flask import Blueprint, request, g
from ..extensions import db
from ..models import User, Project, EscalationRule, Escalation, Task
from ..middleware.auth import require_auth
from ..utils.errors import bad_request, not_found, ok, forbidden
import bcrypt
from datetime import date

admin_bp = Blueprint("admin", __name__)

ADMIN = ["ADMIN"]

# ─── Projects ────────────────────────────────────────────────────────────────

@admin_bp.route("/admin/projects", methods=["GET"])
@require_auth(ADMIN)
def list_projects():
    projects = Project.query.order_by(Project.created_at.desc()).all()
    return ok([p.to_dict() for p in projects])


@admin_bp.route("/admin/projects", methods=["POST"])
@require_auth(ADMIN)
def create_project():
    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    required = ["name", "site_lat", "site_lng", "planned_start", "planned_end"]
    for field in required:
        if field not in data or data[field] is None:
            return bad_request(f"{field} is required.", field=field)

    manager_id = data.get("manager_id")
    if manager_id:
        if not User.query.get(manager_id):
            return not_found("manager_id does not reference a valid user.")

    try:
        project = Project(
            name=data["name"],
            department=data.get("department"),
            site_lat=float(data["site_lat"]),
            site_lng=float(data["site_lng"]),
            geofence_radius_m=float(data.get("geofence_radius_m", 200)),
            budget=data.get("budget"),
            planned_start=date.fromisoformat(data["planned_start"]),
            planned_end=date.fromisoformat(data["planned_end"]),
            manager_id=manager_id,
            status=data.get("status", "ACTIVE"),
        )
        db.session.add(project)
        db.session.commit()
        return ok(project.to_dict(), 201)
    except (ValueError, TypeError) as e:
        return bad_request(str(e))


@admin_bp.route("/admin/projects/<project_id>", methods=["PATCH"])
@require_auth(ADMIN)
def update_project(project_id):
    project = Project.query.get(project_id)
    if not project:
        return not_found("Project not found.")

    data = request.get_json(silent=True) or {}

    # Strip engine-computed fields silently
    for field in ["projected_end"]:
        data.pop(field, None)

    allowed = ["name", "department", "site_lat", "site_lng", "geofence_radius_m",
               "budget", "planned_start", "planned_end", "manager_id", "status"]
    for field in allowed:
        if field in data:
            if field in ["planned_start", "planned_end"] and data[field]:
                setattr(project, field, date.fromisoformat(data[field]))
            elif field in ["site_lat", "site_lng", "geofence_radius_m"] and data[field] is not None:
                setattr(project, field, float(data[field]))
            else:
                setattr(project, field, data[field])

    if "manager_id" in data and data["manager_id"]:
        if not User.query.get(data["manager_id"]):
            return not_found("manager_id does not reference a valid user.")

    db.session.commit()
    return ok(project.to_dict())


@admin_bp.route("/admin/projects/<project_id>", methods=["DELETE"])
@require_auth(ADMIN)
def delete_project(project_id):
    project = Project.query.get(project_id)
    if not project:
        return not_found("Project not found.")
    db.session.delete(project)
    db.session.commit()
    return ok({"message": "Project deleted."})


# ─── Users ───────────────────────────────────────────────────────────────────

VALID_ROLES = {"ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACTOR"}


@admin_bp.route("/admin/users", methods=["GET"])
@require_auth(ADMIN)
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return ok([u.to_dict() for u in users])


@admin_bp.route("/admin/users", methods=["POST"])
@require_auth(ADMIN)
def create_user():
    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    required = ["name", "email", "password", "role"]
    for field in required:
        if not data.get(field):
            return bad_request(f"{field} is required.", field=field)

    if data["role"] not in VALID_ROLES:
        return bad_request(f"role must be one of {sorted(VALID_ROLES)}.", field="role")

    if User.query.filter_by(email=data["email"].strip().lower()).first():
        return bad_request("A user with this email already exists.", field="email")

    pw_hash = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
    user = User(
        name=data["name"].strip(),
        email=data["email"].strip().lower(),
        password_hash=pw_hash,
        role=data["role"],
    )
    db.session.add(user)
    db.session.commit()
    return ok(user.to_dict(), 201)


@admin_bp.route("/admin/users/<user_id>", methods=["PATCH"])
@require_auth(ADMIN)
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return not_found("User not found.")

    data = request.get_json(silent=True) or {}

    if "name" in data:
        user.name = data["name"].strip()
    if "email" in data:
        email = data["email"].strip().lower()
        existing = User.query.filter_by(email=email).first()
        if existing and existing.id != user_id:
            return bad_request("Email already in use.", field="email")
        user.email = email
    if "role" in data:
        if data["role"] not in VALID_ROLES:
            return bad_request(f"role must be one of {sorted(VALID_ROLES)}.", field="role")
        user.role = data["role"]
    if "password" in data and data["password"]:
        user.password_hash = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()

    db.session.commit()
    return ok(user.to_dict())


# ─── Escalation Rules ────────────────────────────────────────────────────────

@admin_bp.route("/admin/escalation-rules", methods=["GET"])
@require_auth(ADMIN)
def list_escalation_rules():
    rules = EscalationRule.query.all()
    return ok([r.to_dict() for r in rules])


@admin_bp.route("/admin/escalation-rules/<rule_id>", methods=["PATCH"])
@require_auth(ADMIN)
def update_escalation_rule(rule_id):
    rule = EscalationRule.query.get(rule_id)
    if not rule:
        return not_found("Escalation rule not found.")

    data = request.get_json(silent=True) or {}
    if "threshold" in data:
        rule.threshold = float(data["threshold"])
    if "severity" in data:
        rule.severity = data["severity"]
    if "escalate_to_role" in data:
        rule.escalate_to_role = data["escalate_to_role"]

    db.session.commit()
    return ok(rule.to_dict())


# ─── Admin dashboard summary ─────────────────────────────────────────────────

@admin_bp.route("/admin/dashboard", methods=["GET"])
@require_auth(ADMIN)
def dashboard():
    from ..models import Escalation
    from sqlalchemy import func

    total_projects = Project.query.count()
    active_projects = Project.query.filter_by(status="ACTIVE").count()
    total_users = User.query.count()
    open_escalations = Escalation.query.filter_by(resolved_at=None).count()

    projects = Project.query.order_by(Project.created_at.desc()).limit(10).all()

    return ok({
        "summary": {
            "total_projects": total_projects,
            "active_projects": active_projects,
            "total_users": total_users,
            "open_escalations": open_escalations,
        },
        "recent_projects": [p.to_dict() for p in projects],
    })
