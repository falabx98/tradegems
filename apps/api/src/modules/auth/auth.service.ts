import { eq, or, ilike } from 'drizzle-orm';
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
  email: string; // Can be email OR username
  password: string;
}

interface TokenPayload {
  sub: string;
  role: string;
  sid: string;
}

// 20 default avatar images in /public/avatars/
const AVATAR_POOL = Array.from({ length: 20 }, (_, i) => {
  const names = [
    'emerald', 'ruby', 'sapphire', 'diamond', 'amethyst',
    'topaz', 'opal', 'turquoise', 'citrine', 'garnet',
    'jade', 'obsidian', 'lapis', 'rose_quartz', 'peridot',
    'tanzanite', 'amber', 'malachite', 'tiger_eye', 'alexandrite',
  ];
  return `/avatars/pepe_${String(i + 1).padStart(2, '0')}_${names[i]}.png`;
});

function randomAvatar(): string {
  return AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)];
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

    // Create profile with random avatar
    await this.db.insert(userProfiles).values({ userId: user.id, avatarUrl: randomAvatar() });

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
    // Allow login by email OR username (case-insensitive)
    const identifier = input.email.trim();
    const isEmail = identifier.includes('@');

    const user = await this.db.query.users.findFirst({
      where: isEmail
        ? ilike(users.email, identifier)
        : ilike(users.username, identifier),
    });

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email/username or password');
    }

    if (!user.passwordHash) {
      throw new AppError(401, 'WALLET_ONLY', 'This account was created with a wallet. Please sign in using Phantom wallet, or set a password in Settings.');
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email/username or password');
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

  async refreshSession(refreshToken: string): Promise<{ userId: string; role: string; sessionId: string; newRefreshToken: string } | null> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const session = await this.db.query.userSessions.findFirst({
      where: eq(userSessions.refreshTokenHash, hash),
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    // Rotate token — return the new token so the route handler can set the cookie
    const newRefreshToken = nanoid(64);
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await this.db.update(userSessions)
      .set({ refreshTokenHash: newHash })
      .where(eq(userSessions.id, session.id));

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user || user.status !== 'active') return null;

    return { userId: user.id, role: user.role, sessionId: session.id, newRefreshToken };
  }

  async revokeSession(sessionId: string) {
    await this.db.update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.id, sessionId));

    // H2: Immediately mark as revoked in Redis cache for fast auth checks
    try {
      const redis = getRedis();
      await redis.set(`revoked:session:${sessionId}`, '1', 'EX', 300);
    } catch {
      // Non-critical — auth middleware will check DB on cache miss
    }
  }

  // ─── Set password for wallet-only users ─────────────────

  async setPassword(userId: string, data: { email?: string; password: string }) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    // If providing email, check it's not taken
    if (data.email) {
      const emailTaken = await this.db.query.users.findFirst({
        where: eq(users.email, data.email),
      });
      if (emailTaken && emailTaken.id !== userId) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
      }
    }

    const passwordHash = await argon2.hash(data.password);

    const updatePayload: Record<string, unknown> = { passwordHash };
    if (data.email) updatePayload.email = data.email;

    await this.db.update(users)
      .set(updatePayload)
      .where(eq(users.id, userId));

    return { success: true };
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

    await this.db.insert(userProfiles).values({ userId: user.id, avatarUrl: randomAvatar() });
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
