"""Pricey API — FastAPI entry point."""
from __future__ import annotations
import logging
import sys

import asyncpg
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from auth import init_jwks, verify_token
from alerts_service import AlertService
from config import config
from routes import router, init_routes
from scheduler import Scheduler
from scrapers import init_browser, close_browser
from store import Store
from ws_hub import Hub

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Pricey API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
_pool: asyncpg.Pool = None  # type: ignore
_store: Store = None  # type: ignore
_hub = Hub()
_scheduler: Scheduler = None  # type: ignore


@app.on_event("startup")
async def startup():
    global _pool, _store, _scheduler

    # Database
    _pool = await asyncpg.create_pool(config.database_url, min_size=5, max_size=25)
    logger.info("connected to database")
    _store = Store(_pool)

    # JWKS
    init_jwks(config.supabase_url)

    # Scrapers browser
    await init_browser()

    # Routes
    init_routes(_store, _hub)

    # Alert service + scheduler
    alert_service = AlertService(_store, _hub)
    _scheduler = Scheduler(_store, _hub, alert_service)
    _scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    if _scheduler:
        _scheduler.stop()
    await close_browser()
    if _pool:
        await _pool.close()


# Include REST routes
app.include_router(router)


# WebSocket endpoint
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    token_str = websocket.query_params.get("token", "")
    if not token_str:
        await websocket.close(code=4001, reason="no token")
        return

    try:
        claims = verify_token(token_str)
    except Exception:
        await websocket.close(code=4001, reason="invalid token")
        return

    user_id = claims.get("sub")
    if not user_id:
        await websocket.close(code=4001, reason="invalid token")
        return

    await websocket.accept()
    await _hub.register(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await _hub.unregister(user_id, websocket)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(config.port), reload=False)
