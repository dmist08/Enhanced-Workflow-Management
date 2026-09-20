import uuid
from .extensions import db
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import CheckConstraint, UniqueConstraint


def _uuid():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "user"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = db.Column(db.Text, nullable=False)
    email = db.Column(db.Text, unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    role = db.Column(
        db.Text,
        nullable=False,
        # CHECK enforced at DB level; also validated in API layer
    )
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    __table_args__ = (
        CheckConstraint(
            "role IN ('ADMIN','PROJECT_MANAGER','SITE_ENGINEER','CONTRACTOR')",
            name="user_role_check",
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Project(db.Model):
    __tablename__ = "project"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = db.Column(db.Text, nullable=False)
    department = db.Column(db.Text)
    site_lat = db.Column(db.Float, nullable=False)
    site_lng = db.Column(db.Float, nullable=False)
    geofence_radius_m = db.Column(db.Float, nullable=False, default=200.0)
    budget = db.Column(db.Numeric)
    planned_start = db.Column(db.Date, nullable=False)
    planned_end = db.Column(db.Date, nullable=False)
    # Engine-computed — never set directly by client; API strips these fields on PATCH
    projected_end = db.Column(db.Date)
    manager_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))
    status = db.Column(db.Text, default="ACTIVE")
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    manager = db.relationship("User", foreign_keys=[manager_id])
    tasks = db.relationship("Task", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE','ON_HOLD','COMPLETED','CANCELLED')",
            name="project_status_check",
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "department": self.department,
            "site_lat": self.site_lat,
            "site_lng": self.site_lng,
            "geofence_radius_m": self.geofence_radius_m,
            "budget": float(self.budget) if self.budget is not None else None,
            "planned_start": self.planned_start.isoformat() if self.planned_start else None,
            "planned_end": self.planned_end.isoformat() if self.planned_end else None,
            "projected_end": self.projected_end.isoformat() if self.projected_end else None,
            "manager_id": self.manager_id,
            "manager_name": self.manager.name if self.manager else None,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Task(db.Model):
    __tablename__ = "task"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    project_id = db.Column(
        UUID(as_uuid=False), db.ForeignKey("project.id", ondelete="CASCADE"), nullable=False
    )
    name = db.Column(db.Text, nullable=False)
    phase = db.Column(db.Text)
    owner_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))
    planned_start = db.Column(db.Date, nullable=False)
    planned_duration_days = db.Column(db.Integer, nullable=False)
    actual_start = db.Column(db.Date)
    actual_end = db.Column(db.Date)
    # Engine-computed — stripped from client PATCHes
    projected_start = db.Column(db.Date)
    projected_end = db.Column(db.Date)
    status = db.Column(db.Text, default="NOT_STARTED")
    is_critical = db.Column(db.Boolean, default=False)  # engine-computed
    slack_days = db.Column(db.Integer, default=0)       # engine-computed
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    project = db.relationship("Project", back_populates="tasks")
    owner = db.relationship("User", foreign_keys=[owner_id])
    evidence = db.relationship("Evidence", back_populates="task", cascade="all, delete-orphan")
    approvals = db.relationship("Approval", back_populates="task", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("planned_duration_days > 0", name="task_duration_positive"),
        CheckConstraint(
            "status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED')",
            name="task_status_check",
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "phase": self.phase,
            "owner_id": self.owner_id,
            "owner_name": self.owner.name if self.owner else None,
            "planned_start": self.planned_start.isoformat() if self.planned_start else None,
            "planned_duration_days": self.planned_duration_days,
            "actual_start": self.actual_start.isoformat() if self.actual_start else None,
            "actual_end": self.actual_end.isoformat() if self.actual_end else None,
            "projected_start": self.projected_start.isoformat() if self.projected_start else None,
            "projected_end": self.projected_end.isoformat() if self.projected_end else None,
            "status": self.status,
            "is_critical": self.is_critical,
            "slack_days": self.slack_days,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Dependency(db.Model):
    __tablename__ = "dependency"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    predecessor_task_id = db.Column(
        UUID(as_uuid=False), db.ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )
    successor_task_id = db.Column(
        UUID(as_uuid=False), db.ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )

    predecessor = db.relationship("Task", foreign_keys=[predecessor_task_id])
    successor = db.relationship("Task", foreign_keys=[successor_task_id])

    __table_args__ = (
        CheckConstraint(
            "predecessor_task_id <> successor_task_id", name="dep_no_self_ref"
        ),
        UniqueConstraint("predecessor_task_id", "successor_task_id", name="dep_unique"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "predecessor_task_id": self.predecessor_task_id,
            "successor_task_id": self.successor_task_id,
        }


class Approval(db.Model):
    __tablename__ = "approval"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    task_id = db.Column(
        UUID(as_uuid=False), db.ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )
    requested_by_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))
    approver_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))
    requested_at = db.Column(db.DateTime, server_default=db.func.now())
    decided_at = db.Column(db.DateTime)
    decision = db.Column(db.Text, default="PENDING")
    remarks = db.Column(db.Text)

    task = db.relationship("Task", back_populates="approvals")
    requested_by = db.relationship("User", foreign_keys=[requested_by_id])
    approver = db.relationship("User", foreign_keys=[approver_id])

    __table_args__ = (
        CheckConstraint(
            "decision IN ('PENDING','APPROVED','REJECTED')", name="approval_decision_check"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "requested_by_id": self.requested_by_id,
            "requested_by_name": self.requested_by.name if self.requested_by else None,
            "approver_id": self.approver_id,
            "approver_name": self.approver.name if self.approver else None,
            "requested_at": self.requested_at.isoformat() if self.requested_at else None,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "decision": self.decision,
            "remarks": self.remarks,
        }


class Evidence(db.Model):
    __tablename__ = "evidence"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    task_id = db.Column(
        UUID(as_uuid=False), db.ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )
    photo_path = db.Column(db.Text, nullable=False)  # base64 data URI
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    captured_at = db.Column(db.DateTime, server_default=db.func.now())
    distance_from_site_m = db.Column(db.Float)  # computed at upload time
    geo_verified = db.Column(db.Boolean)         # computed at upload time
    uploaded_by_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))

    task = db.relationship("Task", back_populates="evidence")
    uploaded_by = db.relationship("User", foreign_keys=[uploaded_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "task_name": self.task.name if self.task else None,
            "lat": self.lat,
            "lng": self.lng,
            "captured_at": self.captured_at.isoformat() if self.captured_at else None,
            "distance_from_site_m": self.distance_from_site_m,
            "geo_verified": self.geo_verified,
            "uploaded_by_id": self.uploaded_by_id,
            "uploaded_by_name": self.uploaded_by.name if self.uploaded_by else None,
            # photo_path intentionally excluded from list views — fetch separately if needed
        }


class Escalation(db.Model):
    __tablename__ = "escalation"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    task_id = db.Column(UUID(as_uuid=False), db.ForeignKey("task.id", ondelete="CASCADE"))
    rule_triggered = db.Column(db.Text, nullable=False)
    severity = db.Column(db.Text)
    raised_at = db.Column(db.DateTime, server_default=db.func.now())
    raised_to_id = db.Column(UUID(as_uuid=False), db.ForeignKey("user.id"))
    justification = db.Column(db.Text)  # mandatory before resolution
    resolved_at = db.Column(db.DateTime)

    task = db.relationship("Task", foreign_keys=[task_id])
    raised_to = db.relationship("User", foreign_keys=[raised_to_id])

    __table_args__ = (
        CheckConstraint(
            "severity IN ('MEDIUM','HIGH','CRITICAL')", name="escalation_severity_check"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "task_name": self.task.name if self.task else None,
            "rule_triggered": self.rule_triggered,
            "severity": self.severity,
            "raised_at": self.raised_at.isoformat() if self.raised_at else None,
            "raised_to_id": self.raised_to_id,
            "raised_to_name": self.raised_to.name if self.raised_to else None,
            "justification": self.justification,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class EscalationRule(db.Model):
    __tablename__ = "escalation_rule"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    condition_key = db.Column(db.Text, nullable=False)
    threshold = db.Column(db.Float, nullable=False)
    severity = db.Column(db.Text, nullable=False)
    escalate_to_role = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "condition_key": self.condition_key,
            "threshold": self.threshold,
            "severity": self.severity,
            "escalate_to_role": self.escalate_to_role,
        }
