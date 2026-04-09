from __future__ import annotations
import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse

from models import CardOffer, ScrapedData

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

_ua_index = 0


def get_user_agent() -> str:
    global _ua_index
    ua = USER_AGENTS[_ua_index % len(USER_AGENTS)]
    _ua_index += 1
    return ua


def parse_price(s: str) -> float:
    if not s:
        return 0.0
    cleaned = re.sub(r"[^\d.]", "", s.strip())
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_rating(s: str) -> float:
    if not s:
        return 0.0
    m = re.search(r"(\d+\.?\d*)", s.strip())
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return 0.0


def parse_review_count(s: str) -> int:
    if not s:
        return 0
    m = re.search(r"[\d,]+", s.strip())
    if m:
        try:
            return int(m.group().replace(",", ""))
        except ValueError:
            pass
    return 0


def normalize_availability(s: str) -> str:
    lower = s.strip().lower() if s else ""
    if "in stock" in lower or "in_stock" in lower:
        return "in_stock"
    if "out of stock" in lower or "currently unavailable" in lower:
        return "out_of_stock"
    if "limited" in lower or "only" in lower:
        return "limited"
    if not lower:
        return "unknown"
    return "in_stock"


def trim_offer(s: str) -> str:
    s = s.strip()
    return s[:200] if len(s) > 200 else s


BANK_PATTERN = r"(?:HDFC|ICICI|SBI|Axis|Kotak|CITI|Citibank|Amex|American Express|RBL|BOB|Bank of Baroda|Federal|HSBC|IndusInd|Yes|AU|OneCard|Bajaj|Standard Chartered|IDFC|Slice)"


def extract_generic_card_offers(html: str) -> list[dict]:
    offers: list[dict] = []
    seen: set[str] = set()

    # Pattern 1: Bank followed by discount
    re1 = re.compile(
        rf"(?i)({BANK_PATTERN}\s*(?:Bank)?)[\s\S]{{0,120}}?(\d+%?\s*(?:off|cashback|discount|instant discount|instant savings))"
    )
    for m in re1.finditer(html):
        bank = m.group(1).strip()
        raw_discount = m.group(2).strip()
        amount = _format_amount(raw_discount)
        offer_type = _classify_offer(m.group(0))
        key = f"{bank}|{amount}"
        if key not in seen:
            seen.add(key)
            offers.append({"bank": bank, "type": offer_type, "amount": amount, "description": trim_offer(m.group(0))})

    # Pattern 2: Discount on Bank
    re2 = re.compile(
        rf"(?i)(\d+%?\s*(?:off|cashback|discount|instant discount|instant savings))\s+(?:on|with)\s+({BANK_PATTERN}\s*(?:Bank)?)"
    )
    for m in re2.finditer(html):
        raw_discount = m.group(1).strip()
        bank = m.group(2).strip()
        amount = _format_amount(raw_discount)
        offer_type = _classify_offer(m.group(0))
        key = f"{bank}|{amount}"
        if key not in seen:
            seen.add(key)
            offers.append({"bank": bank, "type": offer_type, "amount": amount, "description": trim_offer(m.group(0))})

    # Pattern 3: ₹X off on Bank
    re3 = re.compile(
        rf"(?i)(?:flat\s+)?₹\s*(\d[\d,]*)\s*(?:off|cashback|discount|instant discount)\s+(?:on|with)\s+({BANK_PATTERN}\s*(?:Bank)?)"
    )
    for m in re3.finditer(html):
        amount = f"₹{m.group(1).strip()} off"
        bank = m.group(2).strip()
        offer_type = _classify_offer(m.group(0))
        key = f"{bank}|{amount}"
        if key not in seen:
            seen.add(key)
            offers.append({"bank": bank, "type": offer_type, "amount": amount, "description": trim_offer(m.group(0))})

    return offers[:10]


def _classify_offer(text: str) -> str:
    """Return 'EMI' if the offer text mentions EMI, else 'Cash'."""
    if re.search(r'(?i)\bemi\b|no.cost.emi|low.cost.emi', text):
        return "EMI"
    return "Cash"


def _format_amount(raw: str) -> str:
    """Normalize discount text to '₹X,XXX off' or 'X% off'."""
    raw = raw.strip()
    pct = re.match(r'(\d+)\s*%', raw)
    if pct:
        return f"{pct.group(1)}% off"
    num = re.match(r'₹?\s*(\d[\d,]*)', raw)
    if num:
        return f"₹{num.group(1)} off"
    return raw


def enrich_from_json_ld(data: ScrapedData, raw: str):
    """Enrich ScrapedData from a JSON-LD script content."""
    try:
        ld = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return

    if isinstance(ld, list):
        product_ld = None
        for item in ld:
            if isinstance(item, dict) and item.get("@type") == "Product":
                product_ld = item
                break
        if product_ld is None:
            return
        ld = product_ld

    if not isinstance(ld, dict):
        return

    if not data.product_name and ld.get("name"):
        data.product_name = ld["name"]
    if not data.image_url and ld.get("image"):
        img = ld["image"]
        if isinstance(img, list):
            img = img[0] if img else ""
        data.image_url = str(img)

    # --- aggregateRating ---
    agg = ld.get("aggregateRating", {})
    if isinstance(agg, dict):
        if data.rating == 0:
            rv = agg.get("ratingValue")
            if rv is not None:
                try:
                    data.rating = float(rv)
                except (ValueError, TypeError):
                    pass
        if data.review_count == 0:
            rc = agg.get("reviewCount") or agg.get("ratingCount")
            if rc is not None:
                try:
                    data.review_count = int(str(rc).replace(",", ""))
                except (ValueError, TypeError):
                    pass

    # --- offers ---
    offers = ld.get("offers", {})
    if isinstance(offers, list) and offers:
        offers = offers[0]
    if isinstance(offers, dict):
        if data.price == 0:
            p = offers.get("price")
            if isinstance(p, (int, float)):
                data.price = float(p)
            elif isinstance(p, str):
                data.price = parse_price(p)
        if data.mrp == 0:
            hp = offers.get("highPrice")
            if hp is not None:
                try:
                    data.mrp = float(hp)
                except (ValueError, TypeError):
                    pass
        avail = offers.get("availability", "")
        if isinstance(avail, str):
            if "instock" in avail.lower():
                data.availability = "in_stock"
            elif "outofstock" in avail.lower():
                data.availability = "out_of_stock"
        # shipping cost
        shipping = offers.get("shippingDetails", {})
        if isinstance(shipping, dict):
            rate = shipping.get("shippingRate", {})
            if isinstance(rate, dict):
                sv = rate.get("value")
                if sv is not None and data.shipping_cost is None:
                    try:
                        data.shipping_cost = float(sv)
                    except (ValueError, TypeError):
                        pass


def detect_site(raw_url: str) -> str:
    """Determine which e-commerce site a URL belongs to."""
    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()

    if "amazon.in" in host or "amzn.in" in host:
        return "amazon.in"
    if "flipkart.com" in host or "fkrt.it" in host:
        return "flipkart"
    if "croma.com" in host:
        return "croma"
    if "reliancedigital.in" in host:
        return "reliancedigital"
    if "vijaysales.com" in host:
        return "vijaysales"
    if "sangeethamobiles.com" in host:
        return "sangeethamobiles"
    if "myntra.com" in host:
        return "myntra"
    if "ajio.com" in host:
        return "ajio"
    if "meesho.com" in host:
        return "meesho"
    return "generic"
