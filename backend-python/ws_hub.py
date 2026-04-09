from __future__ import annotations
import asyncio
import json
import logging
from typing import Optional

from starlette.websockets import WebSocket

logger = logging.getLogger(__name__)

EVENT_SCRAPE_PROGRESS = "scrape_progress"
EVENT_SCRAPE_COMPLETE = "scrape_complete"
EVENT_SCRAPE_FAILED = "scrape_failed"
EVENT_SCRAPE_BATCH_COMPLETE = "scrape_batch_complete"
EVENT_PRICE_CHANGED = "price_changed"
EVENT_ALERT_TRIGGERED = "alert_triggered"


class Hub:
    """Manages WebSocket connections per user."""

    def __init__(self):
        self._lock = asyncio.Lock()
        self._clients: dict[str, set[WebSocket]] = {}

    async def register(self, user_id: str, ws: WebSocket):
        async with self._lock:
            if user_id not in self._clients:
                self._clients[user_id] = set()
            self._clients[user_id].add(ws)
            logger.info(f"[ws] user {user_id} connected (total: {len(self._clients[user_id])})")

    async def unregister(self, user_id: str, ws: WebSocket):
        async with self._lock:
            if user_id in self._clients:
                self._clients[user_id].discard(ws)
                if not self._clients[user_id]:
                    del self._clients[user_id]
            logger.info(f"[ws] user {user_id} disconnected")

    async def send_to_user(self, user_id: str, event: str, data: dict):
        msg = json.dumps({"event": event, "data": data})
        async with self._lock:
            conns = list(self._clients.get(user_id, set()))
        for ws in conns:
            try:
                await ws.send_text(msg)
            except Exception as e:
                logger.warning(f"[ws] write error for user {user_id}: {e}")

    async def broadcast(self, event: str, data: dict):
        msg = json.dumps({"event": event, "data": data})
        async with self._lock:
            all_conns = [(uid, list(conns)) for uid, conns in self._clients.items()]
        for uid, conns in all_conns:
            for ws in conns:
                try:
                    await ws.send_text(msg)
                except Exception:
                    pass
