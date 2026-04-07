import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  PLATFORM_FEE_RATE: z.coerce.number().default(0.05),
  SOLANA_RPC_URL: z.string().default('https://api.mainnet-beta.solana.com'),
  SOLANA_CLUSTER: z.string().default('mainnet-beta'),
  TREASURY_PRIVATE_KEY: z.string().min(60, 'TREASURY_PRIVATE_KEY must be a valid base58 Solana keypair').optional(),
  SOLANA_REQUIRED_CONFIRMATIONS: z.coerce.number().default(3),
  WITHDRAWAL_FEE_LAMPORTS: z.coerce.number().default(5000),
  WALLET_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/, 'WALLET_ENCRYPTION_KEY must be a 64-char hex string (256-bit AES key)').optional(),
  DEPOSIT_SWEEP_INTERVAL_MS: z.coerce.number().default(60_000), // 1 min
  DEPOSIT_MIN_SWEEP_LAMPORTS: z.coerce.number().default(5000), // min balance to trigger sweep
  CORS_ORIGINS: z.string().optional(),
  ADMIN_SETUP_KEY: z.string().optional(),

  // Bet caps (in lamports). Defaults are conservative.
  MAX_BET_LAMPORTS: z.coerce.number().default(100_000_000_000),        // 100 SOL max per single bet
  MAX_USER_LOCKED_LAMPORTS: z.coerce.number().default(500_000_000_000), // 500 SOL max total locked per user

  // Rug Game guardrails (bootstrap phase — adjust without redeploy)
  RUG_HOUSE_EDGE: z.coerce.number().min(0).max(0.25).default(0.05),
  RUG_MAX_BET_LAMPORTS: z.coerce.number().default(500_000_000),              // 0.5 SOL
  RUG_MAX_PAYOUT_LAMPORTS: z.coerce.number().default(50_000_000_000),        // 50 SOL
  RUG_MAX_ROUND_EXPOSURE_LAMPORTS: z.coerce.number().default(100_000_000_000), // 100 SOL
  RUG_MAX_MULTIPLIER: z.coerce.number().min(2).default(100),                 // 100x cap
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

// Production-only strict validation
if (parsed.data.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!parsed.data.TREASURY_PRIVATE_KEY) missing.push('TREASURY_PRIVATE_KEY');
  if (!parsed.data.WALLET_ENCRYPTION_KEY) missing.push('WALLET_ENCRYPTION_KEY');
  if (parsed.data.SOLANA_CLUSTER === 'devnet') {
    console.warn('[ENV] WARNING: SOLANA_CLUSTER is set to devnet in production — ensure this is intentional for testing');
  }
  if (missing.length > 0) {
    console.error(`[ENV] FATAL: Missing required production variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
