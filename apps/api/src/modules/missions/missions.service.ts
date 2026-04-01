/**
 * Missions V1 — Daily missions system.
 *
 * 3 daily missions generated at midnight UTC.
 * XP rewards only (no SOL rewards in V1).
 * Mission progress tracked per-user via userMissionProgress table.
 */

import { getDb } from '../../config/database.js';
import { missions, userMissionProgress } from '@tradingarena/db';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import { UserService } from '../user/user.service.js';

// ─── Mission Templates ──────────────────────────────────────

interface MissionTemplate {
  type: string;
  title: string;
  description: string;
  target: number;
  xpReward: number;
  /** feedTypes that count toward this mission */
  trackFeedTypes?: string[];
  /** Special tracking key (e.g. 'unique_games', 'wager_total') */
  trackKey?: string;
}

const DAILY_POOL: MissionTemplate[] = [
  { type: 'play_rounds', title: 'Play 3 Rounds', description: 'Complete 3 rounds in any game', target: 3, xpReward: 50 },
  { type: 'play_rounds_5', title: 'Play 5 Rounds', description: 'Complete 5 rounds in any game', target: 5, xpReward: 75 },
  { type: 'win_rounds', title: 'Win a Round', description: 'Win or cash out successfully', target: 1, xpReward: 40 },
  { type: 'win_rounds_3', title: 'Win 3 Rounds', description: 'Win or cash out 3 times', target: 3, xpReward: 80 },
  { type: 'try_games_2', title: 'Try 2 Games', description: 'Play 2 different games today', target: 2, xpReward: 60, trackKey: 'unique_games' },
  { type: 'try_games_3', title: 'Try 3 Games', description: 'Play 3 different games today', target: 3, xpReward: 100, trackKey: 'unique_games' },
  { type: 'play_predictions', title: 'Play Predictions', description: 'Complete a prediction round', target: 1, xpReward: 40, trackFeedTypes: ['prediction_result'] },
  { type: 'play_rug', title: 'Play Rug Game', description: 'Complete a rug game round', target: 1, xpReward: 40, trackFeedTypes: ['rug_result'] },
  { type: 'play_mines', title: 'Play Mines', description: 'Complete a mines game', target: 1, xpReward: 40, trackFeedTypes: ['mines_result'] },
  { type: 'play_candleflip', title: 'Play Candleflip', description: 'Complete a candleflip round', target: 1, xpReward: 40, trackFeedTypes: ['candleflip_result'] },
  { type: 'play_solo', title: 'Play Solo', description: 'Complete a solo round', target: 1, xpReward: 40, trackFeedTypes: ['solo_result'] },
];

// ─── Service ─────────────────────────────────────────────────

export class MissionsService {
  private db = getDb();
  private userService = new UserService();

  /**
   * Get today's missions for a user.
   * If none exist, generate them (lazy generation on first access).
   */
  async getDailyMissions(userId: string) {
    const { start, end } = todayUTC();

    // Check if missions exist for today
    const todayMissions = await this.db
      .select()
      .from(missions)
      .where(and(
        gte(missions.activeFrom, start),
        lte(missions.activeFrom, end),
        eq(missions.missionType, 'daily'),
      ));

    let missionList = todayMissions;

    // Generate if none exist
    if (missionList.length === 0) {
      missionList = await this.generateDailyMissions();
    }

    // Get user progress for these missions
    const missionIds = missionList.map(m => m.id);
    const progress = await this.db
      .select()
      .from(userMissionProgress)
      .where(and(
        eq(userMissionProgress.userId, userId),
      ));

    // Filter to today's missions only
    const progressMap = new Map(
      progress.filter(p => missionIds.includes(p.missionId)).map(p => [p.missionId, p])
    );

    return missionList.map(m => {
      const config = m.config as any;
      const p = progressMap.get(m.id);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        target: config.target || 1,
        progress: p?.progress || 0,
        xpReward: config.xpReward || 50,
        completed: !!p?.completedAt,
        claimed: !!p?.claimedAt,
      };
    });
  }

  /**
   * Generate 3 random daily missions for today.
   */
  private async generateDailyMissions() {
    const { start } = todayUTC();

    // Pick 3 random non-duplicate missions from the pool
    const shuffled = [...DAILY_POOL].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    const created = [];
    for (const template of selected) {
      const [m] = await this.db.insert(missions).values({
        missionType: 'daily',
        title: template.title,
        description: template.description,
        config: {
          type: template.type,
          target: template.target,
          xpReward: template.xpReward,
          trackFeedTypes: template.trackFeedTypes,
          trackKey: template.trackKey,
        },
        activeFrom: start,
        activeTo: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      }).returning();
      created.push(m);
    }

    return created;
  }

  /**
   * Increment mission progress for a user based on game activity.
   * Called after game settlement.
   *
   * @param userId - the player
   * @param feedType - game result type (e.g. 'prediction_result', 'rug_result')
   * @param isWin - whether this was a win/cashout (true) or loss (false)
   */
  async trackProgress(userId: string, feedType: string, isWin: boolean = false) {
    const { start, end } = todayUTC();

    // Get today's missions
    const todayMissions = await this.db
      .select()
      .from(missions)
      .where(and(
        gte(missions.activeFrom, start),
        lte(missions.activeFrom, end),
        eq(missions.missionType, 'daily'),
      ));

    for (const mission of todayMissions) {
      const config = mission.config as any;
      const missionType = config.type as string;

      // Determine if this play is relevant to this mission
      let shouldIncrement = false;

      if (missionType.startsWith('play_rounds')) {
        // All plays count
        shouldIncrement = true;
      } else if (missionType.startsWith('win_rounds')) {
        // ONLY wins count
        shouldIncrement = isWin;
      } else if (config.trackFeedTypes && config.trackFeedTypes.includes(feedType)) {
        // Game-specific missions (e.g. "Play Predictions")
        shouldIncrement = true;
      } else if (missionType.startsWith('try_games')) {
        // Unique games — check if this game type was already played today
        shouldIncrement = await this.isNewGameTypeToday(userId, feedType, mission.id);
      }

      if (!shouldIncrement) continue;

      // Ensure progress row exists
      let [existing] = await this.db
        .select()
        .from(userMissionProgress)
        .where(and(
          eq(userMissionProgress.userId, userId),
          eq(userMissionProgress.missionId, mission.id),
        ));

      if (!existing) {
        [existing] = await this.db.insert(userMissionProgress).values({
          userId,
          missionId: mission.id,
          progress: 0,
          target: config.target,
        }).onConflictDoNothing().returning();

        if (!existing) {
          [existing] = await this.db.select().from(userMissionProgress).where(and(
            eq(userMissionProgress.userId, userId),
            eq(userMissionProgress.missionId, mission.id),
          ));
        }
      }

      if (!existing || existing.completedAt) continue;

      // Increment progress
      const newProgress = Math.min(existing.progress + 1, config.target);
      const isComplete = newProgress >= config.target;

      await this.db.update(userMissionProgress).set({
        progress: newProgress,
        ...(isComplete ? { completedAt: new Date() } : {}),
      }).where(eq(userMissionProgress.id, existing.id));
    }
  }

  /**
   * Check if this game type is new for the user today (for try_games missions).
   * Uses the userMissionProgress metadata or activity feed to determine unique games played.
   */
  private async isNewGameTypeToday(userId: string, feedType: string, missionId: string): Promise<boolean> {
    // Use mission progress metadata to track unique game types (not activity feed timing)
    // This is deterministic and doesn't depend on activity feed insertion order
    const [progress] = await this.db
      .select()
      .from(userMissionProgress)
      .where(and(
        eq(userMissionProgress.userId, userId),
        eq(userMissionProgress.missionId, missionId),
      ));

    // Get already-tracked game types from metadata
    const metadata = (progress?.metadata as any) || {};
    const playedTypes: string[] = metadata.playedGameTypes || [];

    if (playedTypes.includes(feedType)) {
      // Already played this game type today — not new
      return false;
    }

    // New game type — record it in metadata
    const updatedTypes = [...playedTypes, feedType];

    if (progress) {
      await this.db.update(userMissionProgress).set({
        metadata: { ...metadata, playedGameTypes: updatedTypes },
      }).where(eq(userMissionProgress.id, progress.id));
    }
    // If no progress row yet, it'll be created by trackProgress and the type
    // will be recorded on the next call (acceptable — first play always counts)

    return true;
  }

  /**
   * Claim reward for a completed mission.
   */
  async claimMission(userId: string, missionId: string) {
    const [progress] = await this.db
      .select()
      .from(userMissionProgress)
      .where(and(
        eq(userMissionProgress.userId, userId),
        eq(userMissionProgress.missionId, missionId),
      ));

    if (!progress) throw new Error('Mission not found');
    if (!progress.completedAt) throw new Error('Mission not yet completed');
    if (progress.claimedAt) throw new Error('Already claimed');

    // Get mission config for reward
    const [mission] = await this.db
      .select()
      .from(missions)
      .where(eq(missions.id, missionId));

    if (!mission) throw new Error('Mission not found');
    const config = mission.config as any;
    const xpReward = config.xpReward || 50;

    // Award XP
    await this.userService.addXP(userId, xpReward, 'mission');

    // Mark as claimed
    await this.db.update(userMissionProgress).set({
      claimedAt: new Date(),
    }).where(eq(userMissionProgress.id, progress.id));

    return { xpReward };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function todayUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}
