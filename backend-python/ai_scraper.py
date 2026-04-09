"""AI-powered scraper enrichment.

Tries SambaNova (primary, no daily cap) then falls back to Groq.
Both use Llama 3.3 70B via OpenAI-compatible APIs.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

import httpx

from config import config
from models import ScrapedData

logger = logging.getLogger(__name__)

PROVIDERS = [
    {
        "name": "SambaNova",
        "url": "https://api.sambanova.ai/v1/chat/completions",
        "key_attr": "sambanova_api_key",
        "model_attr": "sambanova_model",
    },
    {
        "name": "Groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key_attr": "groq_api_key",
        "model_attr": "groq_model",
    },
]

EXTRACTION_PROMPT = """You are a product data extraction assistant. Given the text content of an e-commerce product page, extract the following fields as JSON.

Return ONLY valid JSON with these exact keys (use null for missing data):
{
  "product_name": "full product name",
  "price": 0.0,
  "mrp": 0.0,
  "availability": "in_stock or out_of_stock",
  "rating": 0.0,
  "review_count": 0,
  "delivery_info": "delivery text or null",
  "shipping_cost": 0.0,
  "card_offers": [
    {"bank": "bank name", "type": "Cash or EMI", "amount": "₹X,XXX off or X% off", "description": "full offer text"}
  ]
}

CRITICAL — how to identify the correct price:
Indian e-commerce sites typically show THREE prices in this order:
  1. LOWEST price = "with bank offer" / "effective price" — IGNORE THIS
  2. MIDDLE price = the actual selling price everyone pays — USE THIS as "price"
  3. HIGHEST price (strikethrough) = MRP — USE THIS as "mrp"

Pattern: if you see text like "₹75,999 with Bank Offers ₹79,999 ₹82,900":
  - price = 79999 (the middle one, the real selling price)
  - mrp = 82900 (the highest one, the original MRP)
  - The ₹75,999 is a bank-offer price, report it in card_offers instead

The "price" field must be what ANY customer pays at checkout without needing a specific bank card.
If a price is labeled "with Bank Offers", "with coupon", "effective price", or "after cashback" — that is NOT the base price. Look for the next higher price.

Other rules:
- price and mrp should be numbers only (no currency symbols)
- rating should be out of 5
- review_count should be an integer
- card_offers: extract ALL bank/card discount offers (HDFC, ICICI, SBI, Axis, etc.), max 10.
  For each offer:
  - "bank": the bank or card name (e.g. "HDFC", "ICICI", "SBI", "Axis", "OneCard")
  - "type": "EMI" if the offer is about EMI/no-cost-EMI/low-cost-EMI, otherwise "Cash" (for instant discount, cashback, etc.)
  - "amount": the discount amount formatted as "₹X,XXX off" or "X% off" (e.g. "₹4,000 off", "10% off", "₹1,500/month")
  - "description": full original offer text
- availability: "in_stock" or "out_of_stock"
- If data is not found, use null for strings, 0 for numbers, [] for arrays"""


async def extract_with_ai(page_text: str, url: str) -> Optional[ScrapedData]:
    """Try each AI provider in order; return first successful result."""
    max_chars = 16000
    truncated = page_text[:max_chars] if len(page_text) > max_chars else page_text

    for provider in PROVIDERS:
        api_key = getattr(config, provider["key_attr"], "")
        if not api_key:
            continue

        model = getattr(config, provider["model_attr"])
        name = provider["name"]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    provider["url"],
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": EXTRACTION_PROMPT},
                            {"role": "user", "content": f"URL: {url}\n\nPage content:\n{truncated}"},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 1024,
                        "response_format": {"type": "json_object"},
                    },
                )

            if resp.status_code != 200:
                logger.warning(f"[ai_scraper] {name} error {resp.status_code}: {resp.text[:200]}")
                continue  # try next provider

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)

            result = ScrapedData(
                product_name=parsed.get("product_name") or "",
                price=_safe_float(parsed.get("price")),
                mrp=_safe_float(parsed.get("mrp")),
                availability=parsed.get("availability") or "",
                rating=_safe_float(parsed.get("rating")),
                review_count=_safe_int(parsed.get("review_count")),
                delivery_info=parsed.get("delivery_info") or "",
                shipping_cost=_safe_float(parsed.get("shipping_cost")),
                card_offers=parsed.get("card_offers") or [],
            )

            if result.mrp > 0 and result.price > 0:
                result.discount_percent = round(((result.mrp - result.price) / result.mrp) * 100, 2)

            logger.info(
                f"[ai_scraper] {name} extracted: {result.product_name} | "
                f"₹{result.price:.2f} | rating={result.rating} | "
                f"reviews={result.review_count} | offers={len(result.card_offers)}"
            )
            return result

        except httpx.TimeoutException:
            logger.warning(f"[ai_scraper] {name} timeout, trying next")
            continue
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            logger.warning(f"[ai_scraper] {name} parse error: {e}, trying next")
            continue
        except Exception as e:
            logger.error(f"[ai_scraper] {name} error: {e}, trying next")
            continue

    logger.warning("[ai_scraper] all providers failed")
    return None


def merge_ai_data(original: ScrapedData, ai_data: ScrapedData) -> ScrapedData:
    """Merge AI-extracted data into the original scraped data.
    
    AI data fills in gaps — it doesn't overwrite data that the
    traditional scraper already found, except for card_offers where
    AI usually does a better job.
    """
    if not original.product_name and ai_data.product_name:
        original.product_name = ai_data.product_name
    if original.price == 0 and ai_data.price > 0:
        original.price = ai_data.price
    # If AI found a higher base price, the scraper likely picked up a
    # bank-offer-discounted price — prefer the AI's base price.
    elif ai_data.price > original.price > 0:
        original.price = ai_data.price
    if original.mrp == 0 and ai_data.mrp > 0:
        original.mrp = ai_data.mrp
    if original.rating == 0 and ai_data.rating > 0:
        original.rating = ai_data.rating
    if original.review_count == 0 and ai_data.review_count > 0:
        original.review_count = ai_data.review_count
    if not original.delivery_info and ai_data.delivery_info:
        original.delivery_info = ai_data.delivery_info
    if original.shipping_cost == 0 and ai_data.shipping_cost > 0:
        original.shipping_cost = ai_data.shipping_cost
    if not original.availability and ai_data.availability:
        original.availability = ai_data.availability

    # For card offers, prefer AI if it found more
    if len(ai_data.card_offers) > len(original.card_offers):
        original.card_offers = ai_data.card_offers

    # Recalculate discount
    if original.mrp > 0 and original.price > 0:
        original.discount_percent = round(((original.mrp - original.price) / original.mrp) * 100, 2)

    return original


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _safe_int(v) -> int:
    if v is None:
        return 0
    try:
        return int(v)
    except (ValueError, TypeError):
        return 0
