import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import crypto from 'node:crypto';
import bs58 from 'bs58';
import { getSolanaConnection, getTreasuryKeypair, getTreasuryAddress } from './treasury.js';
import { getSolanaCircuitBreaker, CircuitOpenError } from '../../utils/circuitBreaker.js';

interface DepositVerification {
  valid: boolean;
  amount: number; // lamports
  from: string;
  to: string;
  confirmations: number;
  error?: string;
}

interface SendResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export class SolanaService {
  private connection: Connection;
  private treasury: Keypair;
  private cb = getSolanaCircuitBreaker();

  constructor() {
    this.connection = getSolanaConnection();
    this.treasury = getTreasuryKeypair();
  }

  /**
   * Verify a deposit transaction on-chain.
   * Protected by circuit breaker with 10s timeout per RPC call.
   */
  async verifyDepositTransaction(txHash: string, targetAddress?: string): Promise<DepositVerification> {
    try {
      // RPC call 1: getTransaction (through circuit breaker)
      const tx = await this.cb.execute(() =>
        this.connection.getTransaction(txHash, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
      );

      if (!tx) {
        return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: 'Transaction not found' };
      }

      if (tx.meta?.err) {
        return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: 'Transaction failed on-chain' };
      }

      const checkAddress = targetAddress || getTreasuryAddress();
      const accountKeys = tx.transaction.message.getAccountKeys();
      const keys: string[] = [];
      for (let i = 0; i < accountKeys.length; i++) {
        keys.push(accountKeys.get(i)!.toBase58());
      }

      const targetIdx = keys.findIndex(k => k === checkAddress);
      if (targetIdx === -1) {
        return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: 'Transaction does not involve expected address' };
      }

      const preBalance = tx.meta!.preBalances[targetIdx];
      const postBalance = tx.meta!.postBalances[targetIdx];
      const amount = postBalance - preBalance;

      if (amount <= 0) {
        return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: 'No SOL received' };
      }

      const from = keys[0];

      // RPC call 2: getSlot (through circuit breaker)
      const currentSlot = await this.cb.execute(() =>
        this.connection.getSlot('confirmed')
      );
      const confirmations = tx.slot ? currentSlot - tx.slot : 0;

      return { valid: true, amount, from, to: checkAddress, confirmations };
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: 'RPC_UNAVAILABLE' };
      }
      return { valid: false, amount: 0, from: '', to: '', confirmations: 0, error: err.message };
    }
  }

  /**
   * Send SOL from treasury to destination.
   * Protected by circuit breaker with 10s timeout.
   */
  async sendSol(destination: string, amountLamports: number): Promise<SendResult> {
    try {
      const destPubkey = new PublicKey(destination);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.treasury.publicKey,
          toPubkey: destPubkey,
          lamports: amountLamports,
        }),
      );

      // RPC call: sendAndConfirmTransaction (through circuit breaker)
      // Note: sendAndConfirmTransaction can take longer than 10s, so we use a 30s timeout
      const txHash = await this.cb.execute(() =>
        sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.treasury],
          { commitment: 'confirmed' },
        )
      );

      return { txHash, success: true };
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        return { txHash: '', success: false, error: 'RPC_UNAVAILABLE' };
      }
      return { txHash: '', success: false, error: err.message };
    }
  }

  verifySignature(message: string, signature: string, publicKey: string): boolean {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(publicKey);

      const ed25519Header = Buffer.from('302a300506032b6570032100', 'hex');
      const derKey = Buffer.concat([ed25519Header, publicKeyBytes]);

      const keyObj = crypto.createPublicKey({
        key: derKey,
        format: 'der',
        type: 'spki',
      });

      return crypto.verify(null, messageBytes, keyObj, signatureBytes);
    } catch {
      return false;
    }
  }

  /**
   * Get treasury balance. Protected by circuit breaker.
   */
  async getTreasuryBalance(): Promise<number> {
    return this.cb.execute(() =>
      this.connection.getBalance(this.treasury.publicKey)
    );
  }
}
