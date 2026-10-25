# FarmCare: IoT-AI Smart Dairy Farm Management Platform

A **real-time web application** that connects directly to your IoT sensor database and gives farmers, veterinarians, and administrators a live view of everything happening on the farm: temperatures, milk production, feeding, health alerts, and AI predictions.

---

## Architecture

```
FarmCare IoT Sensors (Raspberry Pi)
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
| **Herd** | All 12 cows with RFID, health status, temperature, milk today: filterable |
| **Cow Detail** | Per-cow temperature history, milk chart, feed, water, AI predictions |
| **Milk Production** | Session summaries, 14-day stacked bar chart, top producers ranking, record entry form |
| **Feed & Fodder** | Daily feed totals, water intake per cow with gauges, IoT-dispensed records |
| **Environment** | Live temp/humidity/air-quality gauges (O₂ when a sensor reports), 6–48h trend charts, per-cow body temps |
| **Alerts** | Active / resolved alerts, real-time WebSocket feed, SMS log, 7-day stats chart |
| **Economics** | Component inventory by category, 30-day milk revenue, cost breakdown, ROI |
| **AI Predictions** | Health risk ranking, milk yield forecasts, confidence bars per cow |
| **Cow Health** | Health Collar vitals for every cow (body temp, heart rate, SpO2, motion), a 0-100 risk score against each cow's own 14-day baseline with reasons, "Needs Attention" list, live GPS map and farm boundary |
| **Milking** | RFID scan (station or typed), live milk level in the 4 L container from the ultrasonic sensor, Record Milk, today's litres per cow, recent sessions with duration |
| **Barn Monitor** | Temperature, humidity, water tank %, feed weight, MQ-5 and MQ-135, pump/fan/spray/buzzer state, 24 h trends, feed eaten per day and month |

---

## Field devices

| Device ID | Role | Sketch | Posts to |
|-----------|------|--------|----------|
| `esp32_main` | Barn Monitor | `arduinoscripts.txt` | `POST /api/iot/ingest` every 10 s; the response carries Field Settings and queued ON/OFF/AUTO commands |
| `esp32_collar_1` | Milking Station | `testing_____________mome.ino` | `POST /api/iot/rfid-scan`, `POST /api/iot/wearable-collar` every 5 s, `POST /api/iot/milking-record` when its button is pressed |
| `esp8266_vitals_1` | Health Collar | `full_test_umukandanara___mome.ino` | `POST /api/iot/wearable-vitals` |

Roles live in the `IoTDevices` table and can be changed on **IoT Control > Field Devices**. Milk container calibration, tank and fan thresholds, cow temperature rules and the farm boundary are set on **IoT Control > Field Settings** (boundary: **Cow Health**).

Tests: `cd backend && venv/bin/python -m pytest tests -q` (needs `pip install pytest`).

## Farms and who sees what

Every user, cow and field device belongs to a farm (the `Farm` table). Farmers, Veterinarians and Technicians see only their own farm's cows, milk, feed, alerts, SMS logs, settings and devices; Admins see every farm and can narrow the app to one with the **farm picker** in the header (sent as the `X-Farm-Id` request header).

- On first start after upgrading, `tenancy.ensure_farm_tenancy()` adds a `farm_id` column where needed and puts all existing records and users into the first farm (created as "Kanyinya Pilot Farm" if there is none).
- Self-registered users start with no farm and see nothing; the Admin chooses their farm when approving them on **User Management**, where farms are also listed and added.
- A device that posts for the first time has no farm and resolves no cows until an Admin assigns it under **IoT Control > Field Devices**. Devices only accept RFID tags and cow ids from their own farm.
- Field Settings are per farm; values saved with `farm_id = 0` are shared defaults.
- The WebSocket requires the signed-in user's token (`/ws?token=...`) and only streams that user's farm.

Routers use the helpers in `backend/tenancy.py` (`farm_clause`, `cow_clause`, `device_clause`, `ensure_cow_access`, `farm_for_write`).

## Theme

The header has a sun/moon button for bright and dark themes (saved per browser; with no choice saved the app follows the device). Colours are CSS tokens in `frontend/src/index.css`; use `var(--card)`, `var(--text)`, `var(--text-secondary)`, `var(--border)` and the `--tint-*` tokens instead of fixed light colours. Charts resolve these tokens themselves (`ChartKit.jsx`).

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

The app uses **WebSocket** (`/ws?token=<JWT>`) to push live updates to the signed-in users of each farm (Admins get every farm):

| Event | Trigger |
|-------|---------|
| `snapshot` | On connect: full farm state |
| `env_live` | Every 10s: latest environment reading |
| `env_update` | When new reading POSTed via API |
| `new_alert` | When IoT system creates an alert |
| `alert_resolved` | When alert is resolved |
| `alerts_count` | Every 10s: unresolved count |
| `milk_update` | When milk record added |
| `feed_update` | When feed record added |

In production, replace the DB-polling loop in `main.py → realtime_poller()` with direct MQTT or webhook pushes from the Raspberry Pi.

---

## Production Deployment

```bash
# Backend: production server
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend: build static files
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
    │   ├── index.css         # FarmCare design system
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

Built for **FarmCare Smart Farm: Rwanda · Eastern Province** 🇷🇼  
IoT data flows from Raspberry Pi sensors → MySQL → FastAPI → React in real time.
