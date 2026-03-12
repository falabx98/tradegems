import { useEffect, useRef } from 'react';
import { getAccessToken } from './api';

// ─── Configuration ───────────────────────────────────────────────────────────

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────────

type EventCallback = (data: any) => void;

interface WsMessage {
  type: string;
  [key: string]: any;
}

// ─── WebSocket Client ────────────────────────────────────────────────────────

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<EventCallback>>();
  private subscriptions = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private _token: string | null = null;

  // ─── Connection ──────────────────────────────────────────────────────

  connect(token?: string) {
    // Store token for reconnects
    if (token !== undefined) {
      this._token = token;
    }

    // Resolve token: explicit param > stored > from auth module
    const authToken = this._token ?? getAccessToken();
    if (!authToken) {
      console.warn('[WS] No auth token available, skipping connect');
      return;
    }
    this._token = authToken;

    // Clean up existing connection
    this.cleanup();
    this.intentionalClose = false;

    // Build URL with auth token
    const url = `${WS_URL}?token=${encodeURIComponent(authToken)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      // Re-subscribe to previously active channels
      for (const channel of this.subscriptions) {
        this.sendRaw({ type: 'subscribe', channel });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        // Handle pong
        if (msg.type === 'pong') return;

        // Dispatch to listeners
        const callbacks = this.listeners.get(msg.type);
        if (callbacks) {
          for (const cb of callbacks) {
            try {
              cb(msg);
            } catch (err) {
              console.error(`[WS] Listener error for "${msg.type}":`, err);
            }
          }
        }

        // Also dispatch to wildcard listeners
        const wildcardCallbacks = this.listeners.get('*');
        if (wildcardCallbacks) {
          for (const cb of wildcardCallbacks) {
            try {
              cb(msg);
            } catch (err) {
              console.error('[WS] Wildcard listener error:', err);
            }
          }
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code: ${event.code})`);
      this.stopHeartbeat();

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  disconnect() {
    this.intentionalClose = true;
    this.cleanup();
    this._token = null;
    console.log('[WS] Disconnected (intentional)');
  }

  // ─── Subscriptions ───────────────────────────────────────────────────

  subscribe(channel: string) {
    this.subscriptions.add(channel);
    if (this.isConnected()) {
      this.sendRaw({ type: 'subscribe', channel });
    }
  }

  unsubscribe(channel: string) {
    this.subscriptions.delete(channel);
    if (this.isConnected()) {
      this.sendRaw({ type: 'unsubscribe', channel });
    }
  }

  // ─── Event Listeners ─────────────────────────────────────────────────

  /**
   * Register a listener for a specific event type.
   * Returns an unsubscribe function.
   */
  on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  // ─── Send ─────────────────────────────────────────────────────────────

  send(message: object) {
    this.sendRaw(message);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendRaw(data: object) {
    if (!this.isConnected()) {
      console.warn('[WS] Cannot send, not connected');
      return;
    }
    this.ws!.send(JSON.stringify(data));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendRaw({ type: 'ping' });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanup() {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}

// ─── Singleton & Exports ─────────────────────────────────────────────────────

export const wsClient = new WebSocketClient();

export function connectWebSocket(token?: string) {
  wsClient.connect(token);
}

export function disconnectWebSocket() {
  wsClient.disconnect();
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * Subscribe to a WebSocket event type within a React component.
 * Automatically cleans up the listener on unmount.
 *
 * @param eventType - The message type to listen for (e.g. 'deposit_confirmed')
 * @param callback  - Called with the full message payload when the event fires
 */
export function useWebSocket(eventType: string, callback: EventCallback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsubscribe = wsClient.on(eventType, (data) => {
      callbackRef.current(data);
    });
    return unsubscribe;
  }, [eventType]);
}
