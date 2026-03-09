import { eq } from 'drizzle-orm';
import { users, userProfiles } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { AppError } from '../../middleware/errorHandler.js';

export class UserService {
  private db = getDb();

  async getProfile(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      role: user.role,
      vipTier: user.vipTier,
      level: user.level,
      xpTotal: user.xpTotal,
      xpCurrent: user.xpCurrent,
      xpToNext: user.xpToNext,
      createdAt: user.createdAt.toISOString(),
      displayName: profile?.displayName,
      avatarUrl: profile?.avatarUrl,
      country: profile?.country,
    };
  }

  async getStats(userId: string) {
    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    return {
      totalWagered: profile.totalWagered,
      totalWon: profile.totalWon,
      roundsPlayed: profile.roundsPlayed,
      bestMultiplier: Number(profile.bestMultiplier),
      winRate: Number(profile.winRate),
      currentStreak: profile.currentStreak,
      bestStreak: profile.bestStreak,
    };
  }

  async updateProfile(userId: string, data: { username?: string; displayName?: string; avatarUrl?: string }) {
    if (data.username) {
      const existing = await this.db.query.users.findFirst({
        where: eq(users.username, data.username),
      });
      if (existing && existing.id !== userId) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');
      }
      await this.db.update(users)
        .set({ username: data.username, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    if (data.displayName !== undefined || data.avatarUrl !== undefined) {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (data.displayName !== undefined) update.displayName = data.displayName;
      if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl;
      await this.db.update(userProfiles)
        .set(update)
        .where(eq(userProfiles.userId, userId));
    }

    return this.getProfile(userId);
  }

  async addXP(userId: string, amount: number, source: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) return;

    let xpCurrent = user.xpCurrent + amount;
    let xpTotal = user.xpTotal + amount;
    let level = user.level;
    let xpToNext = user.xpToNext;

    // Level up loop
    while (xpCurrent >= xpToNext) {
      xpCurrent -= xpToNext;
      level++;
      xpToNext = Math.floor(xpToNext * 1.3);
    }

    // VIP tier based on level
    let vipTier = 'bronze';
    if (level >= 50) vipTier = 'titan';
    else if (level >= 30) vipTier = 'platinum';
    else if (level >= 20) vipTier = 'gold';
    else if (level >= 10) vipTier = 'silver';

    await this.db.update(users).set({
      level,
      xpTotal,
      xpCurrent,
      xpToNext,
      vipTier,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return { level, xpCurrent, xpToNext, vipTier, leveledUp: level > user.level };
  }

  async getProgression(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    // Rakeback rate based on VIP tier
    const rakebackRates: Record<string, number> = {
      bronze: 0.01,
      silver: 0.02,
      gold: 0.03,
      platinum: 0.05,
      titan: 0.08,
    };

    return {
      level: user.level,
      xpCurrent: user.xpCurrent,
      xpToNext: user.xpToNext,
      xpTotal: user.xpTotal,
      vipTier: user.vipTier,
      rakebackRate: rakebackRates[user.vipTier] ?? 0.01,
    };
  }
}
