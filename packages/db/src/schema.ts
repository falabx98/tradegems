import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  timestamp,
  jsonb,
  serial,
  bigserial,
  inet,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================
// IDENTITY & ACCESS
// ============================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash'),
  status: text('status').notNull().default('active'),
  role: text('role').notNull().default('player'),
  vipTier: text('vip_tier').notNull().default('bronze'),
  level: integer('level').notNull().default(1),
  xpTotal: bigint('xp_total', { mode: 'number' }).notNull().default(0),
  xpCurrent: bigint('xp_current', { mode: 'number' }).notNull().default(0),
  xpToNext: bigint('xp_to_next', { mode: 'number' }).notNull().default(100),
  bonusClaimed: boolean('bonus_claimed').notNull().default(false),
  demoBalance: bigint('demo_balance', { mode: 'number' }).notNull().default(100_000_000_000), // 100 DEMO tokens in lamports
  demoRefillsUsed: integer('demo_refills_used').notNull().default(0),
  lastDemoRefill: timestamp('last_demo_refill', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  isBot: boolean('is_bot').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_users_status').on(table.status),
  index('idx_users_vip_tier').on(table.vipTier),
]);

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  country: text('country'),
  preferences: jsonb('preferences').notNull().default({}),
  totalWagered: bigint('total_wagered', { mode: 'number' }).notNull().default(0),
  totalWon: bigint('total_won', { mode: 'number' }).notNull().default(0),
  roundsPlayed: integer('rounds_played').notNull().default(0),
  bestMultiplier: numeric('best_multiplier', { precision: 10, scale: 4 }).notNull().default('1.0'),
  winRate: numeric('win_rate', { precision: 5, scale: 4 }).notNull().default('0.0'),
  currentStreak: integer('current_streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  // Daily play streak (consecutive days)
  dailyStreak: integer('daily_streak').notNull().default(0),
  longestDailyStreak: integer('longest_daily_streak').notNull().default(0),
  lastPlayedDate: text('last_played_date'), // 'YYYY-MM-DD' format for easy comparison
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  deviceFingerprint: text('device_fingerprint'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('idx_sessions_user').on(table.userId),
]);

export const linkedWallets = pgTable('linked_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  chain: text('chain').notNull().default('solana'),
  address: text('address').notNull(),
  walletType: text('wallet_type').notNull().default('phantom'),
  isPrimary: boolean('is_primary').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_wallets_chain_address').on(table.chain, table.address),
  index('idx_wallets_user').on(table.userId),
]);

export const userDepositWallets = pgTable('user_deposit_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  address: text('address').notNull(),
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastSweptAt: timestamp('last_swept_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_deposit_wallets_user').on(table.userId),
  uniqueIndex('idx_deposit_wallets_address').on(table.address),
]);

// ============================================================
// WALLET & TREASURY
// ============================================================

export const balances = pgTable('balances', {
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull().default('SOL'),
  availableAmount: bigint('available_amount', { mode: 'number' }).notNull().default(0),
  lockedAmount: bigint('locked_amount', { mode: 'number' }).notNull().default(0),
  pendingAmount: bigint('pending_amount', { mode: 'number' }).notNull().default(0),
  bonusAmount: bigint('bonus_amount', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // composite PK emulated via unique index
  uniqueIndex('balances_pk').on(table.userId, table.asset),
  check('non_negative_available', sql`${table.availableAmount} >= 0`),
  check('non_negative_locked', sql`${table.lockedAmount} >= 0`),
  check('non_negative_pending', sql`${table.pendingAmount} >= 0`),
]);

export const balanceLedgerEntries = pgTable('balance_ledger_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull().default('SOL'),
  entryType: text('entry_type').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  referenceType: text('reference_type').notNull(),
  referenceId: text('reference_id').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ledger_user').on(table.userId, table.createdAt),
  index('idx_ledger_ref').on(table.referenceType, table.referenceId),
]);

export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull().default('SOL'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  txHash: text('tx_hash').unique(),
  fromAddress: text('from_address'),
  toAddress: text('to_address').notNull(),
  status: text('status').notNull().default('pending'),
  confirmations: integer('confirmations').notNull().default(0),
  requiredConfirmations: integer('required_confirmations').notNull().default(1),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_deposits_user').on(table.userId, table.createdAt),
  index('idx_deposits_status').on(table.status),
]);

export const withdrawals = pgTable('withdrawals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull().default('SOL'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  fee: bigint('fee', { mode: 'number' }).notNull().default(0),
  destination: text('destination').notNull(),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending_review'),
  riskScore: numeric('risk_score', { precision: 5, scale: 2 }).default('0'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_withdrawals_user').on(table.userId, table.createdAt),
  index('idx_withdrawals_status').on(table.status),
]);

// ============================================================
// ROUNDS & GAMEPLAY
// ============================================================

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  mode: text('mode').notNull().default('solo'),
  status: text('status').notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  seed: text('seed'),
  seedCommitment: text('seed_commitment'),
  configSnapshot: jsonb('config_snapshot').notNull(),
  chartPath: jsonb('chart_path'),
  durationMs: integer('duration_ms').notNull().default(15000),
  playerCount: integer('player_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_rounds_status').on(table.status),
  index('idx_rounds_scheduled').on(table.scheduledAt),
  index('idx_rounds_mode').on(table.mode, table.createdAt),
]);

export const roundPools = pgTable('round_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').notNull().references(() => rounds.id),
  poolType: text('pool_type').notNull().default('main'),
  liquidityMode: text('liquidity_mode').notNull().default('p2p'),
  grossPool: bigint('gross_pool', { mode: 'number' }).notNull().default(0),
  feeAmount: bigint('fee_amount', { mode: 'number' }).notNull().default(0),
  feeRate: numeric('fee_rate', { precision: 5, scale: 4 }).notNull().default('0.03'),
  netPool: bigint('net_pool', { mode: 'number' }).notNull().default(0),
  playerCount: integer('player_count').notNull().default(0),
  settled: boolean('settled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_pools_round').on(table.roundId),
]);

export const roundNodes = pgTable('round_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').notNull().references(() => rounds.id),
  nodeType: text('node_type').notNull(),
  nodeValue: numeric('node_value', { precision: 10, scale: 4 }).notNull(),
  spawnTimeMs: integer('spawn_time_ms').notNull(),
  pathY: numeric('path_y', { precision: 10, scale: 6 }).notNull(),
  activationRadius: numeric('activation_radius', { precision: 10, scale: 6 }).notNull(),
  nearMissRadius: numeric('near_miss_radius', { precision: 10, scale: 6 }),
  rarity: text('rarity').notNull().default('common'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_nodes_round').on(table.roundId),
]);

export const roundEvents = pgTable('round_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  roundId: uuid('round_id').notNull().references(() => rounds.id),
  eventType: text('event_type').notNull(),
  eventTimeMs: integer('event_time_ms').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_events_round').on(table.roundId, table.eventTimeMs),
]);

// ============================================================
// BETS & RESULTS
// ============================================================

export const bets = pgTable('bets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  roundId: uuid('round_id').notNull().references(() => rounds.id),
  poolId: uuid('pool_id').references(() => roundPools.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  fee: bigint('fee', { mode: 'number' }).notNull().default(0),
  riskTier: text('risk_tier').notNull().default('balanced'),
  betSizeTier: text('bet_size_tier').notNull().default('small'),
  powerups: jsonb('powerups').notNull().default([]),
  status: text('status').notNull().default('pending'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_bets_user_round').on(table.userId, table.roundId),
  index('idx_bets_user').on(table.userId, table.createdAt),
  index('idx_bets_round').on(table.roundId),
  index('idx_bets_status').on(table.status),
]);

export const betResults = pgTable('bet_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  betId: uuid('bet_id').unique().notNull().references(() => bets.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  roundId: uuid('round_id').notNull().references(() => rounds.id),
  finalMultiplier: numeric('final_multiplier', { precision: 10, scale: 4 }).notNull(),
  finalScore: numeric('final_score', { precision: 12, scale: 4 }).notNull(),
  rankPosition: integer('rank_position'),
  payoutAmount: bigint('payout_amount', { mode: 'number' }).notNull().default(0),
  rakebackAmount: bigint('rakeback_amount', { mode: 'number' }).notNull().default(0),
  xpAwarded: integer('xp_awarded').notNull().default(0),
  nodesHit: integer('nodes_hit').notNull().default(0),
  nodesMissed: integer('nodes_missed').notNull().default(0),
  nearMisses: integer('near_misses').notNull().default(0),
  resultType: text('result_type').notNull(),
  resultDetail: jsonb('result_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_results_user').on(table.userId, table.createdAt),
  index('idx_results_round').on(table.roundId),
]);

// ============================================================
// PROGRESSION & REWARDS
// ============================================================

export const missions = pgTable('missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  missionType: text('mission_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  config: jsonb('config').notNull(),
  activeFrom: timestamp('active_from', { withTimezone: true }).notNull(),
  activeTo: timestamp('active_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userMissionProgress = pgTable('user_mission_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  missionId: uuid('mission_id').notNull().references(() => missions.id),
  progress: integer('progress').notNull().default(0),
  target: integer('target').notNull(),
  metadata: jsonb('metadata').default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_mission_user_mission').on(table.userId, table.missionId),
  index('idx_mission_progress_user').on(table.userId),
]);

export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  achievementType: text('achievement_type').unique().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  icon: text('icon'),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  achievementId: uuid('achievement_id').notNull().references(() => achievements.id),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_user_achievement').on(table.userId, table.achievementId),
  index('idx_user_achievements_user').on(table.userId),
]);

export const dailyRewards = pgTable('daily_rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  rarity: text('rarity').notNull(), // common | uncommon | rare | epic | legendary
  amountLamports: bigint('amount_lamports', { mode: 'number' }).notNull(),
  userLevel: integer('user_level').notNull(),
  vipTier: text('vip_tier').notNull(),
}, (table) => [
  index('idx_daily_rewards_user').on(table.userId, table.claimedAt),
  index('idx_daily_rewards_claimed').on(table.claimedAt),
]);

// ============================================================
// REFERRAL / AFFILIATE
// ============================================================

export const referralCodes = pgTable('referral_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  code: text('code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_referral_codes_user').on(table.userId),
  uniqueIndex('idx_referral_codes_code').on(table.code),
]);

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  referredUserId: uuid('referred_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_referrals_referred').on(table.referredUserId),
  index('idx_referrals_referrer').on(table.referrerId),
]);

export const referralEarnings = pgTable('referral_earnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  referredUserId: uuid('referred_user_id').notNull().references(() => users.id),
  betId: uuid('bet_id').notNull().references(() => bets.id),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  feeAmount: bigint('fee_amount', { mode: 'number' }).notNull(),
  commissionAmount: bigint('commission_amount', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_referral_earnings_referrer').on(table.referrerId, table.status),
  index('idx_referral_earnings_bet').on(table.betId),
]);

// ============================================================
// SOCIAL & COMPETITIVE
// ============================================================

export const leaderboardSnapshots = pgTable('leaderboard_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leaderboardType: text('leaderboard_type').notNull(),
  periodKey: text('period_key').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  rank: integer('rank').notNull(),
  score: numeric('score', { precision: 16, scale: 4 }).notNull(),
  metadata: jsonb('metadata'),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_lb_type_period_user').on(table.leaderboardType, table.periodKey, table.userId),
  index('idx_lb_rank').on(table.leaderboardType, table.periodKey, table.rank),
]);

export const activityFeedItems = pgTable('activity_feed_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  feedType: text('feed_type').notNull(),
  userId: uuid('user_id').references(() => users.id),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feed_created').on(table.createdAt),
  index('idx_feed_type').on(table.feedType, table.createdAt),
]);

// ============================================================
// RISK & FRAUD
// ============================================================

export const riskFlags = pgTable('risk_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  flagType: text('flag_type').notNull(),
  severity: text('severity').notNull().default('low'),
  metadata: jsonb('metadata').notNull().default({}),
  resolved: boolean('resolved').notNull().default(false),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_risk_user').on(table.userId),
  index('idx_risk_unresolved').on(table.severity, table.createdAt),
]);

// ============================================================
// ADMIN & OPERATIONS
// ============================================================

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  actionType: text('action_type').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_actor').on(table.actorUserId, table.createdAt),
  index('idx_audit_target').on(table.targetType, table.targetId, table.createdAt),
]);

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  flagKey: text('flag_key').unique().notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const engineConfigs = pgTable('engine_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').unique().notNull(),
  config: jsonb('config').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  activatedBy: uuid('activated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// OUTBOX (for transactional events)
// ============================================================

export const outboxEvents = pgTable('outbox_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => [
  index('idx_outbox_pending').on(table.createdAt),
]);

// ============================================================
// CHAT
// ============================================================

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  username: text('username').notNull(),
  message: text('message').notNull(),
  channel: text('channel').notNull().default('global'),
  avatar: text('avatar'),  // gradient preset ID or URL
  level: integer('level').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_chat_channel_created').on(table.channel, table.createdAt),
]);

// ============================================================
// SEASON PASS
// ============================================================

export const seasonPassClaims = pgTable('season_pass_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  seasonNumber: integer('season_number').notNull(),
  level: integer('level').notNull(),
  track: text('track').notNull().default('free'),
  amountLamports: bigint('amount_lamports', { mode: 'number' }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_season_claim_unique').on(table.userId, table.seasonNumber, table.level, table.track),
  index('idx_season_claims_user').on(table.userId),
]);

// ============================================================
// TOURNAMENT HISTORY
// ============================================================

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: text('room_id').notNull(),
  buyIn: bigint('buy_in', { mode: 'number' }).notNull(),
  fee: bigint('fee', { mode: 'number' }).notNull(),
  grossPool: bigint('gross_pool', { mode: 'number' }).notNull(),
  netPool: bigint('net_pool', { mode: 'number' }).notNull(),
  playerCount: integer('player_count').notNull(),
  winnerId: uuid('winner_id').references(() => users.id),
  winnerUsername: text('winner_username'),
  winnerPayout: bigint('winner_payout', { mode: 'number' }).notNull().default(0),
  standings: jsonb('standings').notNull().default([]),
  roundData: jsonb('round_data').notNull().default([]),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_tournaments_winner').on(table.winnerId),
  index('idx_tournaments_created').on(table.createdAt),
]);

export const tournamentParticipants = pgTable('tournament_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  username: text('username').notNull(),
  finalRank: integer('final_rank'),
  cumulativeScore: numeric('cumulative_score', { precision: 10, scale: 4 }).notNull().default('0'),
  payout: bigint('payout', { mode: 'number' }).notNull().default(0),
  roundMultipliers: jsonb('round_multipliers').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_tp_tournament').on(table.tournamentId),
  index('idx_tp_user').on(table.userId, table.createdAt),
]);

// ============================================================
// PREDICTION ROUNDS
// ============================================================

export const predictionRounds = pgTable('prediction_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  direction: text('direction').notNull(),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  result: text('result').notNull(),
  payout: bigint('payout', { mode: 'number' }).notNull().default(0),
  multiplier: numeric('multiplier', { precision: 10, scale: 4 }).notNull().default('0'),
  pattern: text('pattern'),
  metadata: jsonb('metadata'),
  isDemo: boolean('is_demo').notNull().default(false),
  serverSeed: text('server_seed'),
  seedHash: text('seed_hash'),
  clientSeed: text('client_seed'),
  nonce: integer('nonce'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_prediction_user').on(table.userId, table.createdAt),
]);

// ============================================================
// BONUS CODES
// ============================================================

export const bonusCodes = pgTable('bonus_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').unique().notNull(),
  description: text('description'),
  type: text('type').notNull().default('free_credit'), // free_credit, deposit_match
  amountLamports: bigint('amount_lamports', { mode: 'number' }).notNull(),
  matchPercentage: integer('match_percentage').notNull().default(0), // for deposit_match (100 = 100%)
  maxMatchLamports: bigint('max_match_lamports', { mode: 'number' }).notNull().default(0),
  wagerMultiplier: integer('wager_multiplier').notNull().default(0), // 0 = no requirement, 20 = 20x
  maxUses: integer('max_uses').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  maxPerUser: integer('max_per_user').notNull().default(1),
  minLevel: integer('min_level').notNull().default(1),
  minDeposits: integer('min_deposits').notNull().default(0),
  firstDepositOnly: boolean('first_deposit_only').notNull().default(false),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_bonus_codes_code').on(table.code),
  index('idx_bonus_codes_active').on(table.active),
]);

export const bonusWagerProgress = pgTable('bonus_wager_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  bonusCodeId: uuid('bonus_code_id').notNull().references(() => bonusCodes.id),
  bonusAmountLamports: bigint('bonus_amount_lamports', { mode: 'number' }).notNull(),
  wagerRequiredLamports: bigint('wager_required_lamports', { mode: 'number' }).notNull(),
  wagerCompletedLamports: bigint('wager_completed_lamports', { mode: 'number' }).notNull().default(0),
  fulfilled: boolean('fulfilled').notNull().default(false),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_bonus_wager_user').on(table.userId),
]);

export const pendingDepositMatches = pgTable('pending_deposit_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  bonusCodeId: uuid('bonus_code_id').notNull().references(() => bonusCodes.id),
  matchPercentage: integer('match_percentage').notNull(),
  maxMatchLamports: bigint('max_match_lamports', { mode: 'number' }).notNull(),
  used: boolean('used').notNull().default(false),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_pending_match_user').on(table.userId),
]);

export const bonusCodeRedemptions = pgTable('bonus_code_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  bonusCodeId: uuid('bonus_code_id').notNull().references(() => bonusCodes.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  amountLamports: bigint('amount_lamports', { mode: 'number' }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_redemptions_user').on(table.userId),
  index('idx_redemptions_code').on(table.bonusCodeId),
]);

// ============================================================
// LOTTERY / JACKPOT
// ============================================================

export const lotteryDraws = pgTable('lottery_draws', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawNumber: serial('draw_number').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'closed' | 'drawing' | 'completed'
  drawDate: timestamp('draw_date', { withTimezone: true }).notNull(),
  standardPrice: bigint('standard_price', { mode: 'number' }).notNull().default(100_000_000), // 0.10 SOL
  powerPrice: bigint('power_price', { mode: 'number' }).notNull().default(500_000_000), // 0.50 SOL
  totalTickets: integer('total_tickets').notNull().default(0),
  prizePool: bigint('prize_pool', { mode: 'number' }).notNull().default(0),
  rolloverPool: bigint('rollover_pool', { mode: 'number' }).notNull().default(0),
  winningNumbers: jsonb('winning_numbers'), // array of 5 ints (1-36)
  winningGemBall: integer('winning_gem_ball'), // 1-9
  drawSeed: text('draw_seed'),
  seedCommitment: text('seed_commitment'),
  clientSeedCombined: text('client_seed_combined'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  drawnAt: timestamp('drawn_at', { withTimezone: true }),
}, (table) => [
  index('idx_lottery_draws_status').on(table.status),
  index('idx_lottery_draws_number').on(table.drawNumber),
  index('idx_lottery_draws_date').on(table.drawDate),
]);

export const lotteryTickets = pgTable('lottery_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawId: uuid('draw_id').notNull().references(() => lotteryDraws.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  entryType: text('entry_type').notNull().default('standard'), // 'standard' | 'power'
  numbers: jsonb('numbers').notNull(), // array of 5 sorted ints (1-36)
  gemBall: integer('gem_ball').notNull(), // 1-9
  cost: bigint('cost', { mode: 'number' }).notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_lottery_tickets_draw').on(table.drawId),
  index('idx_lottery_tickets_user').on(table.userId),
  index('idx_lottery_tickets_draw_user').on(table.drawId, table.userId),
]);

export const lotteryWinners = pgTable('lottery_winners', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawId: uuid('draw_id').notNull().references(() => lotteryDraws.id),
  ticketId: uuid('ticket_id').notNull().references(() => lotteryTickets.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  tier: integer('tier').notNull(), // 1-9 (1 = jackpot)
  matchedNumbers: integer('matched_numbers').notNull(),
  matchedGemBall: boolean('matched_gem_ball').notNull(),
  prizeAmount: bigint('prize_amount', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_lottery_winners_unique').on(table.drawId, table.ticketId),
  index('idx_lottery_winners_draw').on(table.drawId),
  index('idx_lottery_winners_user').on(table.userId),
  index('idx_lottery_winners_tier').on(table.drawId, table.tier),
]);

// ============================================================
// TRADING SIMULATOR PvP
// ============================================================

export const tradingSimRooms = pgTable('trading_sim_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryFee: bigint('entry_fee', { mode: 'number' }).notNull(),
  maxPlayers: integer('max_players').notNull().default(4),
  currentPlayers: integer('current_players').notNull().default(0),
  status: text('status').notNull().default('waiting'), // 'waiting' | 'active' | 'finished'
  chartData: jsonb('chart_data'), // pre-generated OHLCV candles
  duration: integer('duration').notNull().default(60), // seconds
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  winnerId: uuid('winner_id').references(() => users.id),
  prizePool: bigint('prize_pool', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_trading_sim_rooms_status').on(table.status),
]);

export const tradingSimParticipants = pgTable('trading_sim_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => tradingSimRooms.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  startBalance: integer('start_balance').notNull().default(10000),
  finalBalance: integer('final_balance'),
  finalPnl: integer('final_pnl'),
  rank: integer('rank'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_trading_sim_participants_unique').on(table.roomId, table.userId),
  index('idx_trading_sim_participants_room').on(table.roomId),
  index('idx_trading_sim_participants_user').on(table.userId),
]);

export const tradingSimTrades = pgTable('trading_sim_trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => tradingSimRooms.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  tradeType: text('trade_type').notNull(), // 'buy' | 'sell'
  price: numeric('price', { precision: 12, scale: 4 }).notNull(),
  quantity: integer('quantity').notNull(),
  timestamp: integer('timestamp').notNull(), // seconds into the round
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_trading_sim_trades_room').on(table.roomId),
  index('idx_trading_sim_trades_user').on(table.userId),
]);

// ─── Candleflip ──────────────────────────────────────────────

export const candleflipGames = pgTable('candleflip_games', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').notNull().references(() => users.id),
  opponentId: uuid('opponent_id').references(() => users.id),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  creatorPick: text('creator_pick').notNull(), // 'bullish' | 'bearish'
  status: text('status').notNull().default('open'), // 'open' | 'playing' | 'finished' | 'cancelled'
  result: text('result'), // 'bullish' | 'bearish'
  resultMultiplier: numeric('result_multiplier', { precision: 8, scale: 4 }),
  winnerId: uuid('winner_id').references(() => users.id),
  prizeAmount: bigint('prize_amount', { mode: 'number' }),
  seed: text('seed'),
  seedHash: text('seed_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_candleflip_status').on(table.status),
  index('idx_candleflip_creator').on(table.creatorId),
]);

// ─── Rug Game (Standard) ─────────────────────────────────────

export const rugGames = pgTable('rug_games', {
  id: uuid('id').primaryKey().defaultRandom(),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('active'), // 'active' | 'cashed_out' | 'rugged'
  rugMultiplier: numeric('rug_multiplier', { precision: 8, scale: 4 }).notNull(), // the hidden crash point
  cashOutMultiplier: numeric('cash_out_multiplier', { precision: 8, scale: 4 }),
  payout: bigint('payout', { mode: 'number' }),
  seed: text('seed'),
  seedHash: text('seed_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_rug_games_user').on(table.userId),
  index('idx_rug_games_status').on(table.status),
]);

// ── Public Rug Rounds (rugs.fun-style auto-cycling) ──────────────────────────

export const rugRounds = pgTable('rug_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundNumber: serial('round_number'),
  status: text('status').notNull().default('waiting'), // waiting | active | resolved
  rugMultiplier: numeric('rug_multiplier', { precision: 8, scale: 4 }).notNull(),
  seed: text('seed').notNull(),
  seedHash: text('seed_hash').notNull(),
  candleData: jsonb('candle_data'), // OHLC array updated progressively
  waitStartedAt: timestamp('wait_started_at', { withTimezone: true }).notNull().defaultNow(),
  activeStartedAt: timestamp('active_started_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  playerCount: integer('player_count').notNull().default(0),
  totalBetAmount: bigint('total_bet_amount', { mode: 'number' }).notNull().default(0),
}, (table) => [
  index('idx_rug_rounds_status').on(table.status),
]);

export const rugRoundBets = pgTable('rug_round_bets', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').notNull().references(() => rugRounds.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  cashOutMultiplier: numeric('cash_out_multiplier', { precision: 8, scale: 4 }),
  payout: bigint('payout', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('active'), // active | cashed_out | rugged
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_rug_round_bets_unique').on(table.roundId, table.userId),
  index('idx_rug_round_bets_round').on(table.roundId),
]);

// ── Failed Settlements (recovery tracking) ─────────────────────────────────

export const failedSettlements = pgTable('failed_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  game: text('game').notNull(),
  gameRefType: text('game_ref_type').notNull(),
  gameRefId: text('game_ref_id').notNull(),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  fee: bigint('fee', { mode: 'number' }).notNull().default(0),
  payoutAmount: bigint('payout_amount', { mode: 'number' }).notNull(),
  errorMessage: text('error_message').notNull(),
  status: text('status').notNull().default('pending'), // pending | retried | resolved | abandoned
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_failed_settlements_status').on(table.status),
  index('idx_failed_settlements_user').on(table.userId),
]);

// ── Public Candleflip Rounds ─────────────────────────────────────────────────

export const candleflipRounds = pgTable('candleflip_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundNumber: serial('round_number'),
  status: text('status').notNull().default('waiting'), // waiting | flipping | resolved
  result: text('result'), // bullish | bearish (null until resolved)
  resultMultiplier: numeric('result_multiplier', { precision: 8, scale: 4 }),
  seed: text('seed').notNull(),
  seedHash: text('seed_hash').notNull(),
  candleData: jsonb('candle_data'), // 10-candle OHLC array
  waitStartedAt: timestamp('wait_started_at', { withTimezone: true }).notNull().defaultNow(),
  flipStartedAt: timestamp('flip_started_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  playerCount: integer('player_count').notNull().default(0),
  totalBullish: integer('total_bullish').notNull().default(0),
  totalBearish: integer('total_bearish').notNull().default(0),
}, (table) => [
  index('idx_candleflip_rounds_status').on(table.status),
]);

export const candleflipRoundBets = pgTable('candleflip_round_bets', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').notNull().references(() => candleflipRounds.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  pick: text('pick').notNull(), // bullish | bearish
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  payout: bigint('payout', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('pending'), // pending | won | lost
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_candleflip_round_bets_unique').on(table.roundId, table.userId),
  index('idx_candleflip_round_bets_round').on(table.roundId),
]);

// ─── Mines ──────────────────────────────────────────────────

export const minesGames = pgTable('mines_games', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  mineCount: integer('mine_count').notNull(),
  revealedCells: jsonb('revealed_cells').notNull().default([]),
  revealCount: integer('reveal_count').notNull().default(0),
  currentMultiplier: numeric('current_multiplier', { precision: 12, scale: 4 }).notNull().default('1.0000'),
  finalMultiplier: numeric('final_multiplier', { precision: 12, scale: 4 }),
  payout: bigint('payout', { mode: 'number' }),
  status: text('status').notNull().default('active'), // active | cashed_out | lost
  seed: text('seed').notNull(),
  seedHash: text('seed_hash').notNull(),
  clientSeed: text('client_seed').notNull(),
  board: text('board').notNull(), // JSON-serialized mine positions (encrypted at rest)
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_mines_games_user').on(table.userId),
  index('idx_mines_games_status').on(table.status),
  index('idx_mines_games_created').on(table.createdAt),
  uniqueIndex('idx_mines_games_active_user').on(table.userId).where(sql`status = 'active'`),
]);

// ─── Responsible Gambling ───────────────────────────────────

export const userLimits = pgTable('user_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  limitType: text('limit_type').notNull(), // daily_deposit, weekly_deposit, monthly_deposit, daily_loss
  amount: bigint('amount', { mode: 'number' }).notNull(),
  pendingAmount: bigint('pending_amount', { mode: 'number' }),
  pendingEffectiveAt: timestamp('pending_effective_at', { withTimezone: true }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_limits_user').on(table.userId),
]);

export const selfExclusions = pgTable('self_exclusions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  exclusionType: text('exclusion_type').notNull(), // 24h, 7d, 30d, permanent
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }), // null = permanent
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_self_exclusions_active').on(table.userId, table.active),
]);



// ─── Weekly Races ───────────────────────────────────────────

export const weeklyRaces = pgTable('weekly_races', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: timestamp('week_start', { withTimezone: true }).notNull(),
  weekEnd: timestamp('week_end', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('active'), // active, paying, completed
  prizePoolLamports: bigint('prize_pool_lamports', { mode: 'number' }).notNull().default(10_000_000_000), // 10 SOL
  prizeSource: text('prize_source').notNull().default('fixed'), // fixed, percentage_of_volume
  fixedPrizeLamports: bigint('fixed_prize_lamports', { mode: 'number' }).notNull().default(10_000_000_000),
  volumePercentage: numeric('volume_percentage').default('0.01'),
  totalVolumeLamports: bigint('total_volume_lamports', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_weekly_races_status').on(table.status),
  index('idx_weekly_races_week_start').on(table.weekStart),
]);

export const weeklyRaceEntries = pgTable('weekly_race_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  raceId: uuid('race_id').notNull().references(() => weeklyRaces.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  totalWageredLamports: bigint('total_wagered_lamports', { mode: 'number' }).notNull().default(0),
  betCount: integer('bet_count').notNull().default(0),
  lastBetAt: timestamp('last_bet_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_weekly_race_entries_unique').on(table.raceId, table.userId),
  index('idx_weekly_race_entries_wagered').on(table.raceId, table.totalWageredLamports),
]);

export const weeklyRacePrizes = pgTable('weekly_race_prizes', {
  id: uuid('id').primaryKey().defaultRandom(),
  raceId: uuid('race_id').notNull().references(() => weeklyRaces.id),
  rank: integer('rank').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  prizeLamports: bigint('prize_lamports', { mode: 'number' }).notNull(),
  claimed: boolean('claimed').notNull().default(true), // auto-credited
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_weekly_race_prizes_race').on(table.raceId),
  index('idx_weekly_race_prizes_user').on(table.userId),
]);

// ─── Sponsored Balances (Streamer Accounts) ─────────────────

export const sponsoredBalances = pgTable('sponsored_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  grantedAmountLamports: bigint('granted_amount_lamports', { mode: 'number' }).notNull(),
  profitSharePercentage: integer('profit_share_percentage').notNull().default(20),
  ownDepositsLamports: bigint('own_deposits_lamports', { mode: 'number' }).notNull().default(0),
  totalWithdrawnLamports: bigint('total_withdrawn_lamports', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('active'), // active, expired, settled
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  notes: text('notes'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  index('idx_sponsored_status').on(table.status),
]);

// ─── User Seed State (Provably Fair) ────────────────────────

export const userSeedState = pgTable('user_seed_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  clientSeed: text('client_seed').notNull(),
  nonce: integer('nonce').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Analytics Events ────────────────────────────────────────

export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id'),
  sessionId: text('session_id'),
  event: text('event').notNull(),
  properties: jsonb('properties').default({}),
  device: text('device'),
  page: text('page'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_analytics_user').on(table.userId),
  index('idx_analytics_event').on(table.event),
  index('idx_analytics_created').on(table.createdAt),
]);
