# Pravi — Infrastructure Project Monitoring System

Pravi is a construction & infrastructure project tracking platform built with a dependency-graph architecture, CPM engine, root cause attribution, and GPS geofence verification.

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
