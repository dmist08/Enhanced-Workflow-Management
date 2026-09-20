# Pravi — Infrastructure Project Monitoring System

Pravi is a construction & infrastructure project tracking platform built with a dependency-graph architecture, CPM engine, root cause attribution, and GPS geofence verification.

---

## System Architecture

### Architecture Diagram
```mermaid
flowchart TD
    %% ── USER / STAKEHOLDER PERSONAS ──
    subgraph Stakeholders ["Stakeholders & Personas"]
        U1["Ministry (CMO)"]
        U2["Finance Head"]
        U3["R&B / PWD Head"]
        U4["Tender Cell"]
        U5["Site Engineer"]
        U6["Super Admin"]
    end

    %% ── PRESENTATION LAYER ──
    subgraph Frontend ["Presentation Layer — Next.js 14 (App Router)"]
        WA["Web App (Next.js)"]
        subgraph Views ["RBAC Modular Views"]
            V1["Project Passport & DAG"]
            V2["Dept Inbox & Approvals"]
            V3["Escalations & Root Cause"]
            V4["Official Chat & Minutes"]
            V5["Reports & CPM Gantt"]
        end
        WA --- Views
    end

    %% ── API GATEWAY & AUTH LAYER ──
    subgraph Gateway ["API Gateway & Security Layer"]
        AGW["API Gateway + Auth Engine<br/>(JWT HttpOnly/Bearer · Role & Dept Scopes · Audit Middleware)"]
    end

    %% ── CORE DOMAIN SERVICES & ENGINES ──
    subgraph Services ["Core Engines & Micro-Modules"]
        S1["Workflow Engine<br/>(Dependency DAG, State Machine, Geo-Gating)"]
        S2["SLA Scheduler<br/>(CPM Forward/Backward Pass, Breach Detection)"]
        S3["Escalation & Decision Service<br/>(Root-Cause Attribution, Justification Gate)"]
        S4["Official Chat Service<br/>(Formal Logs, Query Threads)"]
        S5["Notifications Service<br/>(Email / SMS / In-App Alerts)"]
        S6["AI Service Engine<br/>(Predictive Delays, Decision Drafts)"]
    end

    %% ── PERSISTENCE & EXTERNAL INTEGRATIONS ──
    subgraph Persistence ["Persistence & Storage Layer"]
        DB[("PostgreSQL (Neon)<br/>projects · tasks · dependencies · sla_events<br/>evidence · approvals · escalations · audit")]
        OBJ[("Object Storage (S3 / R2)<br/>site photos · technical drawings · MB documents")]
        AUDIT[("Audit Log<br/>(Append-Only Event Ledger)")]
    end

    subgraph External ["External Intelligence"]
        LLM["LLM Provider<br/>(Claude 3.5 Sonnet / Gemini 1.5 Pro)"]
    end

    %% ── CONNECTIONS ──
    Stakeholders ==>|HTTPS / WSS| WA
    WA ==>|JSON / REST| AGW

    AGW -->|Route & Authorize| S1
    AGW -->|Route & Authorize| S2
    AGW -->|Route & Authorize| S3
    AGW -->|Route & Authorize| S4
    AGW -->|Route & Authorize| S5
    AGW -->|Route & Authorize| S6

    S1 -->|Read / Write| DB
    S2 -->|Schedule & Evaluate| DB
    S3 -->|Query & Resolve| DB
    S4 -->|Store Messages| DB
    S5 -->|Dispatch Events| DB

    S1 -.->|Store Evidence| OBJ
    S3 -.->|Log Decisions| AUDIT
    AGW -.->|Access Log| AUDIT

    S6 <==>|Inference & Summary| LLM
    S6 -.->|Fetch Historical Metrics| DB

    %% ── STYLING ──
    classDef persona fill:#3b2d54,stroke:#7c3aed,stroke-width:1.5px,color:#fff;
    classDef presentation fill:#1e3a8a,stroke:#3b82f6,stroke-width:1.5px,color:#fff;
    classDef gateway fill:#0f766e,stroke:#14b8a6,stroke-width:2px,color:#fff;
    classDef service fill:#78350f,stroke:#f59e0b,stroke-width:1.5px,color:#fff;
    classDef aiService fill:#1e293b,stroke:#818cf8,stroke-width:2px,color:#fff;
    classDef db fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#fff;
    classDef ext fill:#312e81,stroke:#6366f1,stroke-width:1.5px,color:#fff;

    class U1,U2,U3,U4,U5,U6 persona;
    class WA,V1,V2,V3,V4,V5 presentation;
    class AGW gateway;
    class S1,S2,S3,S4,S5 service;
    class S6 aiService;
    class DB,OBJ,AUDIT db;
    class LLM ext;
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
