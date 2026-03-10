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
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  PLATFORM_FEE_RATE: z.coerce.number().default(0.03),
  SOLANA_RPC_URL: z.string().default('https://api.devnet.solana.com'),
  SOLANA_CLUSTER: z.string().default('devnet'),
  TREASURY_PRIVATE_KEY: z.string().optional(),
  SOLANA_REQUIRED_CONFIRMATIONS: z.coerce.number().default(1),
  WITHDRAWAL_FEE_LAMPORTS: z.coerce.number().default(5000),
  WALLET_ENCRYPTION_KEY: z.string().optional(), // 32-byte hex key for AES-256-GCM
  DEPOSIT_SWEEP_INTERVAL_MS: z.coerce.number().default(60_000), // 1 min
  DEPOSIT_MIN_SWEEP_LAMPORTS: z.coerce.number().default(5000), // min balance to trigger sweep
  CORS_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
