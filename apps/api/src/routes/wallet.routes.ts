import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { linkedWallets, bonusCodes, bonusCodeRedemptions, balances, balanceLedgerEntries, users, bonusWagerProgress, pendingDepositMatches, deposits } from '@tradingarena/db';
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
  address: z.string().min(32).max(64).regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format'),
  signature: z.string().min(64).max(256), // Required: wallet ownership must be cryptographically verified
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
    const eligibility = await walletService.checkWithdrawalEligibility(userId, 'SOL');
    if (!eligibility.eligible) {
      return reply.status(400).send({
        error: {
          code: 'BONUS_LOCKED',
          message: eligibility.reason || 'Withdrawal restricted',
          availableToWithdraw: String(eligibility.availableToWithdraw),
        },
      });
    }

    // Check sponsored balance withdrawal limits
    try {
      const { SponsoredService } = await import('../modules/sponsored/sponsored.service.js');
      const sponsoredCheck = await SponsoredService.checkWithdrawalAllowed(userId, amount);
      if (!sponsoredCheck.allowed) {
        return reply.status(400).send({
          error: {
            code: 'SPONSORED_LIMIT',
            message: sponsoredCheck.message,
            maxAllowed: sponsoredCheck.maxAllowed,
          },
        });
      }
      // Record the withdrawal against sponsored tracking
      if (sponsoredCheck.maxAllowed !== Infinity) {
        await SponsoredService.recordWithdrawal(userId, amount);
      }
    } catch (err: any) {
      if (err?.code === 'SPONSORED_LIMIT') throw err;
      // Non-sponsored check errors: log but don't block
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

    // 5. Check start date
    if (bonusCode.startsAt && bonusCode.startsAt > new Date()) {
      return reply.status(400).send({
        error: { code: 'NOT_STARTED', message: 'This bonus code is not active yet' },
      });
    }

    // 6. Check user level
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const userLevel = (user as unknown as { level?: number })?.level ?? 1;
    if (userLevel < bonusCode.minLevel) {
      return reply.status(400).send({
        error: { code: 'LEVEL_TOO_LOW', message: `You must be at least level ${bonusCode.minLevel} to redeem this code` },
      });
    }

    // 7. Check min deposits
    if (bonusCode.minDeposits > 0) {
      const [depCount] = await db.select({ total: count() }).from(deposits)
        .where(and(eq(deposits.userId, userId), eq(deposits.status, 'confirmed')));
      if ((depCount?.total ?? 0) < bonusCode.minDeposits) {
        return reply.status(400).send({
          error: { code: 'NOT_ENOUGH_DEPOSITS', message: `You need at least ${bonusCode.minDeposits} deposits to use this code` },
        });
      }
    }

    // 8. Check first deposit only
    if (bonusCode.firstDepositOnly) {
      const [depCount] = await db.select({ total: count() }).from(deposits)
        .where(and(eq(deposits.userId, userId), eq(deposits.status, 'confirmed')));
      if ((depCount?.total ?? 0) > 0) {
        return reply.status(400).send({
          error: { code: 'NOT_FIRST_DEPOSIT', message: 'This code is only for users who haven\'t deposited yet' },
        });
      }
    }

    // 9. Validate amount is reasonable (for free_credit type)
    if (bonusCode.type === 'free_credit' && (bonusCode.amountLamports <= 0 || bonusCode.amountLamports > 100_000_000_000)) {
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

    // 8. Insert redemption record FIRST (unique constraint prevents double-redemption)
    //    This MUST happen before crediting balance to avoid double-credit on race condition
    try {
      await db.insert(bonusCodeRedemptions).values({
        bonusCodeId: bonusCode.id,
        userId,
        amountLamports: bonusCode.amountLamports,
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate')) {
        // Duplicate: user already redeemed — do NOT credit balance, return early
        return reply.status(400).send({
          error: { code: 'ALREADY_REDEEMED', message: 'You have already redeemed this bonus code' },
        });
      }
      throw err;
    }

    // ─── Handle by bonus type ────────────────────────────────

    if (bonusCode.type === 'deposit_match') {
      // Store as pending deposit match — will be applied when user makes next deposit
      await db.insert(pendingDepositMatches).values({
        userId,
        bonusCodeId: bonusCode.id,
        matchPercentage: bonusCode.matchPercentage || 100,
        maxMatchLamports: bonusCode.maxMatchLamports || 0,
      });

      return {
        success: true,
        message: `Deposit match activated! Your next deposit will be matched ${bonusCode.matchPercentage || 100}% up to ${(bonusCode.maxMatchLamports || 0) / 1e9} SOL`,
        amount: 0,
        type: 'deposit_match',
        matchPercentage: bonusCode.matchPercentage,
        maxMatch: bonusCode.maxMatchLamports,
      };
    }

    // Default: free_credit — credit balance immediately
    const creditAmount = bonusCode.amountLamports;

    const [existing] = await db.select().from(balances).where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL')));

    let newBalance: number;
    if (existing) {
      const [updatedBal] = await db.update(balances).set({
        availableAmount: sql`${balances.availableAmount} + ${creditAmount}`,
        updatedAt: new Date(),
      }).where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL'))).returning({ availableAmount: balances.availableAmount });
      newBalance = Number(updatedBal?.availableAmount ?? 0);
    } else {
      await db.insert(balances).values({
        userId,
        asset: 'SOL',
        availableAmount: creditAmount,
        updatedAt: new Date(),
      });
      newBalance = creditAmount;
    }

    // Ledger entry
    await db.insert(balanceLedgerEntries).values({
      userId,
      asset: 'SOL',
      entryType: 'bonus_code_redemption',
      amount: creditAmount,
      balanceAfter: newBalance,
      referenceType: 'bonus_code',
      referenceId: bonusCode.id,
      metadata: { code: bonusCode.code, type: bonusCode.type },
    });

    // Create wager requirement if applicable
    if (bonusCode.wagerMultiplier > 0) {
      const wagerRequired = creditAmount * bonusCode.wagerMultiplier;
      await db.insert(bonusWagerProgress).values({
        userId,
        bonusCodeId: bonusCode.id,
        bonusAmountLamports: creditAmount,
        wagerRequiredLamports: wagerRequired,
      });
    }

    const wagerInfo = bonusCode.wagerMultiplier > 0
      ? ` Complete ${bonusCode.wagerMultiplier}x wagering (${(creditAmount * bonusCode.wagerMultiplier / 1e9).toFixed(2)} SOL) to unlock withdrawals.`
      : '';

    return {
      success: true,
      message: `Redeemed ${bonusCode.code}! +${(creditAmount / 1e9).toFixed(4)} SOL credited.${wagerInfo}`,
      amount: creditAmount,
      type: bonusCode.type,
      wagerMultiplier: bonusCode.wagerMultiplier,
      wagerRequired: bonusCode.wagerMultiplier > 0 ? creditAmount * bonusCode.wagerMultiplier : 0,
    };
  });

  // ─── Bonus Wager Status ────────────────────────────────────

  server.get('/bonus-wager', { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuthUser(request);
    const db = getDb();

    const progress = await db.select().from(bonusWagerProgress)
      .where(and(eq(bonusWagerProgress.userId, userId), eq(bonusWagerProgress.fulfilled, false)));

    if (progress.length === 0) return { data: null };

    // Return the most recent unfulfilled wager
    const active = progress[0];
    return {
      data: {
        bonusAmount: active.bonusAmountLamports,
        wagerRequired: active.wagerRequiredLamports,
        wagerCompleted: active.wagerCompletedLamports,
        percentage: active.wagerRequiredLamports > 0
          ? Math.min(100, Math.floor((active.wagerCompletedLamports / active.wagerRequiredLamports) * 100))
          : 100,
        fulfilled: active.fulfilled,
      },
    };
  });

  // ─── Active Deposits Status (for real-time polling) ────────

  server.get('/deposits/active', { preHandler: [requireAuth] }, async (request) => {
    const { userId } = getAuthUser(request);
    const db = getDb();
    const { deposits } = await import('@tradingarena/db');

    // Get all non-final deposits (confirming state) ordered by newest first
    const activeDeposits = await db
      .select({
        id: deposits.id,
        status: deposits.status,
        amount: deposits.amount,
        txHash: deposits.txHash,
        confirmations: deposits.confirmations,
        requiredConfirmations: deposits.requiredConfirmations,
        confirmedAt: deposits.confirmedAt,
        createdAt: deposits.createdAt,
      })
      .from(deposits)
      .where(and(
        eq(deposits.userId, userId),
        sql`${deposits.status} IN ('confirming', 'pending')`,
      ))
      .orderBy(desc(deposits.createdAt))
      .limit(5);

    // Also get the most recent confirmed deposit (for success feedback)
    const recentConfirmed = await db
      .select({
        id: deposits.id,
        status: deposits.status,
        amount: deposits.amount,
        txHash: deposits.txHash,
        confirmedAt: deposits.confirmedAt,
      })
      .from(deposits)
      .where(and(
        eq(deposits.userId, userId),
        eq(deposits.status, 'confirmed'),
      ))
      .orderBy(desc(deposits.confirmedAt))
      .limit(1);

    return {
      active: activeDeposits.map(d => ({
        id: d.id,
        status: d.status,
        amount: String(d.amount),
        txHash: d.txHash,
        confirmations: d.confirmations,
        requiredConfirmations: d.requiredConfirmations,
        confirmedAt: d.confirmedAt?.toISOString() || null,
        createdAt: d.createdAt.toISOString(),
      })),
      lastConfirmed: recentConfirmed[0] ? {
        id: recentConfirmed[0].id,
        amount: String(recentConfirmed[0].amount),
        txHash: recentConfirmed[0].txHash,
        confirmedAt: recentConfirmed[0].confirmedAt?.toISOString() || null,
      } : null,
    };
  });

  // ═══════════════════════════════════════════════════════════
  //  USER-TO-USER TIPS
  // ═══════════════════════════════════════════════════════════

  const tipSchema = z.object({
    toUsername: z.string().min(1).max(50).trim(),
    amount: z.number().int().positive().max(100_000_000_000), // max 100 SOL
  });

  server.post('/tip', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { toUsername, amount } = tipSchema.parse(request.body);
    const senderId = getAuthUser(request).userId;
    const db = getDb();

    // Min 0.001 SOL
    if (amount < 1_000_000) {
      return reply.status(400).send({ error: { message: 'Minimum tip is 0.001 SOL' } });
    }

    // Find receiver
    const receiver = await db.query.users.findFirst({
      where: eq(users.username, toUsername),
    });
    if (!receiver) {
      return reply.status(400).send({ error: { message: 'User not found' } });
    }
    if (receiver.id === senderId) {
      return reply.status(400).send({ error: { message: 'Cannot tip yourself' } });
    }

    // Atomic transfer
    const result = await db.transaction(async (tx) => {
      // Lock sender balance
      const [sender] = await tx.select().from(balances)
        .where(and(eq(balances.userId, senderId), eq(balances.asset, 'SOL')))
        .for('update');

      if (!sender || sender.availableAmount < amount) {
        throw new Error('Insufficient balance');
      }

      // Deduct from sender
      await tx.update(balances).set({
        availableAmount: sql`${balances.availableAmount} - ${amount}`,
        updatedAt: new Date(),
      }).where(and(eq(balances.userId, senderId), eq(balances.asset, 'SOL')));

      // Credit to receiver (upsert)
      const [existingRx] = await tx.select().from(balances)
        .where(and(eq(balances.userId, receiver.id), eq(balances.asset, 'SOL')));

      let rxNewBalance: number;
      if (existingRx) {
        const [upd] = await tx.update(balances).set({
          availableAmount: sql`${balances.availableAmount} + ${amount}`,
          updatedAt: new Date(),
        }).where(and(eq(balances.userId, receiver.id), eq(balances.asset, 'SOL')))
          .returning({ availableAmount: balances.availableAmount });
        rxNewBalance = Number(upd.availableAmount);
      } else {
        const [ins] = await tx.insert(balances).values({
          userId: receiver.id,
          asset: 'SOL',
          availableAmount: amount,
          updatedAt: new Date(),
        }).returning({ availableAmount: balances.availableAmount });
        rxNewBalance = Number(ins.availableAmount);
      }

      const senderNewBalance = Number(sender.availableAmount) - amount;

      // Ledger entries
      const refId = `tip_${Date.now()}`;
      await tx.insert(balanceLedgerEntries).values([
        {
          userId: senderId,
          asset: 'SOL',
          entryType: 'tip_sent',
          amount: -amount,
          balanceAfter: senderNewBalance,
          referenceType: 'tip',
          referenceId: refId,
          metadata: { toUsername, toUserId: receiver.id },
        },
        {
          userId: receiver.id,
          asset: 'SOL',
          entryType: 'tip_received',
          amount,
          balanceAfter: rxNewBalance,
          referenceType: 'tip',
          referenceId: refId,
          metadata: { fromUserId: senderId },
        },
      ]);

      return { senderNewBalance };
    });

    return { success: true, amount, toUsername, newBalance: result.senderNewBalance };
  });

}
