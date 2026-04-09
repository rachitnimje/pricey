"""All site-specific and generic scrapers using Playwright."""
from __future__ import annotations
import asyncio
import json
import logging
import random
import re
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from models import ScrapedData
from scraper_helpers import (
    detect_site, extract_generic_card_offers, enrich_from_json_ld,
    get_user_agent, parse_price, parse_rating, parse_review_count,
    normalize_availability,
)
from ai_scraper import extract_with_ai, merge_ai_data
from config import config

logger = logging.getLogger(__name__)

# Shared browser instance
_browser: Optional[Browser] = None
_pw = None
_browser_lock = asyncio.Lock()

_LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-infobars",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
]


async def init_browser():
    global _browser, _pw
    _pw = await async_playwright().start()
    _browser = await _pw.chromium.launch(headless=True, args=_LAUNCH_ARGS)
    logger.info("[scraper] browser launched")


async def close_browser():
    global _browser, _pw
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _pw:
        try:
            await _pw.stop()
        except Exception:
            pass
        _pw = None


async def _ensure_browser():
    """Restart the browser if it has crashed or its connection was closed."""
    global _browser
    async with _browser_lock:
        if _browser is not None and _browser.is_connected():
            return
        logger.warning("[scraper] browser is dead — restarting")
        await close_browser()
        await init_browser()


_CONTEXT_KWARGS = dict(
    viewport={"width": 1920, "height": 1080},
    java_script_enabled=True,
)

_BROWSER_DEAD_PHRASES = (
    "Connection closed",
    "Target closed",
    "Browser has been closed",
    "Execution context was destroyed",
)


def _is_browser_dead_error(e: Exception) -> bool:
    msg = str(e)
    return any(phrase in msg for phrase in _BROWSER_DEAD_PHRASES)


async def _new_context() -> BrowserContext:
    await _ensure_browser()
    try:
        return await _browser.new_context(  # type: ignore[union-attr]
            user_agent=get_user_agent(), **_CONTEXT_KWARGS
        )
    except Exception as e:
        if not _is_browser_dead_error(e):
            raise
        # Browser died between the is_connected() check and the actual IPC call.
        # Force restart and retry once.
        logger.warning(f"[scraper] browser connection lost in new_context ({e}) — restarting")
        async with _browser_lock:
            await close_browser()
            await init_browser()
        return await _browser.new_context(  # type: ignore[union-attr]
            user_agent=get_user_agent(), **_CONTEXT_KWARGS
        )


# ---------------------------------------------------------------------------
# Amazon.in
# ---------------------------------------------------------------------------

async def scrape_amazon(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(2, 5))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_selector("#productTitle", timeout=10000)
        await page.wait_for_timeout(1000)

        json_ld = await page.evaluate("""() => {
            const el = document.querySelector('script[type="application/ld+json"]');
            return el ? el.textContent : '';
        }""")

        title = await _text(page, "#productTitle")
        price_str = await page.evaluate("""() =>
            document.querySelector('.a-price .a-offscreen')?.textContent ||
            document.querySelector('#priceblock_dealprice')?.textContent ||
            document.querySelector('#priceblock_ourprice')?.textContent || ''
        """)
        mrp_str = await page.evaluate("""() =>
            document.querySelector('.a-price.a-text-price .a-offscreen')?.textContent ||
            document.querySelector('.priceBlockStrikePriceString')?.textContent || ''
        """)
        rating = await page.evaluate("() => document.querySelector('#acrPopover .a-icon-alt')?.textContent || ''")
        reviews = await page.evaluate("() => document.querySelector('#acrCustomerReviewText')?.textContent || ''")
        avail = await page.evaluate("() => document.querySelector('#availability span')?.textContent?.trim() || ''")
        delivery = await page.evaluate("""() =>
            document.querySelector('#deliveryBlockMessage .a-text-bold')?.textContent?.trim() ||
            document.querySelector('#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE .a-text-bold')?.textContent?.trim() || ''
        """)
        image_url = await page.evaluate("""() =>
            document.querySelector('#landingImage')?.src ||
            document.querySelector('#imgBlkFront')?.src || ''
        """)

        page_html = await page.content()

        data = ScrapedData(
            product_name=title.strip(),
            image_url=image_url,
            price=parse_price(price_str),
            mrp=parse_price(mrp_str),
            availability=normalize_availability(avail),
            delivery_info=delivery.strip(),
            rating=parse_rating(rating),
            review_count=parse_review_count(reviews),
            card_offers=extract_generic_card_offers(page_html),
        )

        if json_ld:
            enrich_from_json_ld(data, json_ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        data.external_id = _extract_amazon_asin(url)
        data.raw_data = {"title": title, "price": price_str, "mrp": mrp_str, "rating": rating, "reviews": reviews, "availability": avail, "delivery": delivery, "json_ld": json_ld}

        logger.info(f"[amazon] scraped: {data.product_name} | ₹{data.price:.2f} | {data.availability}")
        return data
    finally:
        await ctx.close()


def _extract_amazon_asin(url: str) -> str:
    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", url)
    return m.group(1) if m else ""


# ---------------------------------------------------------------------------
# Flipkart
# ---------------------------------------------------------------------------

async def scrape_flipkart(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(2, 5))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # Flipkart uses React Native Web with randomized CSS classes.
        # JSON-LD is the most reliable data source.
        json_ld_raw = await page.evaluate("""() => {
            const els = document.querySelectorAll('script[type="application/ld+json"]');
            const results = [];
            els.forEach(el => { try { results.push(el.textContent); } catch(e) {} });
            return JSON.stringify(results);
        }""")

        title = await page.evaluate("""() =>
            document.querySelector('h1')?.textContent?.trim() ||
            document.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
        """)

        # Price: look for ₹ patterns in the page — first large ₹ amount is usually the selling price
        price_str = await page.evaluate("""() => {
            const meta = document.querySelector('meta[property="product:price:amount"]');
            if (meta) return meta.getAttribute('content') || '';
            // Fallback: find ₹ elements
            const els = document.querySelectorAll('div, span');
            for (const el of els) {
                const txt = el.textContent.trim();
                if (/^₹[\\d,]+$/.test(txt) && txt.length < 15 && !el.querySelector('div, span')) return txt;
            }
            return '';
        }""")

        mrp_str = await page.evaluate("""() => {
            // MRP is usually struck-through; try to find the second ₹ amount
            const els = document.querySelectorAll('div, span');
            const prices = [];
            for (const el of els) {
                const txt = el.textContent.trim();
                if (/^₹[\\d,]+$/.test(txt) && txt.length < 15 && !el.querySelector('div, span')) {
                    prices.push(txt);
                }
            }
            // Second unique price is typically MRP
            const unique = [...new Set(prices)];
            return unique.length >= 2 ? unique[1] : '';
        }""")

        image_url = await page.evaluate("""() => {
            const og = document.querySelector('meta[property="og:image"]');
            if (og) return og.getAttribute('content') || '';
            const imgs = document.querySelectorAll('img[src*="flixcart"]');
            for (const img of imgs) {
                if (img.naturalWidth > 200) return img.src;
            }
            return '';
        }""")

        page_html = await page.content()

        data = ScrapedData(
            product_name=(title or "").strip(),
            image_url=image_url,
            price=parse_price(price_str),
            mrp=parse_price(mrp_str),
            availability="in_stock",
            card_offers=extract_generic_card_offers(page_html),
        )

        if "currently unavailable" in page_html.lower():
            data.availability = "out_of_stock"

        # Enrich from all JSON-LD blocks (rating, reviews, shipping, etc.)
        try:
            ld_list = json.loads(json_ld_raw) if json_ld_raw else []
        except (json.JSONDecodeError, TypeError):
            ld_list = []
        for ld in ld_list:
            enrich_from_json_ld(data, ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        data.external_id = _extract_flipkart_pid(url)
        data.raw_data = {"title": title, "price": price_str, "mrp": mrp_str, "json_ld_count": len(ld_list)}

        logger.info(f"[flipkart] scraped: {data.product_name} | ₹{data.price:.2f} | rating={data.rating} | reviews={data.review_count} | {data.availability}")
        return data
    finally:
        await ctx.close()


def _extract_flipkart_pid(url: str) -> str:
    m = re.search(r"/p/([a-zA-Z0-9]+)", url)
    if m:
        return m.group(1)
    m = re.search(r"pid=([a-zA-Z0-9]+)", url)
    return m.group(1) if m else ""


# ---------------------------------------------------------------------------
# Croma
# ---------------------------------------------------------------------------

async def scrape_croma(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(2, 5))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        json_ld = await page.evaluate("""() => {
            const el = document.querySelector('script[type="application/ld+json"]');
            return el ? el.textContent : '';
        }""")

        title = await page.evaluate("() => document.querySelector('h1.pd-title')?.textContent || document.querySelector('h1')?.textContent || ''")
        price_str = await page.evaluate("""() =>
            document.querySelector('span.pdp-e-i-PriceVal')?.textContent ||
            document.querySelector('.new-price span')?.textContent ||
            document.querySelector('[data-testid="new-price"]')?.textContent || ''
        """)
        mrp_str = await page.evaluate("""() =>
            document.querySelector('span.old-price span')?.textContent ||
            document.querySelector('.oldPrice')?.textContent || ''
        """)
        rating = await page.evaluate("() => document.querySelector('.rating-star span')?.textContent || ''")
        reviews = await page.evaluate("() => document.querySelector('.review-count')?.textContent || ''")
        delivery = await page.evaluate("""() =>
            document.querySelector('.shipping-info')?.textContent ||
            document.querySelector('.delivery-info')?.textContent || ''
        """)
        image_url = await page.evaluate("""() =>
            document.querySelector('.product-gallery img')?.src ||
            document.querySelector('.pd-image img')?.src ||
            document.querySelector('.slick-active img')?.src || ''
        """)

        page_html = await page.content()

        data = ScrapedData(
            product_name=(title or "").strip(),
            image_url=image_url,
            price=parse_price(price_str),
            mrp=parse_price(mrp_str),
            availability="in_stock",
            delivery_info=(delivery or "").strip(),
            rating=parse_rating(rating),
            review_count=parse_review_count(reviews),
            card_offers=extract_generic_card_offers(page_html),
        )

        if "out of stock" in page_html.lower() or "currently unavailable" in page_html.lower():
            data.availability = "out_of_stock"

        if json_ld:
            enrich_from_json_ld(data, json_ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        data.raw_data = {"title": title, "price": price_str, "mrp": mrp_str, "rating": rating, "reviews": reviews, "delivery": delivery}

        logger.info(f"[croma] scraped: {data.product_name} | ₹{data.price:.2f} | {data.availability}")
        return data
    finally:
        await ctx.close()


# ---------------------------------------------------------------------------
# Reliance Digital
# ---------------------------------------------------------------------------

async def scrape_reliance_digital(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(2, 5))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)

        # Get all JSON-LD blocks (Product type has everything we need)
        json_ld_raw = await page.evaluate("""() => {
            const els = document.querySelectorAll('script[type="application/ld+json"]');
            const results = [];
            els.forEach(el => { try { results.push(el.textContent); } catch(e) {} });
            return JSON.stringify(results);
        }""")

        title = await page.evaluate("() => document.querySelector('h1')?.textContent?.trim() || ''")

        # Price selectors based on actual RD DOM
        price_str = await page.evaluate("""() =>
            document.querySelector('.add-to-card-container__product-price')?.textContent?.trim() ||
            document.querySelector('.deal-offer-price')?.textContent?.trim() || ''
        """)

        mrp_str = await page.evaluate("""() =>
            document.querySelector('.product-marked-price')?.textContent?.trim() ||
            document.querySelector('.deal-offer-price')?.textContent?.trim() || ''
        """)

        # Rating from the feedback section
        rating = await page.evaluate("""() =>
            document.querySelector('.rd-feedback-service-average-rating-total-count')?.textContent?.trim() ||
            document.querySelector('.rd-feedback-service-rating-content')?.textContent?.trim() || ''
        """)

        reviews = await page.evaluate("""() => {
            const el = document.querySelector('.rd-feedback-service-average-rating-section');
            if (el) {
                const txt = el.textContent;
                const m = txt.match(/(\\d+)\\s*(?:Ratings|Reviews)/i);
                if (m) return m[0];
            }
            return '';
        }""")

        delivery = await page.evaluate("""() =>
            document.querySelector('.delivery-fulfilment')?.textContent?.trim() ||
            document.querySelector('.pincode-availability-desktop')?.textContent?.trim() || ''
        """)

        image_url = await page.evaluate("""() => {
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.getAttribute('content')?.includes('product')) return og.getAttribute('content');
            const pdpImg = document.querySelector('img.pdp-image');
            if (pdpImg) return pdpImg.src;
            const galleryImg = document.querySelector('img.fy__img');
            if (galleryImg) return galleryImg.src;
            return '';
        }""")

        # Card offers from offer cards
        offer_texts = await page.evaluate("""() => {
            const cards = document.querySelectorAll('.offer-card');
            return Array.from(cards).map(c => c.textContent.trim()).slice(0, 10);
        }""")

        page_html = await page.content()

        data = ScrapedData(
            product_name=(title or "").strip(),
            image_url=image_url,
            price=parse_price(price_str),
            mrp=parse_price(mrp_str),
            availability="in_stock",
            delivery_info=(delivery or "").strip(),
            rating=parse_rating(rating),
            review_count=parse_review_count(reviews),
            card_offers=extract_generic_card_offers(page_html),
        )

        if "out of stock" in page_html.lower() or "currently unavailable" in page_html.lower() or "sold out" in page_html.lower():
            data.availability = "out_of_stock"

        # Enrich from JSON-LD (Product block has price, rating, image)
        try:
            ld_list = json.loads(json_ld_raw) if json_ld_raw else []
        except (json.JSONDecodeError, TypeError):
            ld_list = []
        for ld in ld_list:
            enrich_from_json_ld(data, ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        data.raw_data = {"title": title, "price": price_str, "mrp": mrp_str, "rating": rating, "reviews": reviews, "delivery": delivery}

        logger.info(f"[reliancedigital] scraped: {data.product_name} | ₹{data.price:.2f} | rating={data.rating} | reviews={data.review_count} | {data.availability}")
        return data
    finally:
        await ctx.close()


# ---------------------------------------------------------------------------
# Vijay Sales
# ---------------------------------------------------------------------------

async def scrape_vijay_sales(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(2, 5))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        json_ld = await page.evaluate("""() => {
            const el = document.querySelector('script[type="application/ld+json"]');
            return el ? el.textContent : '';
        }""")

        title = await page.evaluate("() => document.querySelector('h1.product-title')?.textContent || document.querySelector('h1')?.textContent || ''")
        price_str = await page.evaluate("""() =>
            document.querySelector('.product-price .price')?.textContent ||
            document.querySelector('.pdp__offerPrice')?.textContent ||
            document.querySelector('.price-current')?.textContent || ''
        """)
        mrp_str = await page.evaluate("""() =>
            document.querySelector('.product-price .old-price')?.textContent ||
            document.querySelector('.pdp__mrp')?.textContent ||
            document.querySelector('.price-old')?.textContent || ''
        """)
        rating = await page.evaluate("() => document.querySelector('.rating-value')?.textContent || ''")
        reviews = await page.evaluate("() => document.querySelector('.review-count')?.textContent || ''")
        delivery = await page.evaluate("""() =>
            document.querySelector('.delivery-info')?.textContent ||
            document.querySelector('.shipping-info')?.textContent || ''
        """)
        image_url = await page.evaluate("""() =>
            document.querySelector('.product-image img')?.src ||
            document.querySelector('.gallery-image img')?.src ||
            document.querySelector('.slick-active img')?.src || ''
        """)

        page_html = await page.content()

        data = ScrapedData(
            product_name=(title or "").strip(),
            image_url=image_url,
            price=parse_price(price_str),
            mrp=parse_price(mrp_str),
            availability="in_stock",
            delivery_info=(delivery or "").strip(),
            rating=parse_rating(rating),
            review_count=parse_review_count(reviews),
            card_offers=extract_generic_card_offers(page_html),
        )

        if "out of stock" in page_html.lower() or "currently unavailable" in page_html.lower() or "sold out" in page_html.lower():
            data.availability = "out_of_stock"

        if json_ld:
            enrich_from_json_ld(data, json_ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        data.raw_data = {"title": title, "price": price_str, "mrp": mrp_str, "rating": rating, "reviews": reviews, "delivery": delivery}

        logger.info(f"[vijaysales] scraped: {data.product_name} | ₹{data.price:.2f} | {data.availability}")
        return data
    finally:
        await ctx.close()


# ---------------------------------------------------------------------------
# Generic (any website)
# ---------------------------------------------------------------------------

async def scrape_generic(url: str) -> ScrapedData:
    await asyncio.sleep(random.uniform(1, 3))
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        json_lds = await page.evaluate("""() => {
            const els = document.querySelectorAll('script[type="application/ld+json"]');
            const results = [];
            els.forEach(el => { try { results.push(el.textContent); } catch(e) {} });
            return JSON.stringify(results);
        }""")

        title = await page.evaluate("""() => {
            const h1 = document.querySelector('h1');
            if (h1 && h1.textContent.trim()) return h1.textContent.trim();
            const og = document.querySelector('meta[property="og:title"]');
            if (og) return og.getAttribute('content') || '';
            return document.title || '';
        }""")

        price_str = await page.evaluate("""() => {
            const ogPrice = document.querySelector('meta[property="product:price:amount"]');
            if (ogPrice) return ogPrice.getAttribute('content') || '';
            const metaPrice = document.querySelector('meta[property="og:price:amount"]');
            if (metaPrice) return metaPrice.getAttribute('content') || '';
            const priceSelectors = [
                '[class*="price" i]', '[class*="Price" i]',
                '[id*="price" i]', '[data-price]',
                '[itemprop="price"]',
            ];
            for (const sel of priceSelectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    const txt = el.textContent.trim();
                    if (txt.match(/₹\\s*[\\d,]+/) && txt.length < 30) return txt;
                    const attr = el.getAttribute('content') || el.getAttribute('data-price');
                    if (attr && attr.match(/[\\d.]+/)) return attr;
                }
            }
            const spans = document.querySelectorAll('span, div, p, strong');
            for (const el of spans) {
                const txt = el.textContent.trim();
                if (txt.match(/^₹\\s*[\\d,]+(\\.[\\d]+)?$/) && txt.length < 20) return txt;
            }
            return '';
        }""")

        image_url = await page.evaluate("""() => {
            const og = document.querySelector('meta[property="og:image"]');
            if (og) return og.getAttribute('content') || '';
            const itemprop = document.querySelector('[itemprop="image"]');
            if (itemprop) return itemprop.getAttribute('src') || itemprop.getAttribute('content') || '';
            return '';
        }""")

        # Rating from itemprop or class-based selectors
        rating_str = await page.evaluate("""() => {
            const ip = document.querySelector('[itemprop="ratingValue"]');
            if (ip) return ip.getAttribute('content') || ip.textContent.trim();
            const els = document.querySelectorAll('[class*="rating" i]');
            for (const el of els) {
                const txt = el.textContent.trim();
                const m = txt.match(/(\\d+\\.?\\d*)\\s*(?:\\/\\s*5|out of|stars?)/i);
                if (m) return m[1];
            }
            return '';
        }""")

        # Review count from itemprop or class-based selectors
        reviews_str = await page.evaluate("""() => {
            const ip = document.querySelector('[itemprop="reviewCount"]');
            if (ip) return ip.getAttribute('content') || ip.textContent.trim();
            const ip2 = document.querySelector('[itemprop="ratingCount"]');
            if (ip2) return ip2.getAttribute('content') || ip2.textContent.trim();
            const els = document.querySelectorAll('[class*="review" i]');
            for (const el of els) {
                const txt = el.textContent.trim();
                const m = txt.match(/(\\d[\\d,]*)\\s*(?:reviews?|ratings?)/i);
                if (m) return m[1];
            }
            return '';
        }""")

        page_html = await page.content()

        data = ScrapedData(
            product_name=(title or "").strip(),
            image_url=image_url,
            price=parse_price(price_str),
            availability="in_stock",
            rating=parse_rating(rating_str),
            review_count=parse_review_count(reviews_str),
            card_offers=extract_generic_card_offers(page_html),
        )

        # Enrich from JSON-LD
        try:
            ld_list = json.loads(json_lds) if json_lds else []
        except (json.JSONDecodeError, TypeError):
            ld_list = []
        for ld in ld_list:
            enrich_from_json_ld(data, ld)

        if data.mrp > 0 and data.price > 0:
            data.discount_percent = round(((data.mrp - data.price) / data.mrp) * 100, 2)

        if "out of stock" in page_html.lower() or "currently unavailable" in page_html.lower() or "sold out" in page_html.lower():
            data.availability = "out_of_stock"

        data.raw_data = {"title": title, "price": price_str, "image": image_url}

        logger.info(f"[generic] scraped: {data.product_name} | ₹{data.price:.2f} | {data.availability}")
        return data
    finally:
        await ctx.close()


# ---------------------------------------------------------------------------
# Registry / dispatcher
# ---------------------------------------------------------------------------

_SCRAPERS = {
    "amazon.in": scrape_amazon,
    "flipkart": scrape_flipkart,
    "croma": scrape_croma,
    "reliancedigital": scrape_reliance_digital,
    "vijaysales": scrape_vijay_sales,
    "generic": scrape_generic,
    # Sites that map to generic
    "sangeethamobiles": scrape_generic,
    "myntra": scrape_generic,
    "ajio": scrape_generic,
    "meesho": scrape_generic,
}


async def scrape_url(raw_url: str, use_ai: bool = False) -> tuple[str, ScrapedData]:
    """Detect site and scrape the URL. Returns (site, data).
    
    If use_ai is True and Groq is configured, runs traditional scrape
    and page-text extraction in parallel, then sends text to AI.
    """
    site = detect_site(raw_url)
    scraper_fn = _SCRAPERS.get(site)
    if scraper_fn is None:
        scraper_fn = scrape_generic

    if use_ai and config.groq_api_key:
        # Run traditional scrape + page text extraction in parallel
        data, page_text = await asyncio.gather(
            scraper_fn(raw_url),
            _get_page_text(raw_url),
        )
        # AI enrichment (needs the page text, so sequential)
        try:
            if page_text:
                ai_data = await extract_with_ai(page_text, raw_url)
                if ai_data:
                    data = merge_ai_data(data, ai_data)
                    logger.info(f"[scraper] AI-enriched {raw_url}")
        except Exception as e:
            logger.warning(f"[scraper] AI enrichment failed for {raw_url}: {e}")
    else:
        data = await scraper_fn(raw_url)

    return site, data


async def _get_page_text(url: str) -> str:
    """Quick page load to extract visible text for AI processing."""
    ctx = await _new_context()
    try:
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2000)
        text = await page.evaluate("""() => {
            // Remove scripts, styles, nav, footer
            const remove = document.querySelectorAll('script, style, nav, footer, header, iframe, noscript');
            remove.forEach(el => el.remove());
            return document.body.innerText.substring(0, 20000);
        }""")
        return text or ""
    except Exception as e:
        logger.warning(f"[scraper] failed to get page text for {url}: {e}")
        return ""
    finally:
        await ctx.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _text(page: Page, selector: str) -> str:
    try:
        el = await page.query_selector(selector)
        if el:
            return (await el.text_content()) or ""
    except Exception:
        pass
    return ""
