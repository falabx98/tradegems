import { eq } from 'drizzle-orm';
import { deposits } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { SolanaService } from './solana.service.js';
import { DepositWalletService } from './depositWallet.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

export class DepositService {
  private db = getDb();
  private solanaService = new SolanaService();
  private walletService = new WalletService();
  private depositWalletService = new DepositWalletService();

  async submitDeposit(userId: string, txHash: string) {
    const redis = getRedis();

    // Prevent concurrent processing of same tx
    const lockKey = `lock:deposit:${txHash}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!acquired) {
      throw new AppError(409, 'DEPOSIT_PROCESSING', 'This deposit is already being processed');
    }

    try {
      // Check duplicate
      const existing = await this.db.query.deposits.findFirst({
        where: eq(deposits.txHash, txHash),
      });
      if (existing) {
        return {
          id: existing.id,
          status: existing.status,
          amount: String(existing.amount),
          asset: existing.asset,
        };
      }

      // Get user's deposit wallet address
      const userWalletAddress = await this.depositWalletService.getWalletAddress(userId);

      // Verify on-chain against the user's deposit wallet (or treasury as fallback)
      const verification = await this.solanaService.verifyDepositTransaction(
        txHash,
        userWalletAddress || undefined,
      );

      if (!verification.valid) {
        throw new AppError(400, 'INVALID_DEPOSIT', verification.error || 'Transaction verification failed');
      }

      const requiredConfirmations = env.SOLANA_REQUIRED_CONFIRMATIONS;
      const status = verification.confirmations >= requiredConfirmations ? 'confirmed' : 'confirming';

      // Insert deposit record
      const [deposit] = await this.db.insert(deposits).values({
        userId,
        asset: 'SOL',
        amount: verification.amount,
        txHash,
        fromAddress: verification.from,
        toAddress: verification.to,
        status,
        confirmations: verification.confirmations,
        requiredConfirmations,
        confirmedAt: status === 'confirmed' ? new Date() : undefined,
      }).returning();

      // Credit user balance if confirmed
      if (status === 'confirmed') {
        await this.walletService.creditDeposit(userId, verification.amount, 'SOL', deposit.id);

        // Sweep funds from deposit wallet to treasury (fire-and-forget)
        if (userWalletAddress) {
          this.depositWalletService.sweepToTreasury(userId).catch((err) => {
            console.error(`[Sweep] Failed to sweep for user ${userId}:`, err.message);
          });
        }
      }

      return {
        id: deposit.id,
        status: deposit.status,
        amount: String(deposit.amount),
        asset: deposit.asset,
      };
    } finally {
      await redis.del(lockKey);
    }
  }
}
