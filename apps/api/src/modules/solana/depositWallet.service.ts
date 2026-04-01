import { eq } from 'drizzle-orm';
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { userDepositWallets } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getSolanaConnection, getTreasuryKeypair } from './treasury.js';
import { encryptPrivateKey, decryptPrivateKey } from './encryption.js';
import { getSolanaCircuitBreaker } from '../../utils/circuitBreaker.js';

export class DepositWalletService {
  private db = getDb();

  /**
   * Get or create a unique deposit wallet for a user.
   * Each user gets exactly one deposit address.
   */
  async getOrCreateDepositWallet(userId: string): Promise<{ address: string }> {
    // Check for existing wallet
    const existing = await this.db.query.userDepositWallets.findFirst({
      where: eq(userDepositWallets.userId, userId),
    });

    if (existing) {
      return { address: existing.address };
    }

    // Generate a new Solana keypair
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const secretKeyBase58 = bs58.encode(keypair.secretKey);

    // Encrypt the private key
    const { encrypted, iv, authTag } = encryptPrivateKey(secretKeyBase58);

    // Store in DB
    await this.db.insert(userDepositWallets).values({
      userId,
      address,
      encryptedPrivateKey: encrypted,
      iv,
      authTag,
    });

    return { address };
  }

  /**
   * Sweep funds from a user's deposit wallet to the treasury.
   * Returns the sweep tx hash or null if nothing to sweep.
   */
  async sweepToTreasury(userId: string): Promise<string | null> {
    const wallet = await this.db.query.userDepositWallets.findFirst({
      where: eq(userDepositWallets.userId, userId),
    });

    if (!wallet) return null;

    const connection = getSolanaConnection();
    const treasuryKeypair = getTreasuryKeypair();

    // Decrypt the private key
    const secretKeyBase58 = decryptPrivateKey(
      wallet.encryptedPrivateKey,
      wallet.iv,
      wallet.authTag,
    );
    const depositKeypair = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));

    // Check balance (through circuit breaker)
    const cb = getSolanaCircuitBreaker();
    const balance = await cb.execute(() => connection.getBalance(depositKeypair.publicKey));

    // Need enough to cover rent + tx fee (5000 lamports fee minimum)
    const fee = 5000;
    const sweepAmount = balance - fee;

    if (sweepAmount <= 0) return null;

    // Transfer all available funds to treasury
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: depositKeypair.publicKey,
        toPubkey: treasuryKeypair.publicKey,
        lamports: sweepAmount,
      }),
    );

    const txHash = await cb.execute(() => sendAndConfirmTransaction(
      connection,
      transaction,
      [depositKeypair],
      { commitment: 'confirmed' },
    ));

    // Update last swept timestamp
    await this.db.update(userDepositWallets).set({
      lastSweptAt: new Date(),
    }).where(eq(userDepositWallets.userId, userId));

    return txHash;
  }

  /**
   * Get the deposit wallet address for a user (read-only).
   */
  async getWalletAddress(userId: string): Promise<string | null> {
    const wallet = await this.db.query.userDepositWallets.findFirst({
      where: eq(userDepositWallets.userId, userId),
    });
    return wallet?.address ?? null;
  }

  /**
   * Get the balance of a user's deposit wallet on-chain.
   */
  async getWalletBalance(address: string): Promise<number> {
    const connection = getSolanaConnection();
    const cb = getSolanaCircuitBreaker();
    return cb.execute(() => connection.getBalance(new PublicKey(address)));
  }
}
