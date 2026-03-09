import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import { users, userProfiles, userSessions, linkedWallets, balances } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface TokenPayload {
  sub: string;
  role: string;
  sid: string;
}

export class AuthService {
  private db = getDb();

  async register(input: RegisterInput) {
    // Check existing
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, input.email),
    });
    if (existing) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
    }

    const existingUsername = await this.db.query.users.findFirst({
      where: eq(users.username, input.username),
    });
    if (existingUsername) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');
    }

    const passwordHash = await argon2.hash(input.password);

    const [user] = await this.db.insert(users).values({
      email: input.email,
      username: input.username,
      passwordHash,
    }).returning();

    // Create profile
    await this.db.insert(userProfiles).values({ userId: user.id });

    // Create initial SOL balance
    await this.db.insert(balances).values({
      userId: user.id,
      asset: 'SOL',
      availableAmount: 0,
      lockedAmount: 0,
      pendingAmount: 0,
    });

    return { userId: user.id };
  }

  async login(input: LoginInput): Promise<{ userId: string; role: string }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user || !user.passwordHash) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    return { userId: user.id, role: user.role };
  }

  async createSession(userId: string, meta: { ip?: string; userAgent?: string; fingerprint?: string }) {
    const refreshToken = nanoid(64);
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const [session] = await this.db.insert(userSessions).values({
      userId,
      refreshTokenHash,
      deviceFingerprint: meta.fingerprint,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    }).returning();

    return { sessionId: session.id, refreshToken };
  }

  async refreshSession(refreshToken: string): Promise<{ userId: string; role: string; sessionId: string } | null> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const session = await this.db.query.userSessions.findFirst({
      where: eq(userSessions.refreshTokenHash, hash),
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    // Rotate token
    const newRefreshToken = nanoid(64);
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await this.db.update(userSessions)
      .set({ refreshTokenHash: newHash })
      .where(eq(userSessions.id, session.id));

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user || user.status !== 'active') return null;

    return { userId: user.id, role: user.role, sessionId: session.id };
  }

  async revokeSession(sessionId: string) {
    await this.db.update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }

  // ─── Wallet Auth ─────────────────────────────────────────

  async createWalletChallenge(address: string) {
    const nonce = nanoid(32);
    const message = `Sign to login to Trading Arena\nAddress: ${address}\nNonce: ${nonce}`;

    // Store nonce in Redis with 60s TTL
    const redis = getRedis();
    await redis.set(`wallet:nonce:${nonce}`, address, 'EX', 60);

    return { nonce, message };
  }

  async verifyWalletSignature(address: string, signature: string, nonce: string) {
    const redis = getRedis();
    const storedAddress = await redis.get(`wallet:nonce:${nonce}`);

    if (!storedAddress || storedAddress !== address) {
      throw new AppError(401, 'INVALID_NONCE', 'Invalid or expired nonce');
    }

    // Delete nonce (one-time use)
    await redis.del(`wallet:nonce:${nonce}`);

    // Verify Ed25519 signature
    const { SolanaService } = await import('../solana/solana.service.js');
    const solanaService = new SolanaService();
    const message = `Sign to login to Trading Arena\nAddress: ${address}\nNonce: ${nonce}`;
    const isValid = solanaService.verifySignature(message, signature, address);
    if (!isValid) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Wallet signature verification failed');
    }

    // Check if wallet is already linked
    const wallet = await this.db.query.linkedWallets.findFirst({
      where: eq(linkedWallets.address, address),
    });

    if (wallet) {
      // Existing user — login
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, wallet.userId),
      });
      if (!user || user.status !== 'active') {
        throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
      }
      return { userId: user.id, role: user.role, isNew: false };
    }

    // New user — register via wallet
    const username = `trader_${nanoid(8)}`;
    const [user] = await this.db.insert(users).values({
      username,
    }).returning();

    await this.db.insert(userProfiles).values({ userId: user.id });
    await this.db.insert(balances).values({
      userId: user.id,
      asset: 'SOL',
    });
    await this.db.insert(linkedWallets).values({
      userId: user.id,
      chain: 'solana',
      address,
      walletType: 'phantom',
      isPrimary: true,
      verifiedAt: new Date(),
    });

    return { userId: user.id, role: user.role, isNew: true };
  }
}
