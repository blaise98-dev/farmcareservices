"""
WebSocket connection manager: broadcasts real-time IoT events to connected clients.

Each connection is tied to the signed-in user's farm. An event carries the
farm it belongs to and reaches Admins plus that farm's users; an event with no
farm (an unassigned device) reaches Admins only.
"""
import json
from datetime import datetime
from typing import Dict, Optional
from fastapi import WebSocket

ALL_FARMS = "all"


class ConnectionManager:
    def __init__(self):
        # websocket -> ALL_FARMS for Admins, a farm_id, or None for a user with no farm
        self.active: Dict[WebSocket, object] = {}

    async def connect(self, ws: WebSocket, scope: object):
        await ws.accept()
        self.active[ws] = scope

    def disconnect(self, ws: WebSocket):
        self.active.pop(ws, None)

    async def send_to(self, ws: WebSocket, event: str, data: dict):
        await ws.send_text(json.dumps({"event": event, "data": data, "ts": datetime.utcnow().isoformat()}))

    async def broadcast(self, event: str, data: dict, farm_id: Optional[int] = None):
        payload = json.dumps({"event": event, "data": data, "ts": datetime.utcnow().isoformat()})
        dead = set()
        for ws, scope in list(self.active.items()):
            if scope != ALL_FARMS and (farm_id is None or scope != farm_id):
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active.pop(ws, None)

    def farms_listening(self) -> set:
        """Farms with at least one non-admin connection (for per-farm polling)."""
        return {s for s in self.active.values() if s not in (ALL_FARMS, None)}

    def admins_listening(self) -> bool:
        return ALL_FARMS in self.active.values()


manager = ConnectionManager()
