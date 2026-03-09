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

// ============================================================
// WALLET & TREASURY
// ============================================================

export const balances = pgTable('balances', {
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull().default('SOL'),
  availableAmount: bigint('available_amount', { mode: 'number' }).notNull().default(0),
  lockedAmount: bigint('locked_amount', { mode: 'number' }).notNull().default(0),
  pendingAmount: bigint('pending_amount', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // composite PK emulated via unique index
  uniqueIndex('balances_pk').on(table.userId, table.asset),
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
