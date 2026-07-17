"""
MooMe IoT-AI Livestock Platform — FastAPI Backend
Real-time farm monitoring with WebSocket broadcasts.
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

from config import settings
from database import get_pool, close_pool, fetchone, execute, log_remote_connection, ensure_password_reset_table, ensure_sensor_readings_table, ensure_wearable_tables
from ws_manager import manager
from routers import dashboard, herd, milk, feed, environment, alerts, economics, predictions, admin
from routers.auth import router as auth_router
from routers.reproduction import router as reproduction_router
from routers.feed_inventory import router as feed_inventory_router
from routers.groups import router as groups_router
from routers.notifications import router as notifications_router
from routers.tanks import router as tanks_router
from routers.weekly_plan import router as weekly_plan_router
from routers.feedback import router as feedback_router
from routers.iot_control import router as iot_router
from routers.iot_ingest import router as iot_ingest_router
from routers.iot_wearable import router as iot_wearable_router
from routers.sms_config import router as sms_config_router
from routers.cow_economics import router as cow_economics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm DB pool (remote MySQL via SSH tunnel), kick off real-time poller
    await get_pool()
    await ensure_password_reset_table()
    await ensure_sensor_readings_table()
    await ensure_wearable_tables()
    await log_remote_connection()
    task = asyncio.create_task(realtime_poller())
    yield
    # Shutdown
    task.cancel()
    await close_pool()


app = FastAPI(
    title="MooMe API",
    description="IoT-AI Smart Dairy Farm Management Platform — Rwanda",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(dashboard.router)
app.include_router(herd.router)
app.include_router(milk.router)
app.include_router(feed.router)
app.include_router(environment.router)
app.include_router(alerts.router)
app.include_router(economics.router)
app.include_router(predictions.router)
app.include_router(admin.router)
app.include_router(reproduction_router)
app.include_router(feed_inventory_router)
app.include_router(groups_router)
app.include_router(notifications_router)
app.include_router(tanks_router)
app.include_router(weekly_plan_router)
app.include_router(feedback_router)
app.include_router(iot_router)
app.include_router(iot_ingest_router)
app.include_router(iot_wearable_router)
app.include_router(sms_config_router)
app.include_router(cow_economics_router)


# ── WebSocket endpoint ────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send an initial snapshot so UI loads instantly
        snapshot = await build_snapshot()
        await ws.send_text(json.dumps({"event": "snapshot", "data": snapshot, "ts": datetime.utcnow().isoformat()}))
        while True:
            # Keep alive — echo any pings from client
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── Real-time poller (simulates live sensor feed) ─────────────
async def realtime_poller():
    """
    Polls the DB every 10 seconds and broadcasts fresh
    environment + alert snapshots to all connected clients.
    In production this is replaced by direct MQTT/sensor pushes.
    """
    while True:
        await asyncio.sleep(10)
        try:
            env = await fetchone(
                "SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT 1"
            )
            if env:
                # Convert non-serialisable types
                payload = {k: (float(v) if hasattr(v, "__float__") else str(v) if not isinstance(v, (int, str, bool, type(None))) else v)
                           for k, v in env.items()}
                await manager.broadcast("env_live", payload)

            active = await fetchone(
                "SELECT COUNT(*) AS cnt FROM Alerts WHERE is_resolved=FALSE"
            )
            await manager.broadcast("alerts_count", {"count": active["cnt"] if active else 0})
        except Exception as exc:
            logger.warning("Realtime poller error: %s", exc)


async def build_snapshot():
    try:
        env = await fetchone(
            "SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT 1"
        )
        summary = await fetchone("SELECT * FROM systemhealthsummary")
        alerts_cnt = await fetchone(
            "SELECT COUNT(*) AS cnt FROM Alerts WHERE is_resolved=FALSE"
        )
        return {
            "environment": {k: (float(v) if hasattr(v, "__float__") else str(v) if not isinstance(v, (int, str, bool, type(None))) else v) for k, v in (env or {}).items()},
            "farm_summary": {k: (float(v) if hasattr(v, "__float__") else str(v) if not isinstance(v, (int, str, bool, type(None))) else v) for k, v in (summary or {}).items()},
            "active_alerts": alerts_cnt["cnt"] if alerts_cnt else 0,
        }
    except Exception as exc:
        logger.warning("Snapshot build error: %s", exc)
        return {}


# ── Health check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "MooMe API", "version": "1.0.0"}
