import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    port: str = os.getenv("PORT", "8080")
    database_url: str = os.getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/pricey")
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    msg91_auth_key: str = os.getenv("MSG91_AUTH_KEY", "")
    msg91_sender_id: str = os.getenv("MSG91_SENDER_ID", "PRICEY")
    msg91_template_id: str = os.getenv("MSG91_TEMPLATE_ID", "")
    firebase_cred_path: str = os.getenv("FIREBASE_CRED_PATH", "")
    scrape_interval_min: int = int(os.getenv("SCRAPE_INTERVAL_MIN", "5"))
    scraper_workers: int = int(os.getenv("SCRAPER_WORKERS", "5"))
    chrome_exec_path: str = os.getenv("CHROME_EXEC_PATH", "")
    # Gmail SMTP
    gmail_address: str = os.getenv("GMAIL_ADDRESS", "")
    gmail_app_password: str = os.getenv("GMAIL_APP_PASSWORD", "")
    # Twilio WhatsApp
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_whatsapp_from: str = os.getenv("TWILIO_WHATSAPP_FROM", "")
    # SambaNova AI (primary)
    sambanova_api_key: str = os.getenv("SAMBANOVA_API_KEY", "")
    sambanova_model: str = os.getenv("SAMBANOVA_MODEL", "Meta-Llama-3.3-70B-Instruct")
    # Groq AI (fallback)
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    ai_scraping_enabled: bool = os.getenv("AI_SCRAPING_ENABLED", "false").lower() == "true"


config = Config()
