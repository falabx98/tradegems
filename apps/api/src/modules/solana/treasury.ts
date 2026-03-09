import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../../config/env.js';

let connection: Connection;
let treasuryKeypair: Keypair;

export function getSolanaConnection(): Connection {
  if (!connection) {
    const rpcUrl = env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER as any);
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

export function getTreasuryKeypair(): Keypair {
  if (!treasuryKeypair) {
    if (!env.TREASURY_PRIVATE_KEY) {
      treasuryKeypair = Keypair.generate();
      console.warn('[Treasury] No TREASURY_PRIVATE_KEY set, using ephemeral keypair:', treasuryKeypair.publicKey.toBase58());
    } else {
      const secret = bs58.decode(env.TREASURY_PRIVATE_KEY);
      treasuryKeypair = Keypair.fromSecretKey(secret);
    }
    console.log('[Treasury] Address:', treasuryKeypair.publicKey.toBase58());
  }
  return treasuryKeypair;
}

export function getTreasuryAddress(): string {
  return getTreasuryKeypair().publicKey.toBase58();
}
