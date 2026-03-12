import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { users, balances, balanceLedgerEntries } from '@tradingarena/db';
import { AppError } from '../middleware/errorHandler.js';

const sendTipSchema = z.object({
  recipientUsername: z.string().min(1).max(30),
  amount: z.number().int().min(1_000_000, 'Minimum tip is 0.001 SOL (1,000,000 lamports)'),
  message: z.string().max(200).optional(),
});

export async function tipRoutes(server: FastifyInstance) {
  const walletService = new WalletService();

  server.addHook('preHandler', requireAuth);

  // ─── Send Tip ─────────────────────────────────────────────
  server.post('/send', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { recipientUsername, amount, message } = sendTipSchema.parse(request.body);
    const senderId = getAuthUser(request).userId;
    const db = getDb();

    // Look up recipient by username
    const recipient = await db.query.users.findFirst({
      where: eq(users.username, recipientUsername),
    });

    if (!recipient) {
      throw new AppError(404, 'USER_NOT_FOUND', `User "${recipientUsername}" not found`);
    }

    // Cannot tip yourself
    if (recipient.id === senderId) {
      throw new AppError(400, 'SELF_TIP', 'You cannot tip yourself');
    }

    const tipId = crypto.randomUUID();
    const asset = 'SOL';

    // Lock sender funds (deduct from available)
    try {
      await walletService.lockFunds(senderId, amount, asset, {
        type: 'tip',
        id: tipId,
      });
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_BALANCE' || err?.code === 'BALANCE_LOCKED') {
        throw err;
      }
      throw new AppError(400, 'TIP_FAILED', 'Unable to process tip — insufficient balance');
    }

    // Settle: remove from sender's locked, credit to recipient's available
    // Sender side: deduct locked funds (no payout back)
    await db.execute(sql`
      UPDATE balances
      SET locked_amount = locked_amount - ${amount},
          updated_at = now()
      WHERE user_id = ${senderId}
        AND asset = ${asset}
        AND locked_amount >= ${amount}
    `);

    // Credit recipient (upsert to handle missing balance row)
    await db.execute(sql`
      INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
      VALUES (${recipient.id}, ${asset}, ${amount}, 0, 0)
      ON CONFLICT (user_id, asset)
      DO UPDATE SET available_amount = balances.available_amount + ${amount},
                    updated_at = now()
    `);

    // Fetch updated balances for ledger entries
    const senderBal = await db.query.balances.findFirst({
      where: and(eq(balances.userId, senderId), eq(balances.asset, asset)),
    });
    const recipientBal = await db.query.balances.findFirst({
      where: and(eq(balances.userId, recipient.id), eq(balances.asset, asset)),
    });

    // Record ledger: tip_sent for sender
    await db.insert(balanceLedgerEntries).values({
      userId: senderId,
      asset,
      entryType: 'tip_sent',
      amount: -amount,
      balanceAfter: senderBal?.availableAmount ?? 0,
      referenceType: 'tip',
      referenceId: tipId,
      metadata: {
        recipientId: recipient.id,
        recipientUsername: recipient.username,
        message: message || null,
      },
    });

    // Record ledger: tip_received for recipient
    await db.insert(balanceLedgerEntries).values({
      userId: recipient.id,
      asset,
      entryType: 'tip_received',
      amount: amount,
      balanceAfter: recipientBal?.availableAmount ?? 0,
      referenceType: 'tip',
      referenceId: tipId,
      metadata: {
        senderId,
        message: message || null,
      },
    });

    // Publish Redis event for real-time WebSocket notification
    try {
      const redis = getRedis();
      await redis.publish(`user:${recipient.id}:notifications`, JSON.stringify({
        type: 'tip_received',
        tipId,
        amount,
        senderId,
        message: message || null,
        timestamp: Date.now(),
      }));
    } catch {
      // Non-critical — tip still went through
    }

    return {
      success: true,
      amount,
      recipient: recipientUsername,
      tipId,
    };
  });

  // ─── Tip History ──────────────────────────────────────────
  server.get('/history', async (request) => {
    const userId = getAuthUser(request).userId;
    const db = getDb();

    const entries = await db.query.balanceLedgerEntries.findMany({
      where: and(
        eq(balanceLedgerEntries.userId, userId),
        inArray(balanceLedgerEntries.entryType, ['tip_sent', 'tip_received']),
      ),
      orderBy: [desc(balanceLedgerEntries.createdAt)],
      limit: 20,
    });

    return {
      tips: entries.map((e) => ({
        id: String(e.id),
        type: e.entryType,
        amount: String(Math.abs(e.amount)),
        referenceId: e.referenceId,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
