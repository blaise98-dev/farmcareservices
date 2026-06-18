# 🐄 MooMe — IoT-AI Smart Dairy Farm Management Platform

A **real-time web application** that connects directly to your IoT sensor database and gives farmers, veterinarians, and administrators a live view of everything happening on the farm — temperatures, milk production, feeding, health alerts, and AI predictions.

---

## Architecture

```
MooMe IoT Sensors (Raspberry Pi)
        │
        ▼ writes to
   MySQL Database (MooMeSystem)
        │
        ▼ reads from
   Python FastAPI Backend  ──── WebSocket ────► React Frontend
   (localhost:8000)                              (localhost:5173)
```

- **Backend**: Python 3.11+ · FastAPI · aiomysql · WebSocket broadcast
- **Frontend**: React 18 · Vite · Recharts · TanStack Query · React Router 6
- **Database**: MySQL (your existing `MooMeSystem` schema)
- **Real-time**: WebSocket pushes live sensor data every 10s to all open browsers

---

## Pages

| Page | What it shows |
|------|---------------|
| **Dashboard** | Farm overview, live IoT gauges, 7-day milk trend, 24h environment, system control log |
| **Herd** | All 12 cows with RFID, health status, temperature, milk today — filterable |
| **Cow Detail** | Per-cow temperature history, milk chart, feed, water, AI predictions |
| **Milk Production** | Session summaries, 14-day stacked bar chart, top producers ranking, record entry form |
| **Feed & Fodder** | Daily feed totals, water intake per cow with gauges, IoT-dispensed records |
| **Environment** | Live temp/humidity/air-quality/O₂ gauges, 6–48h trend charts, per-cow body temps |
| **Alerts** | Active / resolved alerts, real-time WebSocket feed, SMS log, 7-day stats chart |
| **Economics** | Component inventory by category, 30-day milk revenue, cost breakdown, ROI |
| **AI Predictions** | Health risk ranking, milk yield forecasts, confidence bars per cow |

---

## Quick Start

### 1. Database

Import your existing schema and data:

```bash
mysql -u root -p < MooMeSystem.sql
```

### 2. Backend (Python FastAPI)

```bash
cd webapp/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure DB connection
cp .env.example .env
# Edit .env → set DB_USER, DB_PASSWORD, DB_NAME

# Start the API server
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 3. Frontend (React + Vite)

```bash
cd webapp/frontend

npm install
npm run dev
```

Open: http://localhost:5173

---

## Environment Variables

### Backend (`webapp/backend/.env`)

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=MooMeSystem
SECRET_KEY=change-this-in-production
CORS_ORIGINS=http://localhost:5173
```

### Frontend (`webapp/frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Real-time Updates

The app uses **WebSocket** (`/ws` endpoint) to push live updates to all connected browsers:

| Event | Trigger |
|-------|---------|
| `snapshot` | On connect — full farm state |
| `env_live` | Every 10s — latest environment reading |
| `env_update` | When new reading POSTed via API |
| `new_alert` | When IoT system creates an alert |
| `alert_resolved` | When alert is resolved |
| `alerts_count` | Every 10s — unresolved count |
| `milk_update` | When milk record added |
| `feed_update` | When feed record added |

In production, replace the DB-polling loop in `main.py → realtime_poller()` with direct MQTT or webhook pushes from the Raspberry Pi.

---

## Production Deployment

```bash
# Backend — production server
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend — build static files
cd frontend && npm run build
# Serve dist/ with nginx or any static server
```

---

## Project Structure

```
webapp/
├── backend/
│   ├── main.py              # FastAPI app + WebSocket + real-time poller
│   ├── config.py            # Settings from .env
│   ├── database.py          # aiomysql connection pool + helpers
│   ├── ws_manager.py        # WebSocket broadcast manager
│   ├── requirements.txt
│   └── routers/
│       ├── dashboard.py     # /api/dashboard/*
│       ├── herd.py          # /api/herd/*
│       ├── milk.py          # /api/milk/*
│       ├── feed.py          # /api/feed/*
│       ├── environment.py   # /api/environment/*
│       ├── alerts.py        # /api/alerts/*
│       ├── economics.py     # /api/economics/*
│       └── predictions.py   # /api/predictions/*
└── frontend/
    ├── src/
    │   ├── App.jsx           # Router + layout shell
    │   ├── index.css         # MooMe design system
    │   ├── context/
    │   │   └── RealtimeContext.jsx   # WebSocket state provider
    │   ├── hooks/
    │   │   └── useWebSocket.js       # Auto-reconnect WS hook
    │   ├── lib/
    │   │   └── api.js                # All API calls (axios)
    │   ├── components/
    │   │   ├── Sidebar.jsx
    │   │   └── Header.jsx
    │   └── pages/
    │       ├── Dashboard.jsx
    │       ├── Herd.jsx
    │       ├── CowDetail.jsx
    │       ├── Milk.jsx
    │       ├── Feed.jsx
    │       ├── Environment.jsx
    │       ├── AlertsPage.jsx
    │       ├── Economics.jsx
    │       └── Predictions.jsx
    ├── .env
    └── vite.config.js
```

---

Built for **MooMe Smart Farm — Rwanda · Eastern Province** 🇷🇼  
IoT data flows from Raspberry Pi sensors → MySQL → FastAPI → React in real time.
