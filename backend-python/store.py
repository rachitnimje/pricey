from __future__ import annotations
import json
import logging
from datetime import datetime
from typing import Optional

import asyncpg

from models import (Comparison, PriceAlert, PriceSnapshot, Product, ScrapedData, User)

logger = logging.getLogger(__name__)


class Store:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    # --- Users ---

    async def upsert_user(self, user: User) -> User:
        row = await self.pool.fetchrow(
            """INSERT INTO users (id, email, auth_provider, notification_prefs)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()
               RETURNING created_at, updated_at""",
            user.id, user.email, user.auth_provider, json.dumps(user.notification_prefs),
        )
        user.created_at = row["created_at"]
        user.updated_at = row["updated_at"]
        return user

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        row = await self.pool.fetchrow(
            """SELECT id, email, phone, name, auth_provider, fcm_token, notification_prefs,
                      created_at, updated_at
               FROM users WHERE id = $1""",
            user_id,
        )
        if row is None:
            return None
        return self._row_to_user(row)

    async def get_user_by_email(self, email: str) -> Optional[User]:
        row = await self.pool.fetchrow(
            """SELECT id, email, phone, name, auth_provider, fcm_token, notification_prefs,
                      created_at, updated_at
               FROM users WHERE email = $1""",
            email,
        )
        if row is None:
            return None
        return self._row_to_user(row)

    async def update_user_fcm_token(self, user_id: str, token: str):
        await self.pool.execute(
            "UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2",
            token, user_id,
        )

    async def update_user_notification_prefs(self, user_id: str, prefs: dict):
        await self.pool.execute(
            "UPDATE users SET notification_prefs = $1, updated_at = NOW() WHERE id = $2",
            json.dumps(prefs), user_id,
        )

    async def update_user_phone(self, user_id: str, phone: str):
        await self.pool.execute(
            "UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2",
            phone, user_id,
        )

    def _row_to_user(self, row) -> User:
        prefs = row["notification_prefs"]
        if isinstance(prefs, str):
            prefs = json.loads(prefs)
        return User(
            id=row["id"],
            email=row["email"],
            phone=row["phone"],
            name=row["name"],
            auth_provider=row["auth_provider"],
            fcm_token=row["fcm_token"],
            notification_prefs=prefs,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # --- Comparisons ---

    async def create_comparison(self, comp: Comparison) -> Comparison:
        row = await self.pool.fetchrow(
            "INSERT INTO comparisons (user_id, name) VALUES ($1, $2) RETURNING id, is_active, created_at, updated_at",
            comp.user_id, comp.name,
        )
        comp.id = str(row["id"])
        comp.is_active = row["is_active"]
        comp.created_at = row["created_at"]
        comp.updated_at = row["updated_at"]
        return comp

    async def get_comparisons_by_user(self, user_id: str) -> list[Comparison]:
        rows = await self.pool.fetch(
            "SELECT id, user_id, name, is_active, created_at, updated_at FROM comparisons WHERE user_id = $1 ORDER BY updated_at DESC",
            user_id,
        )
        return [self._row_to_comparison(r) for r in rows]

    async def get_comparison_by_id(self, comp_id: str, user_id: str) -> Optional[Comparison]:
        row = await self.pool.fetchrow(
            "SELECT id, user_id, name, is_active, created_at, updated_at FROM comparisons WHERE id = $1 AND user_id = $2",
            comp_id, user_id,
        )
        if row is None:
            return None
        return self._row_to_comparison(row)

    async def update_comparison(self, comp_id: str, user_id: str, name: str, is_active: bool):
        await self.pool.execute(
            "UPDATE comparisons SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4",
            name, is_active, comp_id, user_id,
        )

    async def delete_comparison(self, comp_id: str, user_id: str):
        await self.pool.execute(
            "DELETE FROM comparisons WHERE id = $1 AND user_id = $2",
            comp_id, user_id,
        )

    def _row_to_comparison(self, row) -> Comparison:
        return Comparison(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            name=row["name"],
            is_active=row["is_active"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # --- Products ---

    async def create_products(self, products: list[Product]) -> list[Product]:
        if not products:
            return products
        values = []
        args = []
        for i, p in enumerate(products):
            base = i * 3
            values.append(f"(${base+1}, ${base+2}, ${base+3})")
            args.extend([p.comparison_id, p.url, p.site])

        query = (
            f"INSERT INTO products (comparison_id, url, site) VALUES {', '.join(values)} "
            f"RETURNING id, comparison_id, url, site, scrape_status, created_at"
        )
        rows = await self.pool.fetch(query, *args)
        for i, row in enumerate(rows):
            products[i].id = str(row["id"])
            products[i].comparison_id = str(row["comparison_id"])
            products[i].url = row["url"]
            products[i].site = row["site"]
            products[i].scrape_status = row["scrape_status"]
            products[i].created_at = row["created_at"]
        return products

    async def get_products_by_comparison(self, comparison_id: str) -> list[Product]:
        rows = await self.pool.fetch(
            """SELECT id, comparison_id, url, site, external_product_id, product_name,
                      image_url, category, last_scraped_at, scrape_status, created_at
               FROM products WHERE comparison_id = $1""",
            comparison_id,
        )
        return [self._row_to_product(r) for r in rows]

    async def update_product_after_scrape(self, product_id: str, data: ScrapedData):
        await self.pool.execute(
            """UPDATE products SET product_name = $1, image_url = $2, category = $3,
                      external_product_id = $4, last_scraped_at = NOW(), scrape_status = 'success'
               WHERE id = $5""",
            data.product_name, data.image_url, data.category, data.external_id, product_id,
        )

    async def mark_product_scrape_failed(self, product_id: str):
        await self.pool.execute(
            "UPDATE products SET scrape_status = 'failed', last_scraped_at = NOW() WHERE id = $1",
            product_id,
        )

    async def get_all_active_products(self) -> list[Product]:
        rows = await self.pool.fetch(
            """SELECT p.id, p.comparison_id, p.url, p.site, p.external_product_id,
                      p.product_name, p.image_url, p.category, p.last_scraped_at,
                      p.scrape_status, p.created_at
               FROM products p
               INNER JOIN comparisons c ON p.comparison_id = c.id
               WHERE c.is_active = true"""
        )
        return [self._row_to_product(r) for r in rows]

    def _row_to_product(self, row) -> Product:
        return Product(
            id=str(row["id"]),
            comparison_id=str(row["comparison_id"]),
            url=row["url"],
            site=row["site"],
            external_product_id=row["external_product_id"],
            product_name=row["product_name"],
            image_url=row["image_url"],
            category=row["category"],
            last_scraped_at=row["last_scraped_at"],
            scrape_status=row["scrape_status"],
            created_at=row["created_at"],
        )

    # --- Price Snapshots ---

    async def create_price_snapshot(self, snap: PriceSnapshot) -> PriceSnapshot:
        row = await self.pool.fetchrow(
            """INSERT INTO price_snapshots
               (product_id, price, mrp, discount_percent, availability, delivery_info,
                delivery_days, shipping_cost, card_offers, rating, review_count, raw_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING id, scraped_at""",
            snap.product_id, snap.price, snap.mrp, snap.discount_percent,
            snap.availability, snap.delivery_info, snap.delivery_days,
            snap.shipping_cost, json.dumps(snap.card_offers),
            snap.rating, snap.review_count,
            json.dumps(snap.raw_data) if snap.raw_data else None,
        )
        snap.id = row["id"]
        snap.scraped_at = row["scraped_at"]
        return snap

    async def get_latest_snapshot(self, product_id: str) -> Optional[PriceSnapshot]:
        row = await self.pool.fetchrow(
            """SELECT id, product_id, price, mrp, discount_percent, availability,
                      delivery_info, delivery_days, shipping_cost, card_offers,
                      rating, review_count, scraped_at
               FROM price_snapshots WHERE product_id = $1
               ORDER BY scraped_at DESC LIMIT 1""",
            product_id,
        )
        if row is None:
            return None
        return self._row_to_snapshot(row)

    async def get_price_history(self, product_id: str, since: datetime) -> list[PriceSnapshot]:
        rows = await self.pool.fetch(
            """SELECT id, product_id, price, mrp, discount_percent, availability,
                      delivery_info, delivery_days, shipping_cost, card_offers,
                      rating, review_count, scraped_at
               FROM price_snapshots WHERE product_id = $1 AND scraped_at >= $2
               ORDER BY scraped_at ASC""",
            product_id, since,
        )
        return [self._row_to_snapshot(r) for r in rows]

    async def get_comparison_price_history(self, comparison_id: str, since: datetime) -> list[dict]:
        """Get best price at each scrape time across all products in a comparison."""
        rows = await self.pool.fetch(
            """SELECT DATE_TRUNC('hour', ps.scraped_at) AS ts,
                      MIN(ps.price) AS best_price
               FROM price_snapshots ps
               JOIN products p ON p.id = ps.product_id
               WHERE p.comparison_id = $1
                 AND ps.scraped_at >= $2
                 AND ps.price > 0
               GROUP BY DATE_TRUNC('hour', ps.scraped_at)
               ORDER BY ts ASC""",
            comparison_id, since,
        )
        return [{"ts": r["ts"].isoformat(), "best_price": float(r["best_price"])} for r in rows]

    def _row_to_snapshot(self, row) -> PriceSnapshot:
        co = row["card_offers"]
        if isinstance(co, str):
            co = json.loads(co)
        return PriceSnapshot(
            id=row["id"],
            product_id=str(row["product_id"]),
            price=float(row["price"]) if row["price"] is not None else None,
            mrp=float(row["mrp"]) if row["mrp"] is not None else None,
            discount_percent=float(row["discount_percent"]) if row["discount_percent"] is not None else None,
            availability=row["availability"],
            delivery_info=row["delivery_info"],
            delivery_days=row["delivery_days"],
            shipping_cost=float(row["shipping_cost"]) if row["shipping_cost"] is not None else None,
            card_offers=co if co else [],
            rating=float(row["rating"]) if row["rating"] is not None else None,
            review_count=row["review_count"],
            scraped_at=row["scraped_at"],
        )

    # --- Price Alerts ---

    async def create_price_alert(self, alert: PriceAlert) -> PriceAlert:
        product_id = alert.product_id if alert.product_id else None
        row = await self.pool.fetchrow(
            """INSERT INTO price_alerts (user_id, product_id, comparison_id, target_price, channels)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id, is_active, trigger_count, created_at""",
            alert.user_id, product_id, alert.comparison_id,
            alert.target_price, json.dumps(alert.channels),
        )
        alert.id = str(row["id"])
        alert.is_active = row["is_active"]
        alert.trigger_count = row["trigger_count"]
        alert.created_at = row["created_at"]
        return alert

    async def get_alerts_by_user(self, user_id: str) -> list[PriceAlert]:
        rows = await self.pool.fetch(
            """SELECT id, user_id, product_id, comparison_id, target_price, channels,
                      is_active, last_triggered_at, trigger_count, created_at
               FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC""",
            user_id,
        )
        return [self._row_to_alert(r) for r in rows]

    async def update_price_alert(self, alert_id: str, user_id: str, target_price: float, is_active: bool, channels: list[str] | None = None):
        if channels is not None:
            await self.pool.execute(
                "UPDATE price_alerts SET target_price = $1, is_active = $2, channels = $3 WHERE id = $4 AND user_id = $5",
                target_price, is_active, json.dumps(channels), alert_id, user_id,
            )
        else:
            await self.pool.execute(
                "UPDATE price_alerts SET target_price = $1, is_active = $2 WHERE id = $3 AND user_id = $4",
                target_price, is_active, alert_id, user_id,
            )

    async def delete_price_alert(self, alert_id: str, user_id: str):
        await self.pool.execute(
            "DELETE FROM price_alerts WHERE id = $1 AND user_id = $2",
            alert_id, user_id,
        )

    async def get_active_alerts_for_product(self, product_id: str) -> list[PriceAlert]:
        rows = await self.pool.fetch(
            """SELECT id, user_id, product_id, comparison_id, target_price, channels,
                      is_active, last_triggered_at, trigger_count, created_at
               FROM price_alerts WHERE product_id = $1 AND is_active = true""",
            product_id,
        )
        return [self._row_to_alert(r) for r in rows]

    async def get_active_alerts_for_comparison(self, comparison_id: str) -> list[PriceAlert]:
        rows = await self.pool.fetch(
            """SELECT id, user_id, product_id, comparison_id, target_price, channels,
                      is_active, last_triggered_at, trigger_count, created_at
               FROM price_alerts WHERE comparison_id = $1 AND product_id IS NULL AND is_active = true""",
            comparison_id,
        )
        return [self._row_to_alert(r) for r in rows]

    async def mark_alert_triggered(self, alert_id: str):
        await self.pool.execute(
            "UPDATE price_alerts SET last_triggered_at = NOW(), trigger_count = trigger_count + 1 WHERE id = $1",
            alert_id,
        )

    def _row_to_alert(self, row) -> PriceAlert:
        channels = row["channels"]
        if isinstance(channels, str):
            channels = json.loads(channels)
        return PriceAlert(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            product_id=str(row["product_id"]) if row["product_id"] else None,
            comparison_id=str(row["comparison_id"]),
            target_price=float(row["target_price"]),
            channels=channels if channels else ["push"],
            is_active=row["is_active"],
            last_triggered_at=row["last_triggered_at"],
            trigger_count=row["trigger_count"],
            created_at=row["created_at"],
        )
