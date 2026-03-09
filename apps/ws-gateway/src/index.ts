import 'dotenv/config';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import pino from 'pino';
import { ConnectionManager } from './connectionManager.js';
import { RedisSubscriber } from './redisSubscriber.js';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const PORT = parseInt(process.env.WS_PORT || '3001');

const httpServer = createServer((_req, res) => {
  if (_req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: connectionManager.getCount() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
const connectionManager = new ConnectionManager(logger);
const redisSubscriber = new RedisSubscriber(connectionManager, logger);

wss.on('connection', (ws, req) => {
  connectionManager.handleConnection(ws, req);
});

wss.on('error', (error) => {
  logger.error({ error }, 'WebSocket server error');
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'WebSocket gateway started');
  redisSubscriber.start();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down WebSocket gateway...');
  redisSubscriber.stop();
  wss.close();
  httpServer.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
