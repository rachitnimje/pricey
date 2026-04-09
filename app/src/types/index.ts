// Type definitions for the Pricey app

export interface User {
  id: string;
  email: string;
  phone?: string;
  name?: string;
  auth_provider: string;
  notification_prefs: NotificationPrefs;
  created_at: string;
  updated_at: string;
}

export interface NotificationPrefs {
  push: boolean;
  email: boolean;
  whatsapp: boolean;
}

export interface Comparison {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  products?: Product[];
}

export interface Product {
  id: string;
  comparison_id: string;
  url: string;
  site: string;
  external_product_id?: string;
  product_name?: string;
  image_url?: string;
  category?: string;
  last_scraped_at?: string;
  scrape_status: "pending" | "success" | "failed";
  created_at: string;
  latest_snapshot?: PriceSnapshot;
}

export interface PriceSnapshot {
  id: number;
  product_id: string;
  price: number | null;
  mrp?: number | null;
  discount_percent?: number | null;
  availability?: string | null;
  delivery_info?: string | null;
  delivery_days?: number | null;
  shipping_cost: number | null;
  card_offers: CardOffer[];
  rating?: number | null;
  review_count?: number | null;
  scraped_at: string;
}

export interface CardOffer {
  bank: string;
  type: string; // "Cash" or "EMI"
  amount: string;
  description: string;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  product_id: string;
  comparison_id: string;
  target_price: number;
  channels: AlertChannel[];
  is_active: boolean;
  last_triggered_at?: string;
  trigger_count: number;
  created_at: string;
  product?: Product;
}

export type AlertChannel = "push" | "email" | "whatsapp";

// WebSocket event types
export interface WSMessage {
  event:
    | "scrape_progress"
    | "scrape_complete"
    | "scrape_failed"
    | "price_changed"
    | "alert_triggered";
  data: Record<string, unknown>;
}

// API request types
export interface CreateComparisonRequest {
  name: string;
  urls: string[];
}

export interface CreateAlertRequest {
  product_id?: string;
  comparison_id: string;
  target_price: number;
  channels: AlertChannel[];
}
