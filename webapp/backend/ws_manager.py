"""
WebSocket connection manager — broadcasts real-time IoT events to all connected clients.
"""
import asyncio
import json
from datetime import datetime
from typing import Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, event: str, data: dict):
        payload = json.dumps({"event": event, "data": data, "ts": datetime.utcnow().isoformat()})
        dead = set()
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self.active -= dead


manager = ConnectionManager()
