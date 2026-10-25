"""
FarmCare IoT-AI Livestock Platform: FastAPI Backend
Real-time farm monitoring with WebSocket broadcasts.
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pymysql.err import MySQLError
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

from config import settings
from database import get_pool, close_pool, fetchone, execute, log_remote_connection, ensure_password_reset_table, ensure_sensor_readings_table, ensure_wearable_tables, ensure_user_approval_columns, ensure_contact_messages_table, ensure_milk_feed_attribution_columns
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
from routers.contact import router as contact_router
from routers.sms_config import router as sms_config_router
from routers.cow_economics import router as cow_economics_router
from routers.milking import router as milking_router
from routers.barn import router as barn_router
from routers.cow_health import router as cow_health_router
from routers.field_settings import router as field_settings_router
from app_schema import ensure_app_schema
from farm_config import ensure_field_tables
from tenancy import FarmHeaderMiddleware, ensure_farm_tenancy, is_admin, user_farm
from routers.farms import router as farms_router
from routers.auth import get_current_user
from ws_manager import ALL_FARMS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm DB pool (remote MySQL via SSH tunnel), kick off real-time poller
    await get_pool()
    await ensure_password_reset_table()
    await ensure_sensor_readings_table()
    await ensure_wearable_tables()
    await ensure_user_approval_columns()
    await ensure_contact_messages_table()
    await ensure_milk_feed_attribution_columns()
    # Newer migrations log and carry on if a live database refuses one, so the
    # API still starts and the older pages keep working.
    for step in (ensure_app_schema, ensure_field_tables, ensure_farm_tenancy):
        try:
            await step()
        except Exception:  # noqa: BLE001
            logger.exception("Startup migration %s failed", step.__name__)
    await log_remote_connection()
    task = asyncio.create_task(realtime_poller())
    yield
    # Shutdown
    task.cancel()
    await close_pool()


app = FastAPI(
    title="FarmCare API",
    description="IoT-AI Smart Dairy Farm Management Platform: Rwanda",
    version="1.0.0",
    lifespan=lifespan,
)

@app.exception_handler(MySQLError)
async def database_error(request: Request, exc: MySQLError):
    # Name the MySQL error code (1054 unknown column, 1146 missing table,
    # 1265/1366 value not accepted, ...) so a failing page says why, without
    # sending table details to the browser. The full error goes to the log.
    code = exc.args[0] if exc.args and isinstance(exc.args[0], int) else None
    logger.error("Database error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={
        "detail": f"Database error{f' {code}' if code else ''} while saving or loading. The server log has the details.",
    })


# Added first so it runs inside CORS: the Admin farm picker's X-Farm-Id header
app.add_middleware(FarmHeaderMiddleware)
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
app.include_router(contact_router)
app.include_router(sms_config_router)
app.include_router(cow_economics_router)
app.include_router(milking_router)
app.include_router(barn_router)
app.include_router(cow_health_router)
app.include_router(field_settings_router)
app.include_router(farms_router)


# ── WebSocket endpoint ────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    # Browsers cannot set headers on a WebSocket, so the JWT comes as ?token=
    try:
        user = await get_current_user(ws.query_params.get("token") or "")
    except Exception:
        await ws.close(code=4401)
        return
    scope = ALL_FARMS if is_admin(user) else user_farm(user)
    await manager.connect(ws, scope)
    try:
        # Send an initial snapshot so UI loads instantly
        await manager.send_to(ws, "snapshot", await build_snapshot(scope))
        while True:
            # Keep alive: echo any pings from client
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(ws)


def _plain(row) -> dict:
    return {k: (float(v) if hasattr(v, "__float__") else str(v) if not isinstance(v, (int, str, bool, type(None))) else v)
            for k, v in (row or {}).items()}


def _farm_filter(scope):
    """WHERE fragment for one farm, or every farm for Admins."""
    if scope == ALL_FARMS:
        return "1=1", ()
    if scope is None:
        return "1=0", ()
    return "farm_id = %s", (scope,)


# ── Real-time poller (simulates live sensor feed) ─────────────
async def realtime_poller():
    """
    Polls the DB every 10 seconds and broadcasts fresh environment and
    alert-count snapshots, separately for each farm that has a viewer open.
    """
    while True:
        await asyncio.sleep(10)
        try:
            for farm_id in manager.farms_listening():
                env, count = await _live_values(farm_id)
                if env:
                    await manager.broadcast("env_live", env, farm_id=farm_id)
                await manager.broadcast("alerts_count", {"count": count}, farm_id=farm_id)
            if manager.admins_listening():
                # farm_id=None reaches Admins only
                env, count = await _live_values(ALL_FARMS)
                if env:
                    await manager.broadcast("env_live", env)
                await manager.broadcast("alerts_count", {"count": count})
        except Exception as exc:
            logger.warning("Realtime poller error: %s", exc)


async def _live_values(scope):
    where, args = _farm_filter(scope)
    env = await fetchone(
        f"SELECT * FROM EnvironmentalReadings WHERE {where} ORDER BY recorded_at DESC LIMIT 1", args
    )
    active = await fetchone(
        f"SELECT COUNT(*) AS cnt FROM Alerts WHERE is_resolved=FALSE AND {where}", args
    )
    return (_plain(env) if env else None), (active["cnt"] if active else 0)


async def build_snapshot(scope):
    try:
        where, args = _farm_filter(scope)
        env, alerts_cnt = await _live_values(scope)
        summary = await fetchone(
            f"""
            SELECT COUNT(*) AS total_cows,
                   SUM(CASE WHEN health_status = 'Healthy' THEN 1 ELSE 0 END) AS healthy_cows,
                   SUM(CASE WHEN lactating = 1 THEN 1 ELSE 0 END) AS lactating_cows
            FROM Cows WHERE is_active = 1 AND {where}
            """,
            args,
        )
        return {
            "environment": env or {},
            "farm_summary": _plain(summary),
            "active_alerts": alerts_cnt,
        }
    except Exception as exc:
        logger.warning("Snapshot build error: %s", exc)
        return {}


# ── Health check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "FarmCare API", "version": "1.0.0"}
