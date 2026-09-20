// Shared types for the frontend

export interface Task {
  id: string;
  project_id: string;
  name: string;
  phase: string | null;
  owner_id: string | null;
  owner_name: string | null;
  planned_start: string;
  planned_duration_days: number;
  actual_start: string | null;
  actual_end: string | null;
  projected_start: string | null;
  projected_end: string | null;
  status: string;
  is_critical: boolean;
  slack_days: number;
}

export interface Project {
  id: string;
  name: string;
  department: string | null;
  site_lat: number;
  site_lng: number;
  geofence_radius_m: number;
  budget: number | null;
  planned_start: string;
  planned_end: string;
  projected_end: string | null;
  manager_id: string | null;
  manager_name: string | null;
  status: string;
}

export interface Dependency {
  id: string;
  predecessor_task_id: string;
  successor_task_id: string;
}

export interface Approval {
  id: string;
  task_id: string;
  requested_by_id: string | null;
  requested_by_name: string | null;
  approver_id: string | null;
  approver_name: string | null;
  requested_at: string;
  decided_at: string | null;
  decision: string;
  remarks: string | null;
}

export interface Evidence {
  id: string;
  task_id: string;
  task_name?: string | null;
  lat: number;
  lng: number;
  captured_at: string;
  distance_from_site_m: number | null;
  geo_verified: boolean | null;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
}

export interface Escalation {
  id: string;
  task_id: string | null;
  task_name: string | null;
  rule_triggered: string;
  severity: string;
  raised_at: string;
  raised_to_id: string | null;
  raised_to_name: string | null;
  justification: string | null;
  resolved_at: string | null;
}

export interface EscalationRule {
  id: string;
  condition_key: string;
  threshold: number;
  severity: string;
  escalate_to_role: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Attribution {
  task_id: string | null;
  task_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  cause_type: string;
  days_late: number;
  since_date: string | null;
  sentence: string;
}
