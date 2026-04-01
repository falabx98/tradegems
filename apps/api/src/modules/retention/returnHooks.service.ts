/**
 * Return Hooks Service — Streak tracking + personalized return hooks.
 *
 * Handles:
 * 1. Daily play streak tracking (consecutive days)
 * 2. Return hooks computation (what to show returning users in the lobby)
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { users, userProfiles } from '@tradingarena/db';

// ─── Streak Rewards ─────────────────────────────────────────

interface StreakReward {
  days: number;
  xpBonus: number; // percentage multiplier (10 = +10%)
  solReward: number; // lamports (0 = no SOL reward)
  label: string;
}

const STREAK_REWARDS: StreakReward[] = [
  { days: 2,  xpBonus: 10,  solReward: 0,           label: '+10% XP bonus' },
  { days: 3,  xpBonus: 20,  solReward: 1_000_000,   label: '+20% XP + 0.001 SOL' },
  { days: 5,  xpBonus: 50,  solReward: 5_000_000,   label: '+50% XP + 0.005 SOL' },
  { days: 7,  xpBonus: 100, solReward: 10_000_000,  label: '+100% XP + 0.01 SOL' },
];

function getStreakReward(streak: number): StreakReward | null {
  // Return the highest applicable reward
  for (let i = STREAK_REWARDS.length - 1; i >= 0; i--) {
    if (streak >= STREAK_REWARDS[i].days) return STREAK_REWARDS[i];
  }
  return null;
}

function getNextStreakReward(streak: number): StreakReward | null {
  for (const r of STREAK_REWARDS) {
    if (streak < r.days) return r;
  }
  return null;
}

// ─── Date Helpers ───────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Service ────────────────────────────────────────────────

export class ReturnHooksService {
  private db = getDb();

  /**
   * Record that the user played today. Updates daily streak.
   * Called after each settlement.
   */
  async recordPlay(userId: string): Promise<{ dailyStreak: number; isNewDay: boolean }> {
    const today = todayUTC();
    const yesterday = yesterdayUTC();

    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });
    if (!profile) return { dailyStreak: 0, isNewDay: false };

    const lastPlayed = profile.lastPlayedDate;

    // Already played today — no streak update needed
    if (lastPlayed === today) {
      return { dailyStreak: profile.dailyStreak, isNewDay: false };
    }

    let newStreak: number;
    if (lastPlayed === yesterday) {
      // Consecutive day — increment streak
      newStreak = profile.dailyStreak + 1;
    } else {
      // Streak broken (or first ever play) — start at 1
      newStreak = 1;
    }

    const longestStreak = Math.max(newStreak, profile.longestDailyStreak);

    await this.db.update(userProfiles).set({
      dailyStreak: newStreak,
      longestDailyStreak: longestStreak,
      lastPlayedDate: today,
      updatedAt: new Date(),
    }).where(eq(userProfiles.userId, userId));

    return { dailyStreak: newStreak, isNewDay: true };
  }

  /**
   * Get all active return hooks for a user.
   * Called by the lobby to show personalized content.
   */
  async getReturnHooks(userId: string): Promise<ReturnHook[]> {
    const hooks: ReturnHook[] = [];
    const today = todayUTC();
    const yesterday = yesterdayUTC();

    // Get profile data
    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });
    if (!profile) return hooks;

    // Get user data (for XP/level)
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    // ─── STREAK HOOK ─────────────────────────────────
    const lastPlayed = profile.lastPlayedDate;
    const playedToday = lastPlayed === today;
    const playedYesterday = lastPlayed === yesterday;

    if (playedToday && profile.dailyStreak >= 2) {
      // Active streak — show current status
      const reward = getStreakReward(profile.dailyStreak);
      const nextReward = getNextStreakReward(profile.dailyStreak);
      hooks.push({
        type: 'streak_active',
        priority: 1,
        icon: '🔥',
        title: `Day ${profile.dailyStreak} streak!`,
        subtitle: reward ? `Active: ${reward.label}` : 'Keep playing daily!',
        cta: nextReward ? `Day ${nextReward.days}: ${nextReward.label}` : undefined,
      });
    } else if (playedYesterday && !playedToday) {
      // Streak at risk — play today to continue
      const currentStreak = profile.dailyStreak;
      const nextReward = getNextStreakReward(currentStreak + 1);
      hooks.push({
        type: 'streak_at_risk',
        priority: 0, // Highest priority — streak is about to break
        icon: '⚡',
        title: `Day ${currentStreak} streak at risk!`,
        subtitle: 'Play today to keep your streak alive',
        cta: nextReward ? `Next: ${nextReward.label}` : undefined,
      });
    } else if (!playedToday && !playedYesterday && profile.dailyStreak > 0) {
      // Streak was broken
      hooks.push({
        type: 'streak_lost',
        priority: 3,
        icon: '💪',
        title: 'Start a new streak!',
        subtitle: `Previous best: ${profile.longestDailyStreak} days`,
      });
    }

    // ─── LEVEL-UP HOOK ───────────────────────────────
    if (user) {
      const xpPct = user.xpToNext > 0 ? user.xpCurrent / user.xpToNext : 0;
      if (xpPct >= 0.75) {
        hooks.push({
          type: 'near_level_up',
          priority: 2,
          icon: '⬆️',
          title: `Almost Level ${user.level + 1}!`,
          subtitle: `${user.xpToNext - user.xpCurrent} XP to go`,
        });
      }
    }

    // Sort by priority (lower = higher priority)
    hooks.sort((a, b) => a.priority - b.priority);

    // Max 3 hooks
    return hooks.slice(0, 3);
  }
}

// ─── Types ──────────────────────────────────────────────────

export interface ReturnHook {
  type: string;
  priority: number;
  icon: string;
  title: string;
  subtitle: string;
  cta?: string;
  action?: string;
}
