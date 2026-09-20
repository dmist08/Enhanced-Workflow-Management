"""
Seed script — creates demo data for all 4 roles, 3 projects, realistic tasks.
Deliberately seeds:
  - Visible task delays (actual_end well past planned) forcing critical path
  - Tight project deadlines so projected_end > planned_end
  - Multiple evidence uploads (in and out of geofence)
  - Stale approvals + resolved approvals
  - Active escalations (pending + resolved)

Run: python seed.py (from /backend directory)
"""

import os
import sys
import uuid
import bcrypt
from datetime import date, datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models import (
    User, Project, Task, Dependency,
    Evidence, Approval, Escalation, EscalationRule
)
from app.engines.propagation import run_propagation, has_cycle_after_add
from app.engines.critical_path import run_critical_path
from app.engines.geofence import is_within_geofence


def hashpw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _uuid() -> str:
    return str(uuid.uuid4())


def seed():
    app = create_app()
    with app.app_context():
        print("⚙️  Dropping and recreating all tables...")
        db.drop_all()
        db.create_all()

        # ── Users ──────────────────────────────────────────────────────────────
        print("👤 Creating users...")
        admin = User(id=_uuid(), name="Arjun Mehta", email="admin@projectmgmt.dev",
                     password_hash=hashpw("admin123"), role="ADMIN")
        pm = User(id=_uuid(), name="Priya Sharma", email="pm@projectmgmt.dev",
                  password_hash=hashpw("pm123"), role="PROJECT_MANAGER")
        se = User(id=_uuid(), name="Rohan Kulkarni", email="se@projectmgmt.dev",
                  password_hash=hashpw("se123"), role="SITE_ENGINEER")
        contractor = User(id=_uuid(), name="Deepak Patel", email="contractor@projectmgmt.dev",
                          password_hash=hashpw("contractor123"), role="CONTRACTOR")
        db.session.add_all([admin, pm, se, contractor])
        db.session.flush()

        # ── Escalation Rules ────────────────────────────────────────────────────
        print("📋 Seeding escalation rules...")
        rules = [
            EscalationRule(id=_uuid(), condition_key="approval_pending_days",
                           threshold=3, severity="HIGH", escalate_to_role="PROJECT_MANAGER"),
            EscalationRule(id=_uuid(), condition_key="critical_task_slip_days",
                           threshold=0, severity="CRITICAL", escalate_to_role="ADMIN"),
            EscalationRule(id=_uuid(), condition_key="geo_mismatch",
                           threshold=1, severity="MEDIUM", escalate_to_role="PROJECT_MANAGER"),
        ]
        db.session.add_all(rules)
        db.session.flush()

        today = date.today()

        # ── Project 1: Mumbai Metro — DELAYED ────────────────────────────────
        print("🏗️  Creating Project 1: Mumbai Metro (delayed)...")
        p1 = Project(
            id=_uuid(), name="Mumbai Metro Line 4 — Wadala Station",
            department="Urban Infrastructure",
            site_lat=19.0176, site_lng=72.8562,
            geofence_radius_m=200,
            budget=4500000,
            planned_start=today - timedelta(days=90),
            planned_end=today,  # 90 days total planned duration
            manager_id=pm.id,
            status="ACTIVE",
        )

        # Project 2: Pune Ring Road — ON TRACK
        print("🏗️  Creating Project 2: Pune Ring Road (on track)...")
        p2 = Project(
            id=_uuid(), name="Pune Outer Ring Road — Section B",
            department="Road & Bridges",
            site_lat=18.5204, site_lng=73.8567,
            geofence_radius_m=300,
            budget=8200000,
            planned_start=today - timedelta(days=60),
            planned_end=today + timedelta(days=22),  # 82 days planned duration
            manager_id=pm.id,
            status="ACTIVE",
        )

        # Project 3: Bangalore Water Treatment — COMPLETED
        print("🏗️  Creating Project 3: Bangalore Water Treatment (completed)...")
        p3 = Project(
            id=_uuid(), name="Bangalore Water Treatment Plant",
            department="Water & Sanitation",
            site_lat=12.9716, site_lng=77.5946,
            geofence_radius_m=250,
            budget=3200000,
            planned_start=today - timedelta(days=180),
            planned_end=today - timedelta(days=76),  # 104 days planned duration
            manager_id=pm.id,
            status="COMPLETED",
        )

        db.session.add_all([p1, p2, p3])
        db.session.flush()

        # ── P1 Tasks (Mumbai Metro — the one with delays) ─────────────────────
        # Chain: Survey→Foundation→Rebar→Concrete→Formwork→MEP→Tiling→Finishing→Inspection→Handover
        # Make survey and foundation COMPLETED but late, concrete BLOCKED
        p1_tasks = []
        p1_data = [
            # name, phase, owner, planned_start_offset, duration, status, actual_start_off, actual_end_off
            ("Site Survey & Soil Testing",    "Planning",      se, -90, 10, "COMPLETED", -90, -78),      # Finished 2 days late
            ("Foundation Excavation",         "Foundation",    contractor, -80, 15, "COMPLETED", -78, -55),  # Finished 8 days late!
            ("Rebar & Steel Erection",        "Structural",    contractor, -65, 12, "COMPLETED", -55, -40),  # Late cascade
            ("Concrete Pouring — Base Slab",  "Structural",    contractor, -53, 8,  "IN_PROGRESS", -40, None),
            ("Column Formwork Installation",  "Structural",    se, -45, 10, "BLOCKED",   None, None),
            ("MEP Rough-In (Electrical)",     "MEP",           se, -35, 12, "NOT_STARTED", None, None),
            ("Platform Tiling & Finish",      "Finishing",     contractor, -23, 8,  "NOT_STARTED", None, None),
            ("Fire Safety Systems",           "Safety",        se, -15, 7,  "NOT_STARTED", None, None),
            ("Final Inspection & Punch List", "Closeout",      pm, -8,  5,  "NOT_STARTED", None, None),
            ("Client Handover",              "Closeout",       pm, -3,  3,  "NOT_STARTED", None, None),
        ]
        for name, phase, owner, start_off, dur, status, act_s, act_e in p1_data:
            t = Task(
                id=_uuid(), project_id=p1.id, name=name, phase=phase,
                owner_id=owner.id,
                planned_start=today + timedelta(days=start_off),
                planned_duration_days=dur,
                actual_start=(today + timedelta(days=act_s)) if act_s is not None else None,
                actual_end=(today + timedelta(days=act_e)) if act_e is not None else None,
                status=status,
            )
            p1_tasks.append(t)

        db.session.add_all(p1_tasks)
        db.session.flush()

        # P1 dependencies: linear chain
        p1_deps = []
        for i in range(len(p1_tasks) - 1):
            d = Dependency(id=_uuid(),
                           predecessor_task_id=p1_tasks[i].id,
                           successor_task_id=p1_tasks[i + 1].id)
            p1_deps.append(d)
        db.session.add_all(p1_deps)
        db.session.flush()

        # ── P2 Tasks (Pune Ring Road — on track) ──────────────────────────────
        p2_tasks = []
        p2_data = [
            ("Land Acquisition & Survey",       "Planning",      se, -60, 14, "COMPLETED", -60, -47),
            ("Grading & Earthwork",             "Earthwork",     contractor, -46, 20, "COMPLETED", -46, -27),
            ("Drainage Culvert Construction",   "Drainage",      contractor, -26, 12, "IN_PROGRESS", -26, None),
            ("Sub-base Layer Preparation",      "Paving",        contractor, -14, 10, "NOT_STARTED", None, None),
            ("Bituminous Base Course",          "Paving",        se, -4,  8,  "NOT_STARTED", None, None),
            ("Surface Course & Line Markings",  "Paving",        se,  4,  7,  "NOT_STARTED", None, None),
            ("Guardrails & Signage",            "Safety",        contractor, 11, 6,  "NOT_STARTED", None, None),
            ("Quality Audit & Handover",        "Closeout",      pm, 17,  5,  "NOT_STARTED", None, None),
        ]
        for name, phase, owner, start_off, dur, status, act_s, act_e in p2_data:
            t = Task(
                id=_uuid(), project_id=p2.id, name=name, phase=phase,
                owner_id=owner.id,
                planned_start=today + timedelta(days=start_off),
                planned_duration_days=dur,
                actual_start=(today + timedelta(days=act_s)) if act_s is not None else None,
                actual_end=(today + timedelta(days=act_e)) if act_e is not None else None,
                status=status,
            )
            p2_tasks.append(t)

        db.session.add_all(p2_tasks)
        db.session.flush()

        p2_deps = []
        for i in range(len(p2_tasks) - 1):
            d = Dependency(id=_uuid(),
                           predecessor_task_id=p2_tasks[i].id,
                           successor_task_id=p2_tasks[i + 1].id)
            p2_deps.append(d)
        db.session.add_all(p2_deps)
        db.session.flush()

        # ── P3 Tasks (Bangalore — completed) ──────────────────────────────────
        p3_tasks = []
        p3_data = [
            ("Intake Structure Design",        "Planning",     pm, -180, 15, "COMPLETED", -180, -166),
            ("Civil Works — Tank Construction", "Construction", contractor, -165, 30, "COMPLETED", -165, -136),
            ("Pipe Laying & Valves",            "Mechanical",   se, -135, 20, "COMPLETED", -135, -116),
            ("Electrical & SCADA Panel",        "Electrical",   se, -115, 15, "COMPLETED", -115, -101),
            ("Chlorination System Install",     "Chemical",     contractor, -100, 10, "COMPLETED", -100, -91),
            ("Commissioning & Testing",         "Closeout",     pm, -90, 14, "COMPLETED", -90, -77),
        ]
        for name, phase, owner, start_off, dur, status, act_s, act_e in p3_data:
            t = Task(
                id=_uuid(), project_id=p3.id, name=name, phase=phase,
                owner_id=owner.id,
                planned_start=today + timedelta(days=start_off),
                planned_duration_days=dur,
                actual_start=(today + timedelta(days=act_s)) if act_s is not None else None,
                actual_end=(today + timedelta(days=act_e)) if act_e is not None else None,
                status=status,
            )
            p3_tasks.append(t)

        db.session.add_all(p3_tasks)
        db.session.flush()

        p3_deps = []
        for i in range(len(p3_tasks) - 1):
            d = Dependency(id=_uuid(),
                           predecessor_task_id=p3_tasks[i].id,
                           successor_task_id=p3_tasks[i + 1].id)
            p3_deps.append(d)
        db.session.add_all(p3_deps)
        db.session.flush()

        all_tasks = p1_tasks + p2_tasks + p3_tasks
        all_deps = p1_deps + p2_deps + p3_deps

        # ── Run engines to compute projected dates + critical path ────────────
        print("🔧 Running propagation + critical path engines...")
        for proj in [p1, p2, p3]:
            proj_tasks = [t for t in all_tasks if t.project_id == proj.id]
            proj_deps = [d for d in all_deps
                         if d.predecessor_task_id in {t.id for t in proj_tasks}
                         or d.successor_task_id in {t.id for t in proj_tasks}]

            task_dicts = [{
                "id": t.id,
                "planned_start": t.planned_start.isoformat() if t.planned_start else None,
                "planned_duration_days": t.planned_duration_days,
                "actual_start": t.actual_start.isoformat() if t.actual_start else None,
                "actual_end": t.actual_end.isoformat() if t.actual_end else None,
                "status": t.status,
            } for t in proj_tasks]

            dep_dicts = [{"predecessor_task_id": d.predecessor_task_id,
                          "successor_task_id": d.successor_task_id} for d in proj_deps]

            # Propagation
            propagated, proj_proj_end = run_propagation(task_dicts, dep_dicts)
            for p_t in propagated:
                task_obj = next(t for t in proj_tasks if t.id == p_t["id"])
                task_obj.projected_start = date.fromisoformat(p_t["projected_start"]) if p_t.get("projected_start") else None
                task_obj.projected_end = date.fromisoformat(p_t["projected_end"]) if p_t.get("projected_end") else None

            # Critical path
            cp_result = run_critical_path(propagated, dep_dicts, proj.planned_end)
            for cp_t in cp_result:
                task_obj = next(t for t in proj_tasks if t.id == cp_t["id"])
                task_obj.is_critical = cp_t.get("is_critical", False)
                task_obj.slack_days = cp_t.get("slack_days", 0)

            # Update project projected_end
            proj_ends = [t.projected_end for t in proj_tasks if t.projected_end]
            if proj_ends:
                proj.projected_end = max(proj_ends)

            critical_count = sum(1 for t in proj_tasks if t.is_critical)
            print(f"  📊 {proj.name}: {critical_count} critical tasks, projected_end={proj.projected_end}")

        db.session.flush()

        # ── Evidence uploads ──────────────────────────────────────────────────
        print("📸 Creating evidence uploads...")
        # Good evidence — within geofence of P1 (Mumbai)
        ev1 = Evidence(
            id=_uuid(), task_id=p1_tasks[0].id,
            uploaded_by_id=se.id,
            lat=19.0178, lng=72.8564,   # ~25m from site
            captured_at=datetime.now(timezone.utc) - timedelta(days=80),
            distance_from_site_m=25.3,
            geo_verified=True,
            photo_path="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        )
        ev2 = Evidence(
            id=_uuid(), task_id=p1_tasks[1].id,
            uploaded_by_id=contractor.id,
            lat=19.0175, lng=72.8560,   # ~30m from site
            captured_at=datetime.now(timezone.utc) - timedelta(days=60),
            distance_from_site_m=30.1,
            geo_verified=True,
            photo_path="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        )
        # Bad evidence — outside geofence (submitted from office in Andheri, 15km away)
        ev3 = Evidence(
            id=_uuid(), task_id=p1_tasks[2].id,
            uploaded_by_id=contractor.id,
            lat=19.1136, lng=72.8697,   # Andheri — ~11km from Wadala
            captured_at=datetime.now(timezone.utc) - timedelta(days=45),
            distance_from_site_m=11200.0,
            geo_verified=False,
            photo_path="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        )
        # Another good one for P2
        ev4 = Evidence(
            id=_uuid(), task_id=p2_tasks[0].id,
            uploaded_by_id=se.id,
            lat=18.5206, lng=73.8569,
            captured_at=datetime.now(timezone.utc) - timedelta(days=50),
            distance_from_site_m=18.5,
            geo_verified=True,
            photo_path="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        )
        # Good one for P2 earthwork
        ev5 = Evidence(
            id=_uuid(), task_id=p2_tasks[1].id,
            uploaded_by_id=contractor.id,
            lat=18.5203, lng=73.8566,
            captured_at=datetime.now(timezone.utc) - timedelta(days=28),
            distance_from_site_m=12.0,
            geo_verified=True,
            photo_path="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        )
        db.session.add_all([ev1, ev2, ev3, ev4, ev5])
        db.session.flush()

        # ── Approvals ─────────────────────────────────────────────────────────
        print("✅ Creating approval records...")
        # Approved approval for P1 survey
        appr1 = Approval(
            id=_uuid(), task_id=p1_tasks[0].id,
            requested_by_id=se.id, approver_id=pm.id,
            requested_at=datetime.now(timezone.utc) - timedelta(days=79),
            decided_at=datetime.now(timezone.utc) - timedelta(days=78),
            decision="APPROVED",
            remarks="Survey report looks complete.",
        )
        # Approved for P1 foundation
        appr2 = Approval(
            id=_uuid(), task_id=p1_tasks[1].id,
            requested_by_id=contractor.id, approver_id=pm.id,
            requested_at=datetime.now(timezone.utc) - timedelta(days=56),
            decided_at=datetime.now(timezone.utc) - timedelta(days=55),
            decision="APPROVED",
            remarks="Foundation load test passed.",
        )
        # STALE pending approval — 5 days old (should trigger escalation)
        appr3 = Approval(
            id=_uuid(), task_id=p1_tasks[2].id,
            requested_by_id=contractor.id, approver_id=pm.id,
            requested_at=datetime.now(timezone.utc) - timedelta(days=5),
            decided_at=None,
            decision="PENDING",
            remarks=None,
        )
        # Rejected approval for P1 rebar (first attempt)
        appr4 = Approval(
            id=_uuid(), task_id=p1_tasks[2].id,
            requested_by_id=contractor.id, approver_id=pm.id,
            requested_at=datetime.now(timezone.utc) - timedelta(days=42),
            decided_at=datetime.now(timezone.utc) - timedelta(days=41),
            decision="REJECTED",
            remarks="Rebar spacing does not match structural drawings. Redo section C.",
        )
        # Approved for P2 survey
        appr5 = Approval(
            id=_uuid(), task_id=p2_tasks[0].id,
            requested_by_id=se.id, approver_id=pm.id,
            requested_at=datetime.now(timezone.utc) - timedelta(days=48),
            decided_at=datetime.now(timezone.utc) - timedelta(days=47),
            decision="APPROVED",
            remarks="Survey complete.",
        )
        db.session.add_all([appr1, appr2, appr3, appr4, appr5])
        db.session.flush()

        # ── Escalations ──────────────────────────────────────────────────────
        print("🚨 Creating escalation records...")
        esc1 = Escalation(
            id=_uuid(),
            task_id=p1_tasks[2].id,    # Rebar task
            rule_triggered="approval_pending_days",
            severity="HIGH",
            raised_at=datetime.now(timezone.utc) - timedelta(days=2),
            raised_to_id=pm.id,
            justification=None,
            resolved_at=None,
        )
        esc2 = Escalation(
            id=_uuid(),
            task_id=p1_tasks[2].id,    # Rebar — geo mismatch
            rule_triggered="geo_mismatch",
            severity="MEDIUM",
            raised_at=datetime.now(timezone.utc) - timedelta(days=44),
            raised_to_id=pm.id,
            justification="Contractor confirmed photos were taken at site but GPS signal was weak. Verified in person.",
            resolved_at=datetime.now(timezone.utc) - timedelta(days=43),
        )
        esc3 = Escalation(
            id=_uuid(),
            task_id=p1_tasks[3].id,    # Concrete — critical slip
            rule_triggered="critical_task_slip_days",
            severity="CRITICAL",
            raised_at=datetime.now(timezone.utc) - timedelta(days=1),
            raised_to_id=admin.id,
            justification=None,
            resolved_at=None,
        )
        db.session.add_all([esc1, esc2, esc3])
        db.session.flush()

        db.session.commit()

        # ── Summary ───────────────────────────────────────────────────────────
        print(f"\n✅ Seed complete!")
        print(f"   Users: {User.query.count()}")
        print(f"   Projects: {Project.query.count()}")
        print(f"   Tasks: {Task.query.count()}")
        print(f"   Dependencies: {Dependency.query.count()}")
        print(f"   Evidence: {Evidence.query.count()}")
        print(f"   Approvals: {Approval.query.count()}")
        print(f"   Escalations: {Escalation.query.count()}")
        print(f"   Escalation Rules: {EscalationRule.query.count()}")

        # Show critical path result
        for proj in [p1, p2, p3]:
            tasks = Task.query.filter_by(project_id=proj.id).all()
            crit = [t for t in tasks if t.is_critical]
            print(f"\n   {proj.name}:")
            print(f"     Planned end: {proj.planned_end}, Projected end: {proj.projected_end}")
            late = proj.projected_end and proj.planned_end and proj.projected_end > proj.planned_end
            if late:
                days = (proj.projected_end - proj.planned_end).days
                print(f"     ⚠️  {days} days LATE")
            print(f"     Critical tasks: {len(crit)}")
            for t in crit:
                print(f"       - {t.name} ({t.status}, slack={t.slack_days}d)")


if __name__ == "__main__":
    seed()
