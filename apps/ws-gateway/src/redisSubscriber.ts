import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { ConnectionManager } from './connectionManager.js';

interface RoundEvent {
  type: string;
  roundId: string;
  payload?: unknown;
  [key: string]: unknown;
}

export class RedisSubscriber {
  private sub: Redis | null = null;
  private patterns = ['round:*', 'broadcast:*', 'user:*'];

  constructor(
    private connectionManager: ConnectionManager,
    private logger: Logger,
  ) {}

  start() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.sub = new Redis(redisUrl);

    this.sub.on('error', (err) => {
      this.logger.error({ error: err.message }, 'Redis subscriber error');
    });

    this.sub.on('connect', () => {
      this.logger.info('Redis subscriber connected');
    });

    // Subscribe to patterns
    this.sub.psubscribe(...this.patterns, (err) => {
      if (err) {
        this.logger.error({ error: err.message }, 'Failed to subscribe to Redis patterns');
      } else {
        this.logger.info({ patterns: this.patterns }, 'Subscribed to Redis patterns');
      }
    });

    this.sub.on('pmessage', (_pattern, channel, message) => {
      try {
        const parsed = JSON.parse(message);
        this.handleMessage(channel, parsed);
      } catch (err) {
        this.logger.warn({ channel, error: (err as Error).message }, 'Failed to parse Redis message');
      }
    });
  }

  private handleMessage(channel: string, event: RoundEvent) {
    // round:<roundId> — broadcast to round subscribers
    if (channel.startsWith('round:')) {
      const roundId = channel.replace('round:', '');
      this.connectionManager.broadcastToRound(roundId, {
        type: event.type,
        roundId,
        payload: event.payload ?? event,
        timestamp: Date.now(),
      });
      return;
    }

    // broadcast:* — broadcast to all connected clients
    if (channel.startsWith('broadcast:')) {
      this.connectionManager.broadcastToAll({
        type: event.type,
        payload: event.payload ?? event,
        timestamp: Date.now(),
      });
      return;
    }

    // user:<userId> — send to specific user
    if (channel.startsWith('user:')) {
      const userId = channel.replace('user:', '');
      this.connectionManager.sendToUser(userId, {
        type: event.type,
        payload: event.payload ?? event,
        timestamp: Date.now(),
      });
      return;
    }
  }

  stop() {
    if (this.sub) {
      this.sub.punsubscribe(...this.patterns);
      this.sub.quit();
      this.sub = null;
    }
  }
}
