# Pravi — Infrastructure Project Monitoring System

Pravi is a construction & infrastructure project tracking platform built with a dependency-graph architecture, CPM engine, root cause attribution, and GPS geofence verification.

---

## System Architecture

### Architecture Diagram
```mermaid
flowchart TD
    %% ── 1. USER ROLES ──
    subgraph Users ["Actors & Personas"]
        direction LR
        U1["Super Admin<br/>(Full System Access)"]
        U2["Project Manager<br/>(Schedule & Approvals)"]
        U3["Site Engineer<br/>(Inspection & Evidence)"]
        U4["Contractor<br/>(Task Progress & Claims)"]
    end

    %% ── 2. FRONTEND LAYER ──
    subgraph Frontend ["Frontend Layer — Next.js 14 App Router (Vercel)"]
        direction TB
        AUTH_FE["Auth & Session Manager<br/>(LocalStorage + First-Party Cookie Sync)"]
        SHELL["AppShell & Unified Sidebar<br/>(Role-Based Nav Guard & Active Route State)"]

        subgraph Modules ["Role Modules & Screens"]
            direction TB
            M_ADMIN["Admin Portal<br/>• Dashboard (Stats & Projects)<br/>• Projects & Users CRUD<br/>• Escalation Rules & Resolution"]
            M_PM["PM Portal<br/>• Interactive SVG DAG Graph<br/>• Critical Path & Slack Matrix<br/>• SVG Gantt Chart<br/>• Delay Attribution Banner<br/>• Approvals Queue"]
            M_FIELD["Field Operations (SE & Contractor)<br/>• Task Execution & Status<br/>• GPS Evidence Capture Uploader<br/>• Evidence Log (Geofence distance)"]
        end

        AUTH_FE --> SHELL --> Modules
    end

    %% ── 3. API & SECURITY LAYER ──
    subgraph BackendGateway ["API & Middleware Layer — Flask (Render)"]
        direction TB
        CORS["CORS Dynamic Filter<br/>(Regex for *.vercel.app + Localhost)"]
        AUTH_BE["Auth Middleware (@require_auth)<br/>(JWT HS256 via Bearer Header or Cookie)"]
        GATES["Pre-Write Security & Integrity Gates<br/>• DFS Cycle Rejection (400)<br/>• Evidence Completion Gate (409)<br/>• Escalation Justification Gate"]

        CORS --> AUTH_BE --> GATES
    end

    %% ── 4. PURE ENGINE CORES ──
    subgraph Engines ["Deterministic Pure-Function Engines (No DB I/O)"]
        direction TB
        E1["Propagation Engine<br/>Kahn's Topological Sort<br/>Cascades actual_end to projected dates"]
        E2["Critical Path Engine (CPM)<br/>Forward/Backward Passes<br/>Computes slack_days & is_critical flag"]
        E3["Attribution Engine<br/>Critical Path Backward Walk<br/>Names root-cause task & days late"]
        E4["Geofence Engine<br/>Haversine Great-Circle Formula<br/>Enforces site perimeter (geo_verified)"]
    end

    %% ── 5. PERSISTENCE LAYER ──
    subgraph Database ["Persistence Layer — PostgreSQL (Neon Serverless)"]
        direction LR
        T_USERS[("Users")]
        T_PROJ[("Projects")]
        T_TASKS[("Tasks<br/>(Engine-computed fields)")]
        T_DEPS[("Dependencies<br/>(DAG edges)")]
        T_EVID[("Evidence<br/>(Base64 + GPS)")]
        T_APPR[("Approvals")]
        T_ESCL[("Escalations & Rules")]
    end

    %% ── DATA FLOW CONNECTIONS ──
    Users ==>|HTTPS / REST| Frontend
    Modules ==>|Axios withCredentials + Bearer| BackendGateway
    GATES -->|Passes Clean Graph & Data| Engines
    Engines -->|Computes New Schedule| Database
    GATES -->|CRUD Transactions| Database

    %% ── COMPONENT STYLING ──
    classDef actor fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;
    classDef client fill:#0f172a,stroke:#3b82f6,stroke-width:1.5px,color:#f8fafc;
    classDef api fill:#111827,stroke:#10b981,stroke-width:1.5px,color:#f8fafc;
    classDef engine fill:#311042,stroke:#a855f7,stroke-width:1.5px,color:#f8fafc;
    classDef storage fill:#064e3b,stroke:#059669,stroke-width:1.5px,color:#f8fafc;

    class U1,U2,U3,U4 actor;
    class AUTH_FE,SHELL,M_ADMIN,M_PM,M_FIELD client;
    class CORS,AUTH_BE,GATES api;
    class E1,E2,E3,E4 engine;
    class T_USERS,T_PROJ,T_TASKS,T_DEPS,T_EVID,T_APPR,T_ESCL storage;
```

### Core Architecture Components
- **Backend:** Flask 3.x, SQLAlchemy, PostgreSQL (Neon Serverless), Gunicorn
- **Frontend:** Next.js 14 (App Router, React 18, TypeScript, Tailwind CSS, TanStack Query)
- **Engines (Pure Functions):**
  - **Propagation Engine:** Kahn's topological sort cascading delays across dependency chains.
  - **Critical Path Engine (CPM):** Forward & backward passes computing Earliest/Latest Start & Finish dates, slack days, and critical tasks (`is_critical`).
  - **Attribution Engine:** Backward walk on critical paths identifying the exact task overrun or approval bottleneck causing delays.
  - **Geofence Engine:** Haversine distance validation enforcing photo evidence within project site radius before task completion.

---

## Default Login Credentials

| Role | Email | Password |
|---|---|---|
| **Admin** (Super Admin) | `admin@pravi.dev` | `admin123` |
| **Project Manager** | `pm@pravi.dev` | `pm123` |
| **Site Engineer** | `se@pravi.dev` | `se123` |
| **Contractor** | `contractor@pravi.dev` | `contractor123` |

---

## Local Development Setup

### 1. Backend Setup
```bash
cd backend
python -m pip install -r requirements.txt
```

Configure `backend/.env`:
```env
DATABASE_URL=postgresql://neondb_owner:npg_et6yIHPnmEW1@ep-crimson-grass-b3c46he8-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=super-secret-jwt-key
FRONTEND_ORIGIN=http://localhost:3000
FLASK_ENV=development
```

Seed Database:
```bash
python seed.py
```

Run Backend Server:
```bash
python run.py
# Runs on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Run Next.js Dev Server:
```bash
npm run dev
# Runs on http://localhost:3000
```

---

## Production Deployment

### Backend (Fly.io)
1. Install `flyctl` CLI.
2. Inside `/backend`:
   ```bash
   fly launch
   fly secrets set DATABASE_URL="postgresql://..." JWT_SECRET="..." FRONTEND_ORIGIN="https://your-frontend.vercel.app" FLASK_ENV="production"
   fly deploy
   ```

### Frontend (Vercel)
1. Push repository to GitHub.
2. In Vercel, set root directory to `frontend`.
3. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend.fly.dev`
4. Deploy.
