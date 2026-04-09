import { supabase } from "./supabase";
import Constants from "expo-constants";

function getApiBase() {
  // Use the local network IP so physical devices can reach the backend
  const debuggerHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (__DEV__ && debuggerHost) {
    return `http://${debuggerHost}:8080`;
  }
  return "https://pricey-api.onrender.com";
}

function getWsBase() {
  const debuggerHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (__DEV__ && debuggerHost) {
    return `ws://${debuggerHost}:8080`;
  }
  return "wss://pricey-api.onrender.com";
}

const API_BASE = getApiBase();
const WS_BASE = getWsBase();

class ApiClient {
  async getAccessToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async getWSUrl(): Promise<string> {
    const token = await this.getAccessToken();
    return `${WS_BASE}/ws?token=${token}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // --- User ---
  getMe() {
    return this.request<unknown>("GET", "/api/auth/me");
  }

  // --- Comparisons ---
  createComparison(name: string, urls: string[]) {
    return this.request<unknown>("POST", "/api/comparisons", { name, urls });
  }

  getComparisons() {
    return this.request<unknown[]>("GET", "/api/comparisons");
  }

  getComparison(id: string) {
    return this.request<unknown>(
      "GET",
      `/api/comparisons/${encodeURIComponent(id)}`,
    );
  }

  updateComparison(id: string, data: { name?: string; is_active?: boolean }) {
    return this.request<unknown>(
      "PUT",
      `/api/comparisons/${encodeURIComponent(id)}`,
      data,
    );
  }

  deleteComparison(id: string) {
    return this.request<unknown>(
      "DELETE",
      `/api/comparisons/${encodeURIComponent(id)}`,
    );
  }

  refreshComparison(id: string) {
    return this.request<unknown>(
      "POST",
      `/api/comparisons/${encodeURIComponent(id)}/refresh`,
    );
  }

  addURLsToComparison(id: string, urls: string[]) {
    return this.request<unknown>(
      "POST",
      `/api/comparisons/${encodeURIComponent(id)}/urls`,
      { urls },
    );
  }

  // --- Alerts ---
  createAlert(data: {
    product_id?: string;
    comparison_id: string;
    target_price: number;
    channels: string[];
  }) {
    return this.request<unknown>("POST", "/api/alerts", data);
  }

  getAlerts() {
    return this.request<unknown[]>("GET", "/api/alerts");
  }

  updateAlert(
    id: string,
    data: { target_price: number; is_active?: boolean; channels?: string[] },
  ) {
    return this.request<unknown>(
      "PUT",
      `/api/alerts/${encodeURIComponent(id)}`,
      data,
    );
  }

  deleteAlert(id: string) {
    return this.request<unknown>(
      "DELETE",
      `/api/alerts/${encodeURIComponent(id)}`,
    );
  }

  // --- Products ---
  getProductHistory(id: string, days = 30) {
    return this.request<unknown[]>(
      "GET",
      `/api/products/${encodeURIComponent(id)}/history?days=${days}`,
    );
  }

  getComparisonPriceHistory(id: string, days = 30) {
    return this.request<{ ts: string; best_price: number }[]>(
      "GET",
      `/api/comparisons/${encodeURIComponent(id)}/price-history?days=${days}`,
    );
  }

  // --- User ---
  updateFCMToken(token: string) {
    return this.request<unknown>("PUT", "/api/user/fcm-token", { token });
  }

  updateNotificationPrefs(prefs: {
    push: boolean;
    email: boolean;
    whatsapp: boolean;
  }) {
    return this.request<unknown>("PUT", "/api/user/notification-prefs", {
      prefs,
    });
  }

  updatePhone(phone: string) {
    return this.request<unknown>("PUT", "/api/user/phone", { phone });
  }

  getProfile() {
    return this.request<unknown>("GET", "/api/user/profile");
  }

  // --- AI Scraping ---
  getAIScraping() {
    return this.request<{ enabled: boolean; has_key: boolean; model: string }>(
      "GET",
      "/api/settings/ai-scraping",
    );
  }

  setAIScraping(enabled: boolean) {
    return this.request<{ enabled: boolean }>(
      "PUT",
      "/api/settings/ai-scraping",
      { enabled },
    );
  }
}

export const api = new ApiClient();
