from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class User:
    id: str
    email: str
    auth_provider: str = "google"
    phone: Optional[str] = None
    name: Optional[str] = None
    fcm_token: Optional[str] = None
    notification_prefs: dict = field(default_factory=lambda: {"push": True, "email": True, "whatsapp": False})
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "phone": self.phone,
            "name": self.name,
            "auth_provider": self.auth_provider,
            "notification_prefs": self.notification_prefs,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@dataclass
class Comparison:
    id: str = ""
    user_id: str = ""
    name: str = ""
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    products: list[Product] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if self.products:
            d["products"] = [p.to_dict() for p in self.products]
        else:
            d["products"] = []
        return d


@dataclass
class Product:
    id: str = ""
    comparison_id: str = ""
    url: str = ""
    site: str = ""
    external_product_id: Optional[str] = None
    product_name: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    last_scraped_at: Optional[datetime] = None
    scrape_status: str = "pending"
    created_at: Optional[datetime] = None
    latest_snapshot: Optional[PriceSnapshot] = None

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "comparison_id": self.comparison_id,
            "url": self.url,
            "site": self.site,
            "external_product_id": self.external_product_id,
            "product_name": self.product_name,
            "image_url": self.image_url,
            "category": self.category,
            "last_scraped_at": self.last_scraped_at.isoformat() if self.last_scraped_at else None,
            "scrape_status": self.scrape_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.latest_snapshot is not None:
            d["latest_snapshot"] = self.latest_snapshot.to_dict()
        else:
            d["latest_snapshot"] = None
        return d


@dataclass
class PriceSnapshot:
    id: int = 0
    product_id: str = ""
    price: Optional[float] = None
    mrp: Optional[float] = None
    discount_percent: Optional[float] = None
    availability: Optional[str] = None
    delivery_info: Optional[str] = None
    delivery_days: Optional[int] = None
    shipping_cost: Optional[float] = None
    card_offers: list = field(default_factory=list)
    rating: Optional[float] = None
    review_count: Optional[int] = None
    raw_data: Optional[dict] = None
    scraped_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "price": self.price,
            "mrp": self.mrp,
            "discount_percent": self.discount_percent,
            "availability": self.availability,
            "delivery_info": self.delivery_info,
            "delivery_days": self.delivery_days,
            "shipping_cost": self.shipping_cost,
            "card_offers": self.card_offers,
            "rating": self.rating,
            "review_count": self.review_count,
            "scraped_at": self.scraped_at.isoformat() if self.scraped_at else None,
        }


@dataclass
class PriceAlert:
    id: str = ""
    user_id: str = ""
    product_id: Optional[str] = None
    comparison_id: str = ""
    target_price: float = 0.0
    channels: list[str] = field(default_factory=lambda: ["push"])
    is_active: bool = True
    last_triggered_at: Optional[datetime] = None
    trigger_count: int = 0
    created_at: Optional[datetime] = None
    product: Optional[Product] = None

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "user_id": self.user_id,
            "product_id": self.product_id,
            "comparison_id": self.comparison_id,
            "target_price": self.target_price,
            "channels": self.channels,
            "is_active": self.is_active,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "trigger_count": self.trigger_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.product is not None:
            d["product"] = self.product.to_dict()
        return d


@dataclass
class ScrapedData:
    product_name: str = ""
    image_url: str = ""
    price: float = 0.0
    mrp: float = 0.0
    discount_percent: float = 0.0
    availability: str = ""
    delivery_info: str = ""
    delivery_days: int = 0
    shipping_cost: float = 0.0
    card_offers: list[dict] = field(default_factory=list)
    rating: float = 0.0
    review_count: int = 0
    category: str = ""
    external_id: str = ""
    raw_data: Optional[dict] = None


@dataclass
class CardOffer:
    bank: str = ""
    type: str = ""  # "Cash" or "EMI"
    amount: str = ""
    description: str = ""
