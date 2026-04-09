import { WSMessage } from "../types";
import { api } from "./api";

type WSCallback = (msg: WSMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<WSCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;

    const token = await api.getAccessToken();
    if (!token) return;

    this.isConnecting = true;
    const wsUrl = await api.getWSUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnecting = false;
      console.log("[ws] connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        const callbacks = this.listeners.get(msg.event);
        if (callbacks) {
          callbacks.forEach((cb) => cb(msg));
        }
        // Also notify wildcard listeners
        const wildcardCallbacks = this.listeners.get("*");
        if (wildcardCallbacks) {
          wildcardCallbacks.forEach((cb) => cb(msg));
        }
      } catch (e) {
        console.warn("[ws] failed to parse message:", e);
      }
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      console.log("[ws] disconnected, reconnecting in 3s...");
      this.scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      this.isConnecting = false;
      console.warn("[ws] error:", e);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  on(event: string, callback: WSCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

export const wsService = new WebSocketService();
