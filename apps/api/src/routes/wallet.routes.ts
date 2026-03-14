import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { linkedWallets, bonusCodes, bonusCodeRedemptions, balances, balanceLedgerEntries, users } from '@tradingarena/db';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { DepositService } from '../modules/solana/deposit.service.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { WithdrawalService } from '../modules/solana/withdrawal.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { getDb } from '../config/database.js';
import { env } from '../config/env.js';

const withdrawSchema = z.object({
  asset: z.literal('SOL'),
  amount: z.union([
    z.number().int().positive(),
    z.string().transform((v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n <= 0) throw new Error('Amount must be a positive integer');
      return n;
    }),
  ]),
  destination: z.string().min(32).max(64),
});

const depositVerifySchema = z.object({
  txHash: z.string().min(64).max(128),
});

const linkWalletSchema = z.object({
  address: z.string().min(32).max(64),
});

export async function walletRoutes(server: FastifyInstance) {
  const walletService = new WalletService();
  const depositService = new DepositService();
  const depositWalletService = new DepositWalletService();
  const withdrawalService = new WithdrawalService();

  server.addHook('preHandler', requireAuth);

  server.get('/balances', async (request) => {
    return walletService.getBalances(getAuthUser(request).userId);
  });

  server.get('/transactions', async (request) => {
    const { limit, cursor } = request.query as { limit?: string; cursor?: string };
    return walletService.getTransactions(
      getAuthUser(request).userId,
      limit ? parseInt(limit) : 20,
      cursor,
    );
  });

  server.get('/linked', async (request) => {
    return walletService.getLinkedWallets(getAuthUser(request).userId);
  });

  // ─── P&L History ──────────────────────────────────────────
  server.get('/pnl-history', async (request) => {
    const userId = getAuthUser(request).userId;
    const db = getDb();
    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', ${balanceLedgerEntries.createdAt})::text`,
        balance: sql<number>`max(${balanceLedgerEntries.balanceAfter})`,
      })
      .from(balanceLedgerEntries)
      .where(eq(balanceLedgerEntries.userId, userId))
      .groupBy(sql`date_trunc('day', ${balanceLedgerEntries.createdAt})`)
      .orderBy(sql`date_trunc('day', ${balanceLedgerEntries.createdAt})`);
    return { data: rows };
  });

  // ─── Deposit ──────────────────────────────────────────────

  server.get('/deposit/:asset', async (request) => {
    const { asset } = request.params as { asset: string };
    if (asset !== 'SOL') {
      return { error: 'Only SOL deposits are supported' };
    }
    const userId = getAuthUser(request).userId;
    const { address } = await depositWalletService.getOrCreateDepositWallet(userId);
    return {
      asset: 'SOL',
      address,
      minimumAmount: '10000000', // 0.01 SOL
      requiredConfirmations: env.SOLANA_REQUIRED_CONFIRMATIONS,
    };
  });

  server.post('/deposit/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const { txHash } = depositVerifySchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    return depositService.submitDeposit(userId, txHash);
  });

  // ─── Withdrawal ───────────────────────────────────────────

  server.post('/withdraw', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = withdrawSchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    const amount = typeof body.amount === 'number' ? body.amount : parseInt(String(body.amount), 10);
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive integer' } });
    }

    // Check bonus withdrawal restriction
    const eligibility = await walletService.checkWithdrawalEligibility(userId, amount);
    if (!eligibility.eligible) {
      return reply.status(400).send({
        error: {
          code: 'BONUS_LOCKED',
          message: eligibility.reason || 'Withdrawal restricted',
          maxWithdrawable: String(eligibility.maxWithdrawable),
        },
      });
    }

    // Ensure treasury is configured for on-chain withdrawals
    if (!env.TREASURY_PRIVATE_KEY) {
      return reply.status(503).send({
        error: {
          code: 'WITHDRAWALS_UNAVAILABLE',
          message: 'Withdrawals are temporarily unavailable. Please try again later.',
        },
      });
    }

    return withdrawalService.requestWithdrawal(
      userId,
      amount,
      body.destination,
    );
  });

  // ─── Bonus: Get bonus status ────────────────────────────

  server.get('/bonus-status', async (request) => {
    const userId = getAuthUser(request).userId;
    return walletService.getBonusStatus(userId);
  });

  // ─── Link Wallet ──────────────────────────────────────────

  server.post('/link-wallet', async (request) => {
    const { address } = linkWalletSchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    const db = getDb();

    const existing = await db.query.linkedWallets.findFirst({
      where: eq(linkedWallets.address, address),
    });
    if (existing) {
      if (existing.userId === userId) {
        return { message: 'Wallet already linked', address };
      }
      return { error: 'This wallet is linked to another account' };
    }

    await db.insert(linkedWallets).values({
      userId,
      chain: 'solana',
      address,
      walletType: 'phantom',
      isPrimary: true,
      verifiedAt: new Date(),
    });

    return { message: 'Wallet linked successfully', address };
  });

  // ─── Bonus: Redeem bonus code ──────────────────────────

  server.post('/redeem-code', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1).max(30).trim() }).parse(request.body);
    const userId = getAuthUser(request).userId;
    const db = getDb();

    // 1. Find the bonus code
    const bonusCode = await db.query.bonusCodes.findFirst({
      where: eq(bonusCodes.code, code.toUpperCase().trim()),
    });

    if (!bonusCode || !bonusCode.active) {
      return reply.status(400).send({
        error: { code: 'INVALID_CODE', message: 'Invalid or inactive bonus code' },
      });
    }

    // 2. Check expiration
    if (bonusCode.expiresAt && bonusCode.expiresAt < new Date()) {
      return reply.status(400).send({
        error: { code: 'CODE_EXPIRED', message: 'This bonus code has expired' },
      });
    }

    // 3. Check max uses
    if (bonusCode.usedCount >= bonusCode.maxUses) {
      return reply.status(400).send({
        error: { code: 'CODE_EXHAUSTED', message: 'This bonus code has reached its maximum number of uses' },
      });
    }

    // 4. Check per-user limit
    const [userRedemptions] = await db
      .select({ total: count() })
      .from(bonusCodeRedemptions)
      .where(and(eq(bonusCodeRedemptions.bonusCodeId, bonusCode.id), eq(bonusCodeRedemptions.userId, userId)));

    if ((userRedemptions?.total ?? 0) >= bonusCode.maxPerUser) {
      return reply.status(400).send({
        error: { code: 'ALREADY_REDEEMED', message: 'You have already redeemed this bonus code' },
      });
    }

    // 5. Check user level
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const userLevel = (user as unknown as { level?: number })?.level ?? 1;
    if (userLevel < bonusCode.minLevel) {
      return reply.status(400).send({
        error: { code: 'LEVEL_TOO_LOW', message: `You must be at least level ${bonusCode.minLevel} to redeem this code` },
      });
    }

    // 6. Validate amount is reasonable
    if (bonusCode.amountLamports <= 0 || bonusCode.amountLamports > 100_000_000_000) {
      return reply.status(400).send({
        error: { code: 'INVALID_CODE', message: 'Invalid bonus code amount' },
      });
    }

    // 7. Atomic: increment usedCount with WHERE guard (prevents race condition)
    const [updated] = await db.update(bonusCodes).set({
      usedCount: sql`${bonusCodes.usedCount} + 1`,
    }).where(and(
      eq(bonusCodes.id, bonusCode.id),
      sql`${bonusCodes.usedCount} < ${bonusCodes.maxUses}`,
    )).returning();

    if (!updated) {
      return reply.status(400).send({
        error: { code: 'CODE_EXHAUSTED', message: 'This bonus code has reached its maximum number of uses' },
      });
    }

    // 8. Credit balance atomically using SQL increment
    const [existing] = await db.select().from(balances).where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL')));

    if (existing) {
      await db.update(balances).set({
        availableAmount: sql`${balances.availableAmount} + ${bonusCode.amountLamports}`,
        updatedAt: new Date(),
      }).where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL')));
    } else {
      await db.insert(balances).values({
        userId,
        asset: 'SOL',
        availableAmount: bonusCode.amountLamports,
        updatedAt: new Date(),
      });
    }

    // 9. Create ledger entry
    const newBalance = (existing?.availableAmount ?? 0) + bonusCode.amountLamports;
    await db.insert(balanceLedgerEntries).values({
      userId,
      asset: 'SOL',
      entryType: 'bonus_code_redemption',
      amount: bonusCode.amountLamports,
      balanceAfter: newBalance,
      referenceType: 'bonus_code',
      referenceId: bonusCode.id,
      metadata: { code: bonusCode.code },
    });

    // 10. Insert redemption record
    await db.insert(bonusCodeRedemptions).values({
      bonusCodeId: bonusCode.id,
      userId,
      amountLamports: bonusCode.amountLamports,
    });

    return {
      success: true,
      message: `Redeemed ${bonusCode.code} for bonus SOL`,
      amount: bonusCode.amountLamports,
    };
  });

}
