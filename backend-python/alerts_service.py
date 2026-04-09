"""Alert notification service — push, email, WhatsApp, and in-app WebSocket."""
from __future__ import annotations
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from base64 import b64encode

import httpx

from config import config
from models import PriceAlert
from store import Store
from ws_hub import Hub, EVENT_ALERT_TRIGGERED

logger = logging.getLogger(__name__)


def _friendly_site(site: str, url: str = "") -> str:
    """Convert internal site key or URL to a readable website name."""
    if url:
        try:
            from urllib.parse import urlparse
            hostname = urlparse(url).hostname or ""
            hostname = hostname.replace("www.", "")
            if hostname:
                return hostname
        except Exception:
            pass
    _MAP = {
        "amazon.in": "Amazon.in",
        "flipkart": "Flipkart",
        "croma": "Croma",
        "reliancedigital": "Reliance Digital",
        "vijaysales": "Vijay Sales",
        "sangeethamobiles": "Sangeetha Mobiles",
        "myntra": "Myntra",
        "ajio": "Ajio",
        "meesho": "Meesho",
    }
    return _MAP.get(site, site)


class AlertService:
    def __init__(self, store: Store, hub: Hub):
        self.store = store
        self.hub = hub

    async def check_and_notify(self, product_id: str, current_price: float, product_name: str, site: str, url: str = ""):
        """Check all active product-level alerts after a new price snapshot."""
        alerts = await self.store.get_active_alerts_for_product(product_id)
        for alert in alerts:
            if current_price > 0 and current_price <= alert.target_price:
                logger.info(f"[alerts] triggered alert {alert.id}: ₹{current_price:.2f} <= ₹{alert.target_price:.2f} for {product_name}")
                await self._trigger_alert(alert, current_price, product_name, site, url)

    async def check_comparison_alerts(self, comparison_id: str, best_price: float, best_product_name: str, best_site: str, best_url: str = ""):
        """Check comparison-level alerts against the best price across all products."""
        alerts = await self.store.get_active_alerts_for_comparison(comparison_id)
        for alert in alerts:
            if best_price > 0 and best_price <= alert.target_price:
                logger.info(f"[alerts] triggered comparison alert {alert.id}: best ₹{best_price:.2f} <= ₹{alert.target_price:.2f}")
                await self._trigger_alert(alert, best_price, best_product_name, best_site, best_url)

    async def _trigger_alert(self, alert: PriceAlert, price: float, product_name: str, site: str, url: str = ""):
        display_site = _friendly_site(site, url)

        # Always send in-app WS notification
        await self.hub.send_to_user(alert.user_id, EVENT_ALERT_TRIGGERED, {
            "alert_id": alert.id,
            "comparison_id": alert.comparison_id,
            "product_name": product_name,
            "site": display_site,
            "url": url,
            "price": price,
            "target_price": alert.target_price,
            "title": f"Price Drop! {product_name}",
            "body": f"Now ₹{price:.0f} on {display_site} — your target price has been reached!",
        })

        for ch in alert.channels:
            if ch == "push":
                await self._send_push(alert.user_id, price, product_name, display_site, alert.comparison_id)
            elif ch == "email":
                await self._send_email(alert.user_id, price, product_name, display_site, alert.comparison_id, url)
            elif ch == "whatsapp":
                await self._send_whatsapp(alert.user_id, price, product_name, display_site, url)

        await self.store.mark_alert_triggered(alert.id)

    # ── Push (Expo) ──────────────────────────────────────────────────────────

    async def _send_push(self, user_id: str, price: float, product_name: str, site: str, comparison_id: str):
        user = await self.store.get_user_by_id(user_id)
        if not user or not user.fcm_token:
            logger.info(f"[push] skipped: no push token for user {user_id}")
            return

        payload = [{
            "to": user.fcm_token,
            "title": f"🔔 Price Drop! {product_name}",
            "body": f"Now ₹{price:.0f} on {site} — your target price has been reached!",
            "sound": "default",
            "data": {"comparison_id": comparison_id, "type": "price_alert"},
        }]

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=payload,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                logger.info(f"[push] sent to user {user_id}: {product_name} dropped to ₹{price:.0f} on {site} (status: {resp.status_code})")
        except Exception as e:
            logger.error(f"[push] send failed: {e}")

    # ── Email (Gmail SMTP or Resend fallback) ────────────────────────────────

    async def _send_email(self, user_id: str, price: float, product_name: str, site: str, comparison_id: str, url: str = ""):
        user = await self.store.get_user_by_id(user_id)
        if not user:
            return

        buy_link = ""
        if url:
            buy_link = f"""<div style="text-align: center; margin-top: 12px;">
                    <a href="{url}"
                       style="display: inline-block; background: #047857; color: white; padding: 14px 32px;
                              border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 15px;">
                        Buy Now on {site}
                    </a>
                </div>"""

        subject = f"🔔 Price Drop: {product_name} is now ₹{price:.0f} on {site}!"
        html_body = f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 20px; font-weight: 700; color: #065F46;">Pricey</span>
                </div>
                <div style="background: linear-gradient(135deg, #ECFDF5, #D1FAE5); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px; color: #065F46; font-weight: 600;">Price Drop Alert! 🎉</p>
                    <p style="margin: 0; font-size: 32px; font-weight: 800; color: #047857;">₹{price:,.0f}</p>
                    <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">{product_name} on {site}</p>
                </div>
                <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                    Great news! The price of <strong>{product_name}</strong> on <strong>{site}</strong> has dropped to
                    <strong style="color: #047857;">₹{price:,.0f}</strong> — at or below your target price.
                    Time to grab the deal!
                </p>
                {buy_link}
                <div style="text-align: center; margin-top: 16px;">
                    <a href="pricey://comparison/{comparison_id}"
                       style="display: inline-block; background: #059669; color: white; padding: 14px 32px;
                              border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 15px;">
                        View Comparison
                    </a>
                </div>
                <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 32px;">
                    You're receiving this because you set a price alert on Pricey.
                </p>
            </div>"""

        # Try Gmail SMTP first
        if config.gmail_address and config.gmail_app_password:
            await self._send_email_gmail(user.email, subject, html_body)
        # Fall back to Resend API
        elif config.resend_api_key:
            await self._send_email_resend(user.email, subject, html_body)
        else:
            logger.info(f"[email] skipped (no email provider configured): {product_name}")

    async def _send_email_gmail(self, to_email: str, subject: str, html_body: str):
        try:
            import aiosmtplib

            msg = MIMEMultipart("alternative")
            msg["From"] = f"Pricey <{config.gmail_address}>"
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html_body, "html"))

            await aiosmtplib.send(
                msg,
                hostname="smtp.gmail.com",
                port=587,
                start_tls=True,
                username=config.gmail_address,
                password=config.gmail_app_password,
            )
            logger.info(f"[email-gmail] sent to {to_email}: {subject}")
        except Exception as e:
            logger.error(f"[email-gmail] send failed to {to_email}: {e}")

    async def _send_email_resend(self, to_email: str, subject: str, html_body: str):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    json={
                        "from": "Pricey <alerts@pricey.app>",
                        "to": [to_email],
                        "subject": subject,
                        "html": html_body,
                    },
                    headers={"Authorization": f"Bearer {config.resend_api_key}", "Content-Type": "application/json"},
                )
                logger.info(f"[email-resend] sent to {to_email} (status: {resp.status_code})")
        except Exception as e:
            logger.error(f"[email-resend] send failed: {e}")

    # ── WhatsApp (Twilio or MSG91 fallback) ──────────────────────────────────

    async def _send_whatsapp(self, user_id: str, price: float, product_name: str, site: str, url: str = ""):
        user = await self.store.get_user_by_id(user_id)
        if not user or not user.phone:
            logger.info(f"[whatsapp] skipped: no phone number for user {user_id}")
            return

        # Try Twilio first
        if config.twilio_account_sid and config.twilio_auth_token and config.twilio_whatsapp_from:
            await self._send_whatsapp_twilio(user.phone, price, product_name, site, url)
        # Fall back to MSG91
        elif config.msg91_auth_key:
            await self._send_whatsapp_msg91(user.phone, price, product_name, site)
        else:
            logger.info(f"[whatsapp] skipped (no WhatsApp provider configured): {product_name}")

    async def _send_whatsapp_twilio(self, phone: str, price: float, product_name: str, site: str, url: str = ""):
        link_line = f"\n🛒 Buy now: {url}" if url else ""
        body = (
            f"🔔 *Price Drop Alert!*\n\n"
            f"*{product_name}* on *{site}* dropped to *₹{price:,.0f}*\n\n"
            f"Your target price has been reached!{link_line}"
        )

        # Ensure phone has whatsapp: prefix
        to_number = f"whatsapp:{phone}" if not phone.startswith("whatsapp:") else phone

        auth = b64encode(f"{config.twilio_account_sid}:{config.twilio_auth_token}".encode()).decode()

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{config.twilio_account_sid}/Messages.json",
                    data={
                        "From": config.twilio_whatsapp_from,
                        "To": to_number,
                        "Body": body,
                    },
                    headers={"Authorization": f"Basic {auth}"},
                )
                logger.info(f"[whatsapp-twilio] sent to {phone}: {product_name} (status: {resp.status_code})")
        except Exception as e:
            logger.error(f"[whatsapp-twilio] send failed: {e}")

    async def _send_whatsapp_msg91(self, phone: str, price: float, product_name: str, site: str):
        payload = {
            "integrated_number": config.msg91_sender_id,
            "content_type": "template",
            "payload": {
                "to": phone,
                "type": "template",
                "template": {
                    "name": config.msg91_template_id,
                    "language": {"code": "en"},
                    "components": [{
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": product_name},
                            {"type": "text", "text": f"₹{price:.0f}"},
                            {"type": "text", "text": site},
                        ],
                    }],
                },
            },
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
                    json=payload,
                    headers={"authkey": config.msg91_auth_key, "Content-Type": "application/json"},
                )
                logger.info(f"[whatsapp-msg91] sent to {phone}: {product_name} (status: {resp.status_code})")
        except Exception as e:
            logger.error(f"[whatsapp-msg91] send failed: {e}")
