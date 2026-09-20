# Pravi Hackathon — Construction & Infrastructure Project Monitoring System

**Problem statement:** PS2 — Building an enhanced workflow management and construction project monitoring system for improved infrastructure delivery.

**Build context:** Solo, 5-hour campus placement hackathon. Code generated primarily via Antigravity (agentic AI IDE). This document is the single source of truth — feed it to Antigravity as project context before generating any code.

**Core differentiator (do not let this get diluted):** most competing teams will build a flat task list with a status dropdown. This system instead models tasks as a **dependency graph**, computes a **critical path**, automatically **propagates delays** downstream, and gates task completion behind **geo-verified photo evidence**. Three engines (propagation, critical path, attribution) are the technical core and must be implemented correctly, even if screen count elsewhere is cut.

---

## 1. Tech stack (final — do not add services beyond this list)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) | Deployed on Vercel, free tier |
| Backend | Flask (Python) | Deployed on Fly.io, free persistent allowance |
| Database | Postgres | Hosted on Neon, free tier, does not expire |
| ORM | SQLAlchemy | |
| Auth | Signed session cookie or simple JWT | No NextAuth, no OAuth, no third-party auth provider |
| File storage | Local filesystem or base64-in-DB for evidence photos | No S3/Cloudinary |
| Styling | Tailwind + shadcn/ui | |
| Charts | Recharts | For timeline/Gantt-style bars only |

**Explicitly excluded — do not add these even if Antigravity suggests them:** microservices, message queues, websockets, real-time notifications, chat/messaging system, LLM/AI integration of any kind, Docker, multi-tenancy, third-party auth, mobile app, PDF export, email/SMS integration.

---

## 2. Data model

Eight domain tables + one auth table. `projected_*` fields and `is_critical`/`slack_days` on `Task` are **engine-computed only** — the API must reject any client PATCH attempting to set these directly.

```sql
User (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN','PROJECT_MANAGER','SITE_ENGINEER','CONTRACTOR')),
  created_at    TIMESTAMP DEFAULT now()
)

Project (
  id                UUID PRIMARY KEY,
  name              TEXT NOT NULL,
  department        TEXT,
  site_lat          FLOAT NOT NULL,
  site_lng          FLOAT NOT NULL,
  geofence_radius_m FLOAT NOT NULL DEFAULT 200,
  budget            NUMERIC,
  planned_start     DATE NOT NULL,
  planned_end       DATE NOT NULL,
  projected_end     DATE,              -- engine-computed
  manager_id        UUID REFERENCES "User"(id),
  status            TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  created_at        TIMESTAMP DEFAULT now()
)

Task (
  id                    UUID PRIMARY KEY,
  project_id            UUID NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  phase                 TEXT,
  owner_id              UUID REFERENCES "User"(id),
  planned_start         DATE NOT NULL,
  planned_duration_days INT NOT NULL CHECK (planned_duration_days > 0),
  actual_start          DATE,
  actual_end            DATE,
  projected_start       DATE,          -- engine-computed
  projected_end         DATE,          -- engine-computed
  status                TEXT DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED')),
  is_critical           BOOLEAN DEFAULT false,   -- engine-computed
  slack_days            INT DEFAULT 0,           -- engine-computed
  created_at            TIMESTAMP DEFAULT now()
)

Dependency (
  id                  UUID PRIMARY KEY,
  predecessor_task_id UUID NOT NULL REFERENCES Task(id) ON DELETE CASCADE,
  successor_task_id   UUID NOT NULL REFERENCES Task(id) ON DELETE CASCADE,
  CHECK (predecessor_task_id <> successor_task_id),
  UNIQUE (predecessor_task_id, successor_task_id)
)

Approval (
  id              UUID PRIMARY KEY,
  task_id         UUID NOT NULL REFERENCES Task(id) ON DELETE CASCADE,
  requested_by_id UUID REFERENCES "User"(id),
  approver_id     UUID REFERENCES "User"(id),
  requested_at    TIMESTAMP DEFAULT now(),
  decided_at      TIMESTAMP,
  decision        TEXT CHECK (decision IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  remarks         TEXT
)

Evidence (
  id                  UUID PRIMARY KEY,
  task_id             UUID NOT NULL REFERENCES Task(id) ON DELETE CASCADE,
  photo_path          TEXT NOT NULL,
  lat                 FLOAT NOT NULL,
  lng                 FLOAT NOT NULL,
  captured_at         TIMESTAMP DEFAULT now(),
  distance_from_site_m FLOAT,          -- computed at upload time
  geo_verified        BOOLEAN,         -- computed at upload time
  uploaded_by_id      UUID REFERENCES "User"(id)
)

Escalation (
  id             UUID PRIMARY KEY,
  task_id        UUID REFERENCES Task(id) ON DELETE CASCADE,
  rule_triggered TEXT NOT NULL,
  severity       TEXT CHECK (severity IN ('MEDIUM','HIGH','CRITICAL')),
  raised_at      TIMESTAMP DEFAULT now(),
  raised_to_id   UUID REFERENCES "User"(id),
  justification  TEXT,                  -- mandatory before resolution
  resolved_at    TIMESTAMP
)

EscalationRule (
  id              UUID PRIMARY KEY,
  condition_key   TEXT NOT NULL,   -- e.g. 'approval_pending_days'
  threshold       FLOAT NOT NULL,
  severity        TEXT NOT NULL,
  escalate_to_role TEXT NOT NULL
)
```

### Seed default escalation rules
```json
[
  {"condition_key": "approval_pending_days", "threshold": 3, "severity": "HIGH", "escalate_to_role": "PROJECT_MANAGER"},
  {"condition_key": "critical_task_slip_days", "threshold": 0, "severity": "CRITICAL", "escalate_to_role": "ADMIN"},
  {"condition_key": "geo_mismatch", "threshold": 1, "severity": "MEDIUM", "escalate_to_role": "PROJECT_MANAGER"}
]
```

---

## 3. RBAC permission matrix

| Action | Admin | PM | Site Engineer | Contractor |
|---|---|---|---|---|
| Create/edit/delete project | ✅ | ❌ | ❌ | ❌ |
| Create users, assign roles | ✅ | ❌ | ❌ | ❌ |
| Edit escalation rules | ✅ | ❌ | ❌ | ❌ |
| Create tasks + dependencies | ✅ | ✅ (own projects) | ❌ | ❌ |
| Update task status | ✅ | ✅ | ✅ (assigned only) | ✅ (assigned only) |
| Upload evidence | ✅ | ✅ | ✅ (assigned only) | ✅ (assigned only) |
| Request approval | — | — | ✅ | ✅ |
| Decide approval | ✅ | ✅ | ❌ | ❌ |
| View portfolio dashboard (all projects) | ✅ | ❌ (own only) | ❌ | ❌ |
| View escalations | ✅ (all) | ✅ (own projects) | own tasks only | own tasks only |

**Enforcement rule:** every permission check happens server-side, in Flask, on every request — never trust the frontend to hide a button as the only guard. A hidden button plus an unguarded endpoint is not RBAC.

---

## 4. Core engines — algorithms and edge cases

Write these three engines as pure functions (no DB calls inside the function body — pass data in, return data out). This makes them independently testable, which matters because they are what you'll be asked to explain.

### 4.1 Propagation engine
Runs whenever a task's `status`, `actual_start`, or `actual_end` changes.

```
1. Topologically sort all tasks in the project via Dependency edges.
2. For each task in topological order:
     projected_start = max(planned_start, max(projected_end of all predecessors, default 0))
     if status == COMPLETED and actual_end is set:
         projected_end = actual_end
     else:
         remaining_duration = planned_duration_days  (or recompute from actual_start if in progress)
         projected_end = projected_start + remaining_duration
3. Project.projected_end = max(projected_end) across all sink tasks (tasks with no successor).
```

**Edge cases to handle:**
- A task with no dependencies at all → `projected_start = planned_start`, unaffected by the graph.
- A task with multiple predecessors → must wait for the *latest* one (`max`, not `min` or average).
- A cycle in the dependency graph → topological sort will fail. Detect this at `POST /dependencies` time (before insert) using a DFS cycle check; reject the write with the cycle path in the error message. Never let a cycle reach the DB.
- A task marked `COMPLETED` with an `actual_end` earlier than its `projected_end` → propagation should still use `actual_end` as ground truth, which may *improve* downstream dates (early finish propagates too, not just delays).
- Self-referencing dependency (`predecessor_task_id == successor_task_id`) → rejected at the DB constraint level (`CHECK` above) and re-validated in the API layer with a clear error.
- Orphaned task (no project) → should not be possible given the foreign key; if `project_id` is null, reject at insert.

### 4.2 Critical path engine
Runs after propagation, on the same task set.

```
1. Forward pass: earliest_start / earliest_finish per task (same logic as propagation).
2. Backward pass: starting from project planned_end, walk predecessors in reverse topological order.
     latest_finish(task) = min(latest_start of all successors, project planned_end if sink)
     latest_start(task)  = latest_finish(task) - planned_duration_days
3. slack_days = latest_start - earliest_start
4. is_critical = (slack_days == 0)
```

**Edge cases:**
- Multiple parallel critical paths (slack = 0 on more than one chain) → this is valid and expected; highlight all of them, don't assume a single path.
- A task with no successors (a sink) → `latest_finish` = project's planned_end directly.
- Disconnected task (isolated node, no predecessors or successors) → still gets a slack value computed against the project's planned_end; typically has large positive slack.

### 4.3 Attribution engine
Runs on demand (`GET /projects/:id/attribution`), or after any propagation that increases `Project.projected_end`.

```
1. Walk the critical path (is_critical == true tasks) in order of projected_end, latest first.
2. For each critical task, check in order:
     a. Did actual_duration exceed planned_duration_days? → root cause = "task overrun"
     b. Is there a PENDING approval on this task older than the approval_pending_days threshold? → root cause = "approval bottleneck"
3. Return the first match found walking backward from the last critical task.
4. Output: { task_name, owner_name, cause_type, days_late, since_date }
   Rendered as one sentence: "Projected {N} days late. Root cause: {task_name} ({owner_name}), {cause_type} since {since_date}."
```

**Edge cases:**
- No critical task has overrun or a stale approval (project is late for a reason not modeled, e.g. planned dates were simply wrong) → return `cause_type = "unattributed"` and say so plainly in the UI rather than guessing.
- Project is currently on time (`projected_end <= planned_end`) → attribution engine returns null / "no delay detected", and the UI should not render a red banner.
- Multiple candidate causes tie on the same task → task overrun takes priority over approval bottleneck (work delay is the more direct cause).

---

## 5. API contract

All endpoints require a valid session; role is read from the session, never from a request body or query param.

```
POST   /auth/login                        — all roles
POST   /auth/logout

# Admin
GET    /admin/projects
POST   /admin/projects
PATCH  /admin/projects/:id
DELETE /admin/projects/:id
GET    /admin/users
POST   /admin/users
PATCH  /admin/users/:id
GET    /admin/escalation-rules
PATCH  /admin/escalation-rules/:id

# PM
GET    /pm/projects                       — filtered to manager_id == current user
GET    /pm/projects/:id
POST   /pm/projects/:id/tasks
PATCH  /pm/tasks/:id                      — name/phase/planned dates only, never projected_*
POST   /pm/tasks/:id/dependencies
GET    /pm/approvals/pending
PATCH  /approvals/:id/decide              — Admin, PM

# Site Engineer / Contractor
GET    /me/tasks                          — filtered to owner_id == current user
PATCH  /tasks/:id/status                  — assigned user only, triggers propagation
POST   /tasks/:id/evidence                — runs geofence check inline
POST   /tasks/:id/approval-request
GET    /me/approvals

# Shared read endpoints (role-filtered server-side)
GET    /projects/:id/tasks
GET    /tasks/:id
GET    /tasks/:id/dependencies
GET    /tasks/:id/evidence
GET    /projects/:id/critical-path
GET    /projects/:id/attribution
GET    /escalations                       — role-filtered per RBAC matrix
PATCH  /escalations/:id/resolve           — requires justification text, Admin/PM only
```

**Validation edge cases every write endpoint must handle:**
- Missing/malformed JSON body → 400 with a field-level error, not a stack trace.
- Foreign key referencing a nonexistent record (e.g. `owner_id` not a real user) → 404, not a raw DB integrity error leaking to the client.
- A `PATCH /tasks/:id/status` attempting to set status to `COMPLETED` while its evidence gate is not satisfied (see §6) → 409 Conflict with a clear message.
- A `PATCH` attempting to write `projected_start`, `projected_end`, `is_critical`, or `slack_days` directly → these fields are stripped server-side before the update is applied, silently ignored, not erroring the whole request.
- Role attempting an action outside its matrix row → 403, not 404 (don't leak whether the resource exists).

---

## 6. Evidence gate (geofence check)

Runs inline inside `POST /tasks/:id/evidence`.

```
1. Compute Haversine distance between (evidence.lat, evidence.lng) and (project.site_lat, project.site_lng).
2. distance_from_site_m = haversine(...)
3. geo_verified = distance_from_site_m <= project.geofence_radius_m
4. If not geo_verified: create an Escalation with rule_triggered = 'geo_mismatch', severity = MEDIUM. Do NOT reject the upload — flag it, don't block the worker.
5. A task may only move to status = COMPLETED if it has at least one Evidence row with geo_verified = true. Enforce this check inside PATCH /tasks/:id/status.
```

**Edge cases:**
- Browser geolocation denied or unavailable → frontend must offer a manual lat/lng entry fallback so the demo never blocks on device permissions.
- `geofence_radius_m` not set on a project → default to 200m at the DB level (already in schema).
- Multiple evidence uploads, some verified some not → task only needs one verified entry to unlock completion; don't require all of them to pass.

---

## 7. Frontend route map

```
/login

/admin/dashboard              — org-wide: all projects, all escalations, all users
/admin/projects               — list, create, edit, delete
/admin/projects/[id]
/admin/users                  — list, create, assign roles
/admin/escalation-rules       — edit thresholds

/pm/dashboard                 — own projects, status summary
/pm/projects/[id]             — task list, create task, build dependency graph, critical path view, attribution banner
/pm/projects/[id]/tasks/[tid] — edit task, approval history
/pm/approvals                 — pending queue

/se/dashboard                 — assigned tasks (Site Engineer)
/se/tasks/[id]                — update status, upload evidence, request approval
/se/evidence-log              — own upload history, verified/flagged

/contractor/dashboard         — assigned tasks
/contractor/tasks/[id]        — update status, upload evidence, request approval
/contractor/approvals         — own request history
```

**UI edge cases:**
- Empty states: a PM with zero projects, a worker with zero assigned tasks — every list view needs a real empty state, not a blank screen (this is the single most common thing that reads as "broken" in a demo).
- Loading states on every data fetch, however brief.
- A task with zero dependencies should render cleanly in the graph view (a single isolated node), not error.
- Role-mismatch on direct URL access (e.g. Contractor navigating to `/admin/projects`) → redirect to their own dashboard, not a 403 white screen.

---

## 8. Seed data (write this script first — it doubles as your demo script)

Generate, via a Python seed script:
- 4 users: 1 Admin, 1 PM, 1 Site Engineer, 1 Contractor
- 3 projects, realistic names and coordinates
- ~10 tasks per project with a real dependency chain (not a flat list — include at least one task with 2 predecessors)
- **Deliberately seed 2 delayed chains** — one task per project with `actual_duration > planned_duration`, so propagation/critical-path/attribution all have something real to compute
- **Deliberately seed 1 stale approval** (`requested_at` more than 3 days ago, `decision = PENDING`) — this is what your escalation demo fires on
- **Deliberately seed 1 out-of-geofence evidence upload** — this is what your geo-mismatch escalation demo fires on
- Confirm the dependency graph is acyclic before inserting (run your own cycle check against the seed data)

---

## 9. Build phases — sequential, with verification gates

Do not start a phase until the previous phase's gate passes. If a gate fails, fix it before moving on — a broken foundation compounds every phase after it.

### Phase 0 — Setup (target: 25 min)
- Initialize Next.js + Flask repos (or monorepo), Prisma/SQLAlchemy config against a local Postgres, `.env` for Neon connection string
- Create all 9 tables via migration
- **Gate:** migration runs clean, all tables visible in a DB client, foreign keys enforced (try inserting a Task with a bogus project_id, confirm it's rejected)

### Phase 1 — Seed + auth (target: 45 min)
- Write and run the seed script from §8
- Implement `/auth/login`, `/auth/logout`, session handling, role read from session
- **Gate:** can log in as each of the 4 seeded users and get a session reflecting the correct role; seeded data query returns the expected counts

### Phase 2 — Engines (target: 75 min) — highest priority phase, do not shortcut
- Implement propagation, critical path, attribution as pure functions per §4
- Write a hand-computed 5-task test case (on paper first) and confirm the functions match it exactly
- **Gate:** the hand-computed test passes; a cycle-inducing dependency insert is rejected with a clear error; a task with 2 predecessors correctly waits for the later one

### Phase 3 — Core write endpoints (target: 60 min)
- `/admin/projects`, `/pm/projects/:id/tasks`, `/pm/tasks/:id/dependencies`, `/tasks/:id/status` (wired to propagation), `/tasks/:id/evidence` (wired to geofence check), `/tasks/:id/approval-request`, `/approvals/:id/decide`
- **Gate:** a full manual walkthrough via curl/Postman — create project → create tasks → link dependency → update status → confirm propagation ran → upload evidence → confirm geo_verified computed correctly → request approval → decide it

### Phase 4 — PM + Site Engineer/Contractor screens (target: 75 min) — this is your demo core, prioritize over Admin screens
- `/pm/dashboard`, `/pm/projects/[id]` (with critical path highlighting + attribution banner), `/se/dashboard`, `/se/tasks/[id]`, `/contractor/dashboard`, `/contractor/tasks/[id]`
- **Gate:** click through the full loop in §7's UI edge case list — PM creates a task, worker updates status, evidence upload, approval request, decision — with no console errors

### Phase 5 — Admin screens + escalations (target: 45 min) — lowest priority, cut first if behind schedule
- `/admin/dashboard`, `/admin/projects`, `/admin/users`, `/admin/escalation-rules`, `/escalations` feed with resolve+justification flow
- **Gate:** escalation feed shows the 2 seeded escalation triggers (stale approval, geo mismatch); resolving one requires justification text and is rejected without it

### Phase 6 — Deploy (target: 30 min)
- Push Flask to Fly.io, connect to Neon, push Next.js to Vercel with API URL env var
- **Gate:** the live URL loads, login works, and the full demo loop from Phase 4's gate works against the deployed instance, not just localhost

### Phase 7 — Polish + rehearsal (target: 30 min, non-negotiable, do not skip)
- Fix any remaining console errors or broken empty states
- Rehearse the 3-minute demo twice
- Prepare answers for: cycle detection, scale to 5,000 projects (propagation is per-project, O(V+E), recomputed on write not on read), geotag spoofing (client coordinates are not tamper-proof; real mitigation would be server-side EXIF extraction — state this as a known, scoped-out limitation)

**Fallback ladder if running behind at the Phase 3→4 boundary (roughly the 3-hour mark):**
1. Engines (Phase 2) — never cut, this is the whole point
2. PM + Site Engineer loop (Phase 4) — cut Contractor screens down to a copy of Site Engineer's before cutting this
3. Contractor screens — acceptable to leave thin/read-only if time-constrained
4. Admin screens (Phase 5) — safest thing to cut entirely; generic CRUD forms are the least differentiated part of the build and the least likely to be missed by a judge watching the demo

---

## 10. Deployment reference

- **Neon:** create project, copy the Postgres connection string, set as `DATABASE_URL` in Fly.io secrets
- **Fly.io:** `fly launch` in the Flask directory, confirm `fly.toml` app name, `fly deploy`, set secrets via `fly secrets set DATABASE_URL=...`
- **Vercel:** connect the Next.js repo via GitHub, set `NEXT_PUBLIC_API_URL` to the Fly.io app URL, deploy on push
- CORS: Flask must explicitly allow the Vercel domain as an origin — set this before Phase 6, not during it

---

## 11. Non-goals (explicitly out of scope — do not implement even if suggested)

Real-time notifications, websockets, chat/messaging, LLM or AI-assisted features, email/SMS integration, PDF export, mobile-responsive polish beyond basic usability, multi-tenancy, OAuth/social login, file storage beyond local/base64, Docker, CI/CD pipelines, automated test suites (manual gate-checking per phase is the testing strategy for this timebox).
