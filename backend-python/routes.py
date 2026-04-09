"""FastAPI routes — exact same endpoints as the Go Fiber backend."""
from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user
from config import config
from models import Comparison, PriceAlert, PriceSnapshot, Product
from scraper_helpers import detect_site
from scrapers import scrape_url
from store import Store
from ws_hub import Hub, EVENT_SCRAPE_PROGRESS, EVENT_SCRAPE_COMPLETE, EVENT_SCRAPE_FAILED, EVENT_SCRAPE_BATCH_COMPLETE

logger = logging.getLogger(__name__)

router = APIRouter()

# These get set by main.py at startup
_store: Store = None  # type: ignore
_hub: Hub = None  # type: ignore


def init_routes(store: Store, hub: Hub):
    global _store, _hub
    _store = store
    _hub = hub


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@router.get("/api/auth/me")
async def me(user: tuple[str, str] = Depends(get_current_user)):
    user_id, email = user
    existing = await _store.get_user_by_id(user_id)
    if existing is None:
        from models import User
        new_user = User(
            id=user_id,
            email=email,
            auth_provider="google",
            notification_prefs={"push": True, "email": True, "whatsapp": False},
        )
        await _store.upsert_user(new_user)
        existing = await _store.get_user_by_id(user_id)
    return existing.to_dict()


# ---------------------------------------------------------------------------
# Comparisons
# ---------------------------------------------------------------------------


class CreateComparisonRequest(BaseModel):
    name: str = ""
    urls: list[str]


class AddURLsRequest(BaseModel):
    urls: list[str]


@router.post("/api/comparisons", status_code=201)
async def create_comparison(req: CreateComparisonRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    if not req.urls:
        raise HTTPException(400, "at least one URL is required")
    if len(req.urls) > 10:
        raise HTTPException(400, "maximum 10 URLs per comparison")

    name = req.name or "Comparison"
    comp = Comparison(user_id=user_id, name=name)
    comp = await _store.create_comparison(comp)

    products = []
    for raw_url in req.urls:
        site = detect_site(raw_url)
        products.append(Product(comparison_id=comp.id, url=raw_url, site=site))

    if not products:
        raise HTTPException(400, "no supported URLs found")

    products = await _store.create_products(products)
    comp.products = products

    # Kick off scraping in background
    asyncio.create_task(_scrape_products(user_id, comp.id, products))

    return comp.to_dict()


@router.get("/api/comparisons")
async def list_comparisons(user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comparisons = await _store.get_comparisons_by_user(user_id)

    for comp in comparisons:
        products = await _store.get_products_by_comparison(comp.id)
        for p in products:
            p.latest_snapshot = await _store.get_latest_snapshot(p.id)
        comp.products = products

    return [c.to_dict() for c in comparisons]


@router.get("/api/comparisons/{comp_id}")
async def get_comparison(comp_id: str, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comp = await _store.get_comparison_by_id(comp_id, user_id)
    if comp is None:
        raise HTTPException(404, "comparison not found")

    products = await _store.get_products_by_comparison(comp.id)
    for p in products:
        p.latest_snapshot = await _store.get_latest_snapshot(p.id)
    comp.products = products

    return comp.to_dict()


class UpdateComparisonRequest(BaseModel):
    name: str = ""
    is_active: Optional[bool] = None


@router.put("/api/comparisons/{comp_id}")
async def update_comparison(comp_id: str, req: UpdateComparisonRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comp = await _store.get_comparison_by_id(comp_id, user_id)
    if comp is None:
        raise HTTPException(404, "comparison not found")

    name = req.name if req.name else comp.name
    is_active = req.is_active if req.is_active is not None else comp.is_active

    await _store.update_comparison(comp_id, user_id, name, is_active)
    return {"status": "updated"}


@router.delete("/api/comparisons/{comp_id}")
async def delete_comparison(comp_id: str, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    await _store.delete_comparison(comp_id, user_id)
    return {"status": "deleted"}


@router.post("/api/comparisons/{comp_id}/refresh")
async def refresh_comparison(comp_id: str, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comp = await _store.get_comparison_by_id(comp_id, user_id)
    if comp is None:
        raise HTTPException(404, "comparison not found")

    products = await _store.get_products_by_comparison(comp.id)
    asyncio.create_task(_scrape_products(user_id, comp.id, products))

    return {"status": "refresh started"}


@router.post("/api/comparisons/{comp_id}/urls", status_code=201)
async def add_urls(comp_id: str, req: AddURLsRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comp = await _store.get_comparison_by_id(comp_id, user_id)
    if comp is None:
        raise HTTPException(404, "comparison not found")

    if not req.urls:
        raise HTTPException(400, "at least one URL is required")

    existing = await _store.get_products_by_comparison(comp.id)
    if len(existing) + len(req.urls) > 10:
        raise HTTPException(400, "maximum 10 products per comparison")

    products = []
    for raw_url in req.urls:
        site = detect_site(raw_url)
        products.append(Product(comparison_id=comp.id, url=raw_url, site=site))

    if not products:
        raise HTTPException(400, "no supported URLs found")

    products = await _store.create_products(products)
    asyncio.create_task(_scrape_products(user_id, comp.id, products))

    all_products = await _store.get_products_by_comparison(comp.id)
    comp.products = all_products

    return comp.to_dict()


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


class CreateAlertRequest(BaseModel):
    product_id: str = ""
    comparison_id: str
    target_price: float
    channels: list[str] = ["push"]


class UpdateAlertRequest(BaseModel):
    target_price: float = 0.0
    is_active: Optional[bool] = None
    channels: Optional[list[str]] = None


@router.post("/api/alerts", status_code=201)
async def create_alert(req: CreateAlertRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    if not req.comparison_id or req.target_price <= 0:
        raise HTTPException(400, "comparison_id and target_price are required")

    channels = req.channels or ["push"]
    product_id = req.product_id if req.product_id else None

    alert = PriceAlert(
        user_id=user_id,
        product_id=product_id,
        comparison_id=req.comparison_id,
        target_price=req.target_price,
        channels=channels,
    )
    alert = await _store.create_price_alert(alert)
    return alert.to_dict()


@router.get("/api/alerts")
async def list_alerts(user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    alerts = await _store.get_alerts_by_user(user_id)
    return [a.to_dict() for a in alerts]


@router.put("/api/alerts/{alert_id}")
async def update_alert(alert_id: str, req: UpdateAlertRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    is_active = req.is_active if req.is_active is not None else True
    await _store.update_price_alert(alert_id, user_id, req.target_price, is_active, req.channels)
    return {"status": "updated"}


@router.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    await _store.delete_price_alert(alert_id, user_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


@router.get("/api/products/{product_id}/history")
async def get_product_history(product_id: str, days: int = 30, user: tuple[str, str] = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    history = await _store.get_price_history(product_id, since)
    return [s.to_dict() for s in history]


@router.get("/api/comparisons/{comp_id}/price-history")
async def get_comparison_price_history(comp_id: str, days: int = 30, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    comp = await _store.get_comparison_by_id(comp_id, user_id)
    if comp is None:
        raise HTTPException(404, "comparison not found")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    history = await _store.get_comparison_price_history(comp_id, since)
    return history


# ---------------------------------------------------------------------------
# User profile
# ---------------------------------------------------------------------------


class FCMTokenRequest(BaseModel):
    token: str


class NotificationPrefsRequest(BaseModel):
    prefs: dict


class PhoneRequest(BaseModel):
    phone: str


@router.put("/api/user/fcm-token")
async def update_fcm_token(req: FCMTokenRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    await _store.update_user_fcm_token(user_id, req.token)
    return {"status": "updated"}


@router.put("/api/user/notification-prefs")
async def update_notification_prefs(req: NotificationPrefsRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    await _store.update_user_notification_prefs(user_id, req.prefs)
    return {"status": "updated"}


@router.put("/api/user/phone")
async def update_phone(req: PhoneRequest, user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    await _store.update_user_phone(user_id, req.phone)
    return {"status": "updated"}


@router.get("/api/user/profile")
async def get_profile(user: tuple[str, str] = Depends(get_current_user)):
    user_id, _ = user
    u = await _store.get_user_by_id(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u.to_dict()


# ---------------------------------------------------------------------------
# AI Scraping settings
# ---------------------------------------------------------------------------


@router.get("/api/settings/ai-scraping")
async def get_ai_scraping(_user: tuple[str, str] = Depends(get_current_user)):
    return {
        "enabled": config.ai_scraping_enabled,
        "has_key": bool(config.groq_api_key),
        "model": config.groq_model,
    }


class AIScrapingRequest(BaseModel):
    enabled: bool


@router.put("/api/settings/ai-scraping")
async def set_ai_scraping(req: AIScrapingRequest, _user: tuple[str, str] = Depends(get_current_user)):
    if req.enabled and not config.groq_api_key:
        raise HTTPException(400, "Groq API key not configured on server")
    config.ai_scraping_enabled = req.enabled
    return {"enabled": config.ai_scraping_enabled}


# ---------------------------------------------------------------------------
# Background scraping helper
# ---------------------------------------------------------------------------


async def _scrape_products(user_id: str, comparison_id: str, products: list[Product]):
    """Scrape all products in parallel, sending WS progress updates."""
    total = len(products)

    # Notify start
    await _hub.send_to_user(user_id, EVENT_SCRAPE_PROGRESS, {
        "comparison_id": comparison_id,
        "product_index": 0,
        "total": total,
        "url": "",
        "status": "scraping",
    })

    sem = asyncio.Semaphore(config.scraper_workers or 5)

    async def _do_one(i: int, p: Product):
        async with sem:
            try:
                site, data = await scrape_url(p.url, use_ai=config.ai_scraping_enabled)
            except Exception as e:
                logger.error(f"[scrape] failed for {p.url}: {e}")
                await _store.mark_product_scrape_failed(p.id)
                await _hub.send_to_user(user_id, EVENT_SCRAPE_FAILED, {
                    "comparison_id": comparison_id,
                    "product_index": i,
                    "url": p.url,
                    "error": str(e),
                })
                return

            await _store.update_product_after_scrape(p.id, data)

            snap = PriceSnapshot(
                product_id=p.id,
                price=data.price,
                mrp=data.mrp,
                discount_percent=data.discount_percent,
                availability=data.availability,
                delivery_info=data.delivery_info,
                delivery_days=data.delivery_days,
                shipping_cost=data.shipping_cost,
                card_offers=data.card_offers,
                rating=data.rating,
                review_count=data.review_count,
                raw_data=data.raw_data,
            )
            await _store.create_price_snapshot(snap)

            await _hub.send_to_user(user_id, EVENT_SCRAPE_COMPLETE, {
                "comparison_id": comparison_id,
                "product_index": i,
                "total": total,
                "url": p.url,
                "snapshot": snap.to_dict(),
            })

    await asyncio.gather(*(_do_one(i, p) for i, p in enumerate(products)), return_exceptions=True)

    # Signal that ALL products in this comparison are done
    await _hub.send_to_user(user_id, EVENT_SCRAPE_BATCH_COMPLETE, {
        "comparison_id": comparison_id,
        "total": total,
    })
