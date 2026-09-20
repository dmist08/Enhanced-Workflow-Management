# Pravi — Infrastructure Project Monitoring System

Pravi is a construction & infrastructure project tracking platform built with a dependency-graph architecture, CPM engine, root cause attribution, and GPS geofence verification.

---

## System Architecture

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
