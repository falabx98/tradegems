import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from '@solana/web3.js';
import bs58 from 'bs58';

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window !== 'undefined' && (window as any).phantom?.solana?.isPhantom) {
    return (window as any).phantom.solana as PhantomProvider;
  }
  return null;
}

export function isPhantomInstalled(): boolean {
  return getPhantomProvider() !== null;
}

export async function connectPhantom(): Promise<string> {
  const provider = getPhantomProvider();
  if (!provider) throw new Error('Phantom wallet not installed');
  const resp = await provider.connect();
  return resp.publicKey.toBase58();
}

export async function disconnectPhantom(): Promise<void> {
  const provider = getPhantomProvider();
  if (provider) await provider.disconnect();
}

export async function signMessage(message: string): Promise<string> {
  const provider = getPhantomProvider();
  if (!provider) throw new Error('Phantom wallet not connected');
  const encoded = new TextEncoder().encode(message);
  const { signature } = await provider.signMessage(encoded);
  return bs58.encode(signature);
}

export async function sendSolToTreasury(
  treasuryAddress: string,
  lamports: number,
): Promise<string> {
  const provider = getPhantomProvider();
  if (!provider || !provider.publicKey) throw new Error('Wallet not connected');

  const rpcUrl = (import.meta as any).env?.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
  const connection = new Connection(rpcUrl, 'confirmed');

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: new PublicKey(treasuryAddress),
      lamports,
    }),
  );

  transaction.feePayer = provider.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  const { signature } = await provider.signAndSendTransaction(transaction);
  return signature;
}

export function getConnectedAddress(): string | null {
  const provider = getPhantomProvider();
  if (provider?.publicKey) {
    return provider.publicKey.toBase58();
  }
  return null;
}
