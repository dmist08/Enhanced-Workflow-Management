import unittest
from datetime import date
from app.engines.geofence import haversine, is_within_geofence
from app.engines.propagation import run_propagation, has_cycle_after_add
from app.engines.critical_path import run_critical_path
from app.engines.attribution import run_attribution


class TestGeofenceEngine(unittest.TestCase):
    def test_within_geofence(self):
        # Gateway of India coordinates ~50m apart
        dist, verified = is_within_geofence(18.9220, 72.8347, 18.9221, 72.8348, 200)
        self.assertTrue(verified)
        self.assertLess(dist, 200)

    def test_outside_geofence(self):
        # ~7.8km apart
        dist, verified = is_within_geofence(18.9220, 72.8347, 18.9700, 72.8900, 200)
        self.assertFalse(verified)
        self.assertGreater(dist, 200)


class TestPropagationEngine(unittest.TestCase):
    def setUp(self):
        self.tasks = [
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
        self.deps = [
            {"predecessor_task_id": "T1", "successor_task_id": "T3"},
            {"predecessor_task_id": "T2", "successor_task_id": "T3"},
            {"predecessor_task_id": "T3", "successor_task_id": "T4"},
            {"predecessor_task_id": "T4", "successor_task_id": "T5"},
        ]

    def test_topological_propagation(self):
        updated, proj_end = run_propagation(self.tasks, self.deps)
        tm = {t["id"]: t for t in updated}
        self.assertEqual(tm["T1"]["projected_end"], "2026-01-06")
        self.assertEqual(tm["T2"]["projected_end"], "2026-01-04")
        self.assertEqual(tm["T3"]["projected_start"], "2026-01-06")
        self.assertEqual(tm["T3"]["projected_end"], "2026-01-10")
        self.assertEqual(tm["T4"]["projected_start"], "2026-01-10")
        self.assertEqual(tm["T4"]["projected_end"], "2026-01-12")
        self.assertEqual(tm["T5"]["projected_end"], "2026-01-13")
        self.assertEqual(proj_end, date(2026, 1, 13))

    def test_cycle_detection(self):
        cycle, _ = has_cycle_after_add(self.deps, "T5", "T1", ["T1", "T2", "T3", "T4", "T5"])
        self.assertTrue(cycle)

    def test_self_reference_cycle(self):
        cycle, _ = has_cycle_after_add(self.deps, "T3", "T3", ["T1", "T2", "T3", "T4", "T5"])
        self.assertTrue(cycle)


class TestCriticalPathEngine(unittest.TestCase):
    def test_cpm_slack_and_critical_flag(self):
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

        result = run_critical_path(tasks, deps, date(2026, 1, 13))
        tm = {t["id"]: t for t in result}

        self.assertTrue(tm["T1"]["is_critical"])
        self.assertFalse(tm["T2"]["is_critical"])
        self.assertTrue(tm["T3"]["is_critical"])
        self.assertTrue(tm["T4"]["is_critical"])
        self.assertTrue(tm["T5"]["is_critical"])
        self.assertEqual(tm["T2"]["slack_days"], 2)


class TestAttributionEngine(unittest.TestCase):
    def test_no_delay(self):
        # Empty tasks or tasks ending before planned end returns None
        res = run_attribution(
            critical_tasks=[],
            approvals=[],
            escalation_rules=[],
            project_planned_end=date(2026, 1, 20)
        )
        self.assertIsNone(res)

    def test_task_overrun_attribution(self):
        critical_tasks = [
            {
                "id": "T1",
                "name": "Excavation",
                "owner_name": "Rohan",
                "owner_id": "U1",
                "planned_duration_days": 5,
                "actual_start": "2026-01-01",
                "actual_end": "2026-01-10",  # took 9 days instead of 5 -> 4 days overrun
                "projected_end": "2026-01-25",
            }
        ]
        res = run_attribution(
            critical_tasks=critical_tasks,
            approvals=[],
            escalation_rules=[],
            project_planned_end=date(2026, 1, 20)
        )
        self.assertIsNotNone(res)
        self.assertEqual(res["cause_type"], "task_overrun")
        self.assertEqual(res["days_late"], 5)
        self.assertIn("Excavation", res["sentence"])

    def test_approval_bottleneck_attribution(self):
        critical_tasks = [
            {
                "id": "T2",
                "name": "Piling Works",
                "owner_name": "Deepak",
                "owner_id": "U2",
                "planned_duration_days": 5,
                "actual_start": None,
                "actual_end": None,
                "projected_end": "2026-01-25",
            }
        ]
        approvals = [
            {
                "task_id": "T2",
                "decision": "PENDING",
                "requested_at": "2026-01-01T10:00:00Z"
            }
        ]
        rules = [
            {"condition_key": "approval_pending_days", "threshold": 3.0}
        ]
        res = run_attribution(
            critical_tasks=critical_tasks,
            approvals=approvals,
            escalation_rules=rules,
            project_planned_end=date(2026, 1, 20)
        )
        self.assertIsNotNone(res)
        self.assertEqual(res["cause_type"], "approval_bottleneck")
        self.assertEqual(res["days_late"], 5)
        self.assertIn("approval bottleneck", res["sentence"])


if __name__ == "__main__":
    unittest.main()
