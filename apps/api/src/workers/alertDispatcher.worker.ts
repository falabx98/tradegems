/**
 * Alert Dispatcher Worker
 *
 * Polls ops_alerts table every 30s for unacknowledged alerts.
 * Dispatches notifications to Telegram and/or Discord webhooks.
 * Uses a Redis cursor to avoid re-sending alerts.
 *
 * Env vars:
 *   OPS_TELEGRAM_BOT_TOKEN  — Telegram bot token
 *   OPS_TELEGRAM_CHAT_ID    — Telegram chat/group ID
 *   OPS_DISCORD_WEBHOOK_URL — Discord webhook URL
 *
 * If neither token is configured, the worker starts but only logs.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';

const POLL_INTERVAL = 30_000; // 30s
const CURSOR_KEY = 'alert-dispatcher:cursor';
const BATCH_SIZE = 50;

interface OpsAlertRow {
  id: string;
  severity: string;
  category: string;
  message: string;
  user_id: string | null;
  game: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Formatters ───────────────────────────────────────────

function formatAlertText(alert: OpsAlertRow): string {
  const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
  const lines = [
    `${icon} **${alert.severity.toUpperCase()}** — ${alert.category}`,
    alert.message,
    ...(alert.game ? [`Game: ${alert.game}`] : []),
    ...(alert.user_id ? [`User: ${alert.user_id}`] : []),
    `ID: ${alert.id}`,
    `At: ${alert.created_at}`,
  ];
  return lines.join('\n');
}

function formatTelegramText(alert: OpsAlertRow): string {
  const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
  const lines = [
    `${icon} <b>${escapeHtml(alert.severity.toUpperCase())}</b> — ${escapeHtml(alert.category)}`,
    escapeHtml(alert.message),
    ...(alert.game ? [`Game: ${escapeHtml(alert.game)}`] : []),
    ...(alert.user_id ? [`User: <code>${escapeHtml(alert.user_id)}</code>`] : []),
    `ID: <code>${escapeHtml(alert.id)}</code>`,
    `At: ${escapeHtml(alert.created_at)}`,
  ];
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Senders ──────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.OPS_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OPS_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[AlertDispatcher] Telegram send failed (${res.status}): ${body}`);
  }
}

async function sendDiscord(content: string): Promise<void> {
  const webhookUrl = process.env.OPS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.slice(0, 2000), // Discord limit
      username: 'TradeGems Ops',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[AlertDispatcher] Discord send failed (${res.status}): ${body}`);
  }
}

// ─── Main loop ────────────────────────────────────────────

async function pollAndDispatch(): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  // Get cursor (last dispatched alert timestamp)
  const cursor = await redis.get(CURSOR_KEY);
  const since = cursor || '1970-01-01T00:00:00Z';

  // Fetch new unacknowledged alerts
  const rows = await db.execute(sql`
    SELECT id, severity, category, message, user_id, game, metadata, created_at
    FROM ops_alerts
    WHERE created_at > ${since}::timestamptz
      AND acknowledged = false
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
  `) as unknown as OpsAlertRow[];

  const alerts = Array.isArray(rows) ? rows : (rows as any).rows ?? [];

  if (alerts.length === 0) return;

  let lastTimestamp = since;

  for (const alert of alerts) {
    try {
      const telegramText = formatTelegramText(alert);
      const discordText = formatAlertText(alert);

      await Promise.allSettled([
        sendTelegram(telegramText),
        sendDiscord(discordText),
      ]);

      lastTimestamp = alert.created_at;
    } catch (err) {
      console.error(`[AlertDispatcher] Failed to dispatch alert ${alert.id}:`, err);
      // Don't advance cursor past failed alert — will retry next cycle
      break;
    }
  }

  // Advance cursor
  if (lastTimestamp !== since) {
    await redis.set(CURSOR_KEY, lastTimestamp);
  }
}

// ─── Worker entry point ───────────────────────────────────

export function startAlertDispatcher(): void {
  const hasTelegram = !!(process.env.OPS_TELEGRAM_BOT_TOKEN && process.env.OPS_TELEGRAM_CHAT_ID);
  const hasDiscord = !!process.env.OPS_DISCORD_WEBHOOK_URL;

  if (!hasTelegram && !hasDiscord) {
    console.log('[AlertDispatcher] Started (no Telegram/Discord token configured — alerts will only be logged to DB)');
  } else {
    const channels: string[] = [];
    if (hasTelegram) channels.push('Telegram');
    if (hasDiscord) channels.push('Discord');
    console.log(`[AlertDispatcher] Started — dispatching to: ${channels.join(', ')}`);
  }

  const reporter = createWorkerReporter('alert-dispatcher');
  const wrappedPoll = withWorkerRecovery('alert-dispatcher', pollAndDispatch, reporter);

  // Initial poll after 5s (let DB connections settle)
  setTimeout(wrappedPoll, 5_000);
  setInterval(wrappedPoll, POLL_INTERVAL);
}
