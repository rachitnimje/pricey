"""Background scheduler for periodic scraping of all active products."""
from __future__ import annotations
import asyncio
import logging
from collections import defaultdict

from alerts_service import AlertService
from config import config
from models import Product, PriceSnapshot
from scrapers import scrape_url
from store import Store
from ws_hub import Hub, EVENT_PRICE_CHANGED, EVENT_SCRAPE_BATCH_COMPLETE

logger = logging.getLogger(__name__)


class Scheduler:
    def __init__(self, store: Store, hub: Hub, alert_service: AlertService):
        self.store = store
        self.hub = hub
        self.alert_service = alert_service
        self._task: asyncio.Task | None = None

    def start(self):
        self._task = asyncio.create_task(self._loop())
        logger.info(f"[scheduler] started, scraping every {config.scrape_interval_min} minutes")

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self):
        while True:
            await asyncio.sleep(config.scrape_interval_min * 60)
            try:
                await self._scrape_all()
            except Exception as e:
                logger.error(f"[scheduler] error: {e}")

    async def _scrape_all(self):
        products = await self.store.get_all_active_products()
        if not products:
            return

        logger.info(f"[scheduler] scraping {len(products)} active products")

        # Worker pool using semaphore
        sem = asyncio.Semaphore(config.scraper_workers or 5)

        async def worker(p: Product):
            async with sem:
                await self._scrape_product(p)

        await asyncio.gather(*(worker(p) for p in products), return_exceptions=True)

        # Check comparison-level alerts
        comp_products: dict[str, list[Product]] = defaultdict(list)
        for p in products:
            comp_products[p.comparison_id].append(p)

        for comp_id, prods in comp_products.items():
            best_price = 0.0
            best_name = ""
            best_site = ""
            best_url = ""
            for p in prods:
                snap = await self.store.get_latest_snapshot(p.id)
                if not snap or not snap.price or snap.price <= 0:
                    continue
                total = snap.price + (snap.shipping_cost or 0)
                if best_price == 0 or total < best_price:
                    best_price = total
                    best_site = p.site
                    best_name = p.product_name or p.url
                    best_url = p.url
            if best_price > 0:
                await self.alert_service.check_comparison_alerts(comp_id, best_price, best_name, best_site, best_url)

            # Broadcast batch-complete so frontends refresh
            await self.hub.broadcast(EVENT_SCRAPE_BATCH_COMPLETE, {
                "comparison_id": comp_id,
                "total": len(prods),
            })

        logger.info(f"[scheduler] completed scraping {len(products)} products")

    async def _scrape_product(self, p: Product):
        try:
            _site, data = await scrape_url(p.url, use_ai=config.ai_scraping_enabled)
        except Exception as e:
            logger.error(f"[scheduler] scrape failed for {p.url}: {e}")
            await self.store.mark_product_scrape_failed(p.id)
            return

        await self.store.update_product_after_scrape(p.id, data)

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
        try:
            await self.store.create_price_snapshot(snap)
        except Exception as e:
            logger.error(f"[scheduler] failed to save snapshot for {p.url}: {e}")
            return

        # Check product-level alerts
        product_name = p.product_name or p.url
        await self.alert_service.check_and_notify(p.id, data.price, product_name, p.site, p.url)

        # Notify about price change (broadcast)
        await self.hub.broadcast(EVENT_PRICE_CHANGED, {
            "product_id": p.id,
            "comparison_id": p.comparison_id,
            "price": data.price,
            "site": p.site,
        })
