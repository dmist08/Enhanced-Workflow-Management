# Pravi — Infrastructure Project Monitoring System

Pravi is a dependency-graph-driven project monitoring platform built for large-scale infrastructure and construction projects. It replaces manual progress reports and static spreadsheets with an automated Critical Path Method (CPM) engine, deterministic delay attribution, and GPS geofence verification.

---

## Live Production Deployments

| Component | Platform | Live URL | Status |
|---|---|---|---|
| **Frontend Web App** | Vercel | [https://enhanced-workflow-management-theta.vercel.app](https://enhanced-workflow-management-theta.vercel.app) | `Active` |
| **Backend API** | Render | [https://enhanced-workflow-management-backend.onrender.com](https://enhanced-workflow-management-backend.onrender.com) | `Active` (Health: [`/health`](https://enhanced-workflow-management-backend.onrender.com/health)) |
| **Database** | Neon Serverless | AWS Asia Pacific (Singapore) | `PostgreSQL 16` |

---

## Default Login Credentials

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Super Admin** | `admin@projectmgmt.dev` | `admin123` | Full system governance, project creation, user management, escalation resolution |
| **Project Manager** | `pm@projectmgmt.dev` | `pm123` | Project scheduling, dependency DAG, Gantt CPM tracking, approvals decisioning |
| **Site Engineer** | `se@projectmgmt.dev` | `se123` | Field task execution, GPS geofenced evidence capture, approval requests |
| **Contractor** | `contractor@projectmgmt.dev` | `contractor123` | Work parcel execution, field photo uploads, approval submission tracking |

---

## Organizational Hierarchy & Role Governance

The platform operates on a strict 4-level functional hierarchy designed to enforce segregation of duties between executive governance, schedule control, quality inspection, and physical execution:

```
[ Level 1: Super Admin ]
       │  (Global governance, project creation, user provisioning, escalation arbitration)
       ▼
[ Level 2: Project Manager ]
       │  (CPM scheduling, dependency DAGs, delay attribution, approval decisions)
       ▼
[ Level 3: Site Engineer ]
       │  (Field supervision, GPS-verified evidence compliance, inspection sign-offs)
       ▼
[ Level 4: Contractor ]
          (Physical execution, task updates, progress evidence submission)
```

### Role Access & Capability Matrix

| Operational Capability | Level 1: Super Admin | Level 2: Project Manager | Level 3: Site Engineer | Level 4: Contractor |
|---|:---:|:---:|:---:|:---:|
| **Create & Configure Projects** (site GPS, geofence radius, budget) | :white_check_mark: | :x: | :x: | :x: |
| **User Lifecycle & Role Assignment** | :white_check_mark: | :x: | :x: | :x: |
| **Escalation Rules & Mandatory Justification Resolution** | :white_check_mark: | :x: | :x: | :x: |
| **Dependency DAG & CPM Scheduling** (Kahn's topo sort, float analysis) | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Root-Cause Delay Attribution Dashboard** | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Task Approval Decisioning** (Approve / Reject with remarks) | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Submit Approval Requests** | :x: | :x: | :white_check_mark: | :white_check_mark: |
| **GPS Geofence Evidence Upload** (Haversine site proximity check) | :x: | :x: | :white_check_mark: | :white_check_mark: |
| **Complete Task** *(Enforced by Evidence Gate: requires ≥1 verified photo)* | :x: | :x: | :white_check_mark: | :white_check_mark: |

---

## System Architecture

### Architecture Diagram
```mermaid
flowchart TD
    %% ── TIER 1: ACTORS (Horizontal) ──
    subgraph USERS ["Actors & Roles"]
        direction LR
        U1["Super Admin"]
        U2["Project Manager"]
        U3["Site Engineer"]
        U4["Contractor"]
    end

    %% ── TIER 2: FRONTEND PORTALS (Side by Side) ──
    subgraph FE ["Frontend Layer — Next.js 14 App Router (Vercel)"]
        direction LR
        FE_ADMIN["Admin Portal<br/>Projects, Users & Escalations"]
        FE_PM["PM Studio<br/>SVG DAG Graph, Gantt & Attribution"]
        FE_FIELD["Field Operations<br/>Task Updates & GPS Photo Evidence"]
    end

    %% ── TIER 3: BACKEND API & ENGINES (Side by Side) ──
    subgraph BACKEND ["Backend Core — Flask 3 (Render)"]
        direction LR
        subgraph API ["Gateway & Integrity Gates"]
            direction TB
            A1["REST API & JWT Auth"]
            A2["Integrity Rules<br/>DFS Cycle Check · Evidence Gate"]
            A1 --> A2
        end

        subgraph ENGINES ["Mathematical Engines (Pure Functions)"]
            direction TB
            E1["Propagation Engine<br/>Topological delay cascade"]
            E2["Critical Path Engine (CPM)<br/>Earliest/latest dates & slack"]
            E3["Attribution Engine<br/>Root-cause delay identification"]
            E4["Geofence Engine<br/>Haversine GPS perimeter check"]
        end

        A2 <==>|Graph & Dates| ENGINES
    end

    %% ── TIER 4: DATABASE (Single Clean Row) ──
    subgraph DB ["Persistence — PostgreSQL (Neon Serverless)"]
        direction LR
        D1[("Projects · Tasks & DAG Dependencies · Evidence & GPS · Approvals · Escalations")]
    end

    %% ── FLOW ARROWS ──
    USERS ==>|HTTPS| FE
    FE ==>|JSON / REST + JWT Bearer| A1
    A2 ==>|SQLAlchemy Transactions| D1

    %% ── STYLING ──
    classDef actor fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;
    classDef fe fill:#0f172a,stroke:#3b82f6,stroke-width:1.5px,color:#f8fafc;
    classDef be fill:#111827,stroke:#10b981,stroke-width:1.5px,color:#f8fafc;
    classDef eng fill:#2e1065,stroke:#a855f7,stroke-width:1.5px,color:#f8fafc;
    classDef db fill:#064e3b,stroke:#059669,stroke-width:1.5px,color:#f8fafc;

    class U1,U2,U3,U4 actor;
    class FE_ADMIN,FE_PM,FE_FIELD fe;
    class A1,A2 be;
    class E1,E2,E3,E4 eng;
    class D1 db;
```

---

## Core Engines & Architectural Invariants

The core differentiator of Pravi is that its scheduling, routing, and delay attribution engines are **deterministic pure functions** with zero database I/O inside the algorithm:

1. **Propagation Engine (`backend/app/engines/propagation.py`)**:
   - Uses Kahn’s Topological Sort (`O(V + E)`).
   - Ground truth is anchored by `actual_end` on completed tasks.
   - For downstream tasks: `projected_start = max(predecessor projected_ends)`.
   - Any upstream slip cascades mathematically through every downstream dependent task.

2. **Critical Path Engine (`backend/app/engines/critical_path.py`)**:
   - Performs standard CPM Forward Pass ($ES, EF$) and Backward Pass ($LS, LF$).
   - Calculates total float: $\text{slack\_days} = LS - ES$.
   - Identifies critical path tasks (`is_critical = True`) where slack $\le 0$.

3. **Root-Cause Attribution Engine (`backend/app/engines/attribution.py`)**:
   - When a project slips (`projected_end > planned_end`), walks the critical path backward.
   - Identifies whether the delay was driven by a **Task Overrun** or an **Approval Bottleneck**.
   - Generates a human-readable one-line executive summary displayed on the PM dashboard banner.

4. **Geofence Engine (`backend/app/engines/geofence.py`)**:
   - Applies the Haversine spherical formula between device GPS coordinates and the project site center.
   - Enforces geofence perimeter validation (`geo_verified = True/False`).

### Hard Integrity Constraints
- **Cycle Rejection (`400 Bad Request`)**: Circular dependencies ($A \to B \to C \to A$) are detected via DFS traversal and rejected before writing to the database.
- **Evidence Gate (`409 Conflict`)**: A task cannot be marked `COMPLETED` without at least one geo-verified photographic evidence record.
- **Justification Gate**: Resolving escalations requires a mandatory textual justification describing the remediation action.
- **Cross-Domain Session Handshake**: Dual-mode authentication supporting both HttpOnly cookies and `Authorization: Bearer <token>` with dynamic CORS origin matching for `*.vercel.app`.

---

## Local Development Setup

### Prerequisites
- Node.js ≥ 18
- Python ≥ 3.11
- PostgreSQL connection string (e.g. Neon)

### 1. Backend Setup
```bash
cd backend
python -m pip install -r requirements.txt
```

Create `backend/.env`:
```env
DATABASE_URL=postgresql://neondb_owner:...@ep-...aws.neon.tech/neondb?sslmode=require
JWT_SECRET=your-secret-key
FRONTEND_ORIGIN=http://localhost:3000
FLASK_ENV=development
```

Seed Database with initial projects, critical paths, and test users:
```bash
python seed.py
```

Start Backend Server:
```bash
python run.py
# Running on http://127.0.0.1:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Start Next.js Dev Server:
```bash
npm run dev
# Running on http://localhost:3000
```
