import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import type { Logger } from 'pino';

interface AuthPayload {
  sub: string;
  role: string;
  sid: string;
}

interface ClientConnection {
  ws: WebSocket;
  userId: string | null;
  sessionId: string | null;
  subscribedRounds: Set<string>;
  isAlive: boolean;
  connectedAt: number;
  messageCount: number;
  messageWindowStart: number;
}

export class ConnectionManager {
  private clients = new Map<WebSocket, ClientConnection>();
  private userConnections = new Map<string, Set<WebSocket>>();
  private roundSubscribers = new Map<string, Set<WebSocket>>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly MAX_CONNECTIONS = 10_000;
  private static readonly MAX_MESSAGES_PER_SECOND = 50;

  constructor(private logger: Logger) {
    this.startHeartbeat();
  }

  getCount(): number {
    return this.clients.size;
  }

  handleConnection(ws: WebSocket, req: IncomingMessage) {
    // Enforce connection limit to prevent DoS
    if (this.clients.size >= ConnectionManager.MAX_CONNECTIONS) {
      ws.close(1013, 'Server at capacity');
      this.logger.warn({ total: this.clients.size }, 'Connection rejected: at capacity');
      return;
    }

    const conn: ClientConnection = {
      ws,
      userId: null,
      sessionId: null,
      subscribedRounds: new Set(),
      isAlive: true,
      connectedAt: Date.now(),
      messageCount: 0,
      messageWindowStart: Date.now(),
    };

    this.clients.set(ws, conn);

    // Try to authenticate from query param
    const url = new URL(req.url || '', `http://localhost`);
    const token = url.searchParams.get('token');
    if (token) {
      this.authenticate(ws, token);
    }

    this.logger.debug({ totalClients: this.clients.size }, 'Client connected');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) client.isAlive = true;
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      this.logger.warn({ error: err.message }, 'Client WebSocket error');
    });

    // Send welcome
    this.send(ws, {
      type: 'connected',
      timestamp: Date.now(),
      requiresAuth: !conn.userId,
    });
  }

  private handleMessage(ws: WebSocket, msg: { type: string; [key: string]: unknown }) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    // Rate limit messages per connection
    const now = Date.now();
    if (now - conn.messageWindowStart > 1000) {
      conn.messageCount = 0;
      conn.messageWindowStart = now;
    }
    if (++conn.messageCount > ConnectionManager.MAX_MESSAGES_PER_SECOND) {
      this.logger.warn({ userId: conn.userId }, 'Client exceeded message rate limit');
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    switch (msg.type) {
      case 'auth':
        this.authenticate(ws, msg.token as string);
        break;

      case 'subscribe_round':
        this.subscribeToRound(ws, msg.roundId as string);
        break;

      case 'unsubscribe_round':
        this.unsubscribeFromRound(ws, msg.roundId as string);
        break;

      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        this.send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  }

  private authenticate(ws: WebSocket, token: string) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET not configured');

      const payload = jwt.verify(token, secret) as AuthPayload;
      conn.userId = payload.sub;
      conn.sessionId = payload.sid;

      // Track user connections
      if (!this.userConnections.has(payload.sub)) {
        this.userConnections.set(payload.sub, new Set());
      }
      this.userConnections.get(payload.sub)!.add(ws);

      this.send(ws, { type: 'authenticated', userId: payload.sub });
      this.logger.debug({ userId: payload.sub }, 'Client authenticated');
    } catch {
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
    }
  }

  private subscribeToRound(ws: WebSocket, roundId: string) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    conn.subscribedRounds.add(roundId);

    if (!this.roundSubscribers.has(roundId)) {
      this.roundSubscribers.set(roundId, new Set());
    }
    this.roundSubscribers.get(roundId)!.add(ws);

    this.send(ws, { type: 'subscribed', roundId });
  }

  private unsubscribeFromRound(ws: WebSocket, roundId: string) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    conn.subscribedRounds.delete(roundId);
    this.roundSubscribers.get(roundId)?.delete(ws);
  }

  private handleDisconnect(ws: WebSocket) {
    const conn = this.clients.get(ws);
    if (!conn) return;

    // Clean up user tracking
    if (conn.userId) {
      const userConns = this.userConnections.get(conn.userId);
      if (userConns) {
        userConns.delete(ws);
        if (userConns.size === 0) this.userConnections.delete(conn.userId);
      }
    }

    // Clean up round subscriptions
    for (const roundId of conn.subscribedRounds) {
      this.roundSubscribers.get(roundId)?.delete(ws);
    }

    this.clients.delete(ws);
    this.logger.debug({ totalClients: this.clients.size }, 'Client disconnected');
  }

  // ─── Broadcasting ─────────────────────────────────────────

  broadcastToRound(roundId: string, message: unknown) {
    const subscribers = this.roundSubscribers.get(roundId);
    if (!subscribers) return;

    const data = JSON.stringify(message);
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  broadcastToAll(message: unknown) {
    const data = JSON.stringify(message);
    for (const [ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  sendToUser(userId: string, message: unknown) {
    const conns = this.userConnections.get(userId);
    if (!conns) return;

    const data = JSON.stringify(message);
    for (const ws of conns) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, message: unknown) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // ─── Heartbeat ────────────────────────────────────────────

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, conn] of this.clients) {
        if (!conn.isAlive) {
          ws.terminate();
          this.handleDisconnect(ws);
          continue;
        }
        conn.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const [ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
  }
}
