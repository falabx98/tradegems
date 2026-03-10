import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { linkedWallets } from '@tradingarena/db';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { DepositService } from '../modules/solana/deposit.service.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { WithdrawalService } from '../modules/solana/withdrawal.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { getDb } from '../config/database.js';
import { env } from '../config/env.js';

const withdrawSchema = z.object({
  asset: z.literal('SOL'),
  amount: z.string(),
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

  server.post('/deposit/verify', async (request) => {
    const { txHash } = depositVerifySchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    return depositService.submitDeposit(userId, txHash);
  });

  // ─── Withdrawal ───────────────────────────────────────────

  server.post('/withdraw', async (request, reply) => {
    const body = withdrawSchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    const amount = parseInt(body.amount);

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

  // ─── Bonus: Claim new user bonus ────────────────────────

  server.post('/claim-bonus', async (request) => {
    const userId = getAuthUser(request).userId;
    return walletService.claimNewUserBonus(userId);
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

}
