import { PublicKey } from '@solana/web3.js';
import { eq } from 'drizzle-orm';
import { withdrawals } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { SolanaService } from './solana.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

export class WithdrawalService {
  private db = getDb();
  private solanaService = new SolanaService();
  private walletService = new WalletService();

  async requestWithdrawal(userId: string, amountLamports: number, destination: string) {
    // Validate destination address
    try {
      new PublicKey(destination);
    } catch {
      throw new AppError(400, 'INVALID_ADDRESS', 'Invalid Solana destination address');
    }

    const fee = env.WITHDRAWAL_FEE_LAMPORTS;
    const totalDeduction = amountLamports + fee;

    if (amountLamports < 10_000_000) { // 0.01 SOL minimum
      throw new AppError(400, 'AMOUNT_TOO_LOW', 'Minimum withdrawal is 0.01 SOL');
    }

    const redis = getRedis();
    const lockKey = `lock:withdrawal:${userId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!acquired) {
      throw new AppError(409, 'WITHDRAWAL_IN_PROGRESS', 'A withdrawal is already being processed');
    }

    try {
      // Lock funds (amount + fee)
      await this.walletService.lockFunds(userId, totalDeduction, 'SOL', {
        type: 'withdrawal',
        id: 'pending',
      });

      // Insert withdrawal record
      const [withdrawal] = await this.db.insert(withdrawals).values({
        userId,
        asset: 'SOL',
        amount: amountLamports,
        fee,
        destination,
        status: 'processing',
      }).returning();

      // Send SOL on-chain
      const result = await this.solanaService.sendSol(destination, amountLamports);

      if (result.success) {
        // Update withdrawal with tx hash
        await this.db.update(withdrawals)
          .set({
            txHash: result.txHash,
            status: 'confirmed',
            completedAt: new Date(),
          })
          .where(eq(withdrawals.id, withdrawal.id));

        // Settle: deduct from locked balance
        await this.walletService.settleWithdrawal(userId, totalDeduction, 'SOL', withdrawal.id);

        return {
          id: withdrawal.id,
          status: 'confirmed',
          amount: String(amountLamports),
          fee: String(fee),
          txHash: result.txHash,
          asset: 'SOL',
        };
      } else {
        // Failed — release locked funds
        await this.walletService.releaseFunds(userId, totalDeduction, 'SOL', {
          type: 'withdrawal',
          id: withdrawal.id,
        });

        await this.db.update(withdrawals)
          .set({ status: 'failed' })
          .where(eq(withdrawals.id, withdrawal.id));

        throw new AppError(500, 'WITHDRAWAL_FAILED', result.error || 'Failed to send SOL');
      }
    } finally {
      await redis.del(lockKey);
    }
  }
}
