// ─── WebSocket Event Types ───────────────────────────────────────────────────

import type { RoundPhase, GameNode, RoundStatus } from './game.js';

// Inbound (client → server)
export type WSClientMessage =
  | { type: 'subscribe'; topic: string }
  | { type: 'unsubscribe'; topic: string }
  | { type: 'ping' };

// Outbound (server → client)
export type WSServerMessage =
  | RoundCreatedEvent
  | RoundEntryOpenEvent
  | RoundEntryClosingEvent
  | RoundStartedEvent
  | RoundProgressEvent
  | RoundNodeActivatedEvent
  | RoundFrozenEvent
  | RoundResolvedEvent
  | BattleRankUpdateEvent
  | FeedActivityEvent
  | UserBalanceUpdateEvent
  | UserLevelUpEvent
  | { type: 'pong' }
  | { type: 'error'; message: string };

export interface RoundCreatedEvent {
  type: 'round.created';
  roundId: string;
  mode: 'solo' | 'battle';
  startsAt: number;
  entryDeadline: number;
}

export interface RoundEntryOpenEvent {
  type: 'round.entry_open';
  roundId: string;
  currentPlayers: number;
  poolSize: number;
}

export interface RoundEntryClosingEvent {
  type: 'round.entry_closing';
  roundId: string;
  closesInMs: number;
}

export interface RoundStartedEvent {
  type: 'round.started';
  roundId: string;
  payload: {
    chartPath: { time: number; price: number; velocity: number }[];
    nodes: {
      id: string;
      type: string;
      value: number;
      timePosition: number;
      pathY: number;
      activationRadius: number;
      rarity: string;
    }[];
    duration: number;
    seedCommitment: string;
  };
}

export interface RoundProgressEvent {
  type: 'round.progress';
  roundId: string;
  elapsedMs: number;
  phase: RoundPhase;
}

export interface RoundNodeActivatedEvent {
  type: 'round.node_activated';
  roundId: string;
  nodeId: string;
  activationType: 'hit' | 'near_miss' | 'missed';
}

export interface RoundFrozenEvent {
  type: 'round.frozen';
  roundId: string;
  finalState: {
    chartEndPrice: number;
    totalNodesHit: number;
    totalNodesMissed: number;
  };
}

export interface RoundResolvedEvent {
  type: 'round.resolved';
  roundId: string;
  results: {
    userId: string;
    username: string;
    finalMultiplier: number;
    payout: number;
    rank?: number;
    resultType: string;
  }[];
  poolSummary: {
    grossPool: number;
    fee: number;
    netPool: number;
    playerCount: number;
  };
  seed: string;
}

export interface BattleRankUpdateEvent {
  type: 'battle.rank_update';
  roomId: string;
  rankings: {
    userId: string;
    username: string;
    multiplier: number;
    rank: number;
  }[];
}

export interface FeedActivityEvent {
  type: 'feed.activity';
  item: {
    id: string;
    feedType: 'big_win' | 'whale_bet' | 'battle_result' | 'achievement';
    payload: Record<string, unknown>;
    createdAt: number;
  };
}

export interface UserBalanceUpdateEvent {
  type: 'user.balance_update';
  userId: string;
  available: string;
  locked: string;
}

export interface UserLevelUpEvent {
  type: 'user.level_up';
  userId: string;
  newLevel: number;
  newXP: number;
  xpToNext: number;
}

// ─── Internal Event Bus Types ────────────────────────────────────────────────

export type DomainEvent =
  | { type: 'round.resolved'; roundId: string }
  | { type: 'bet.placed'; betId: string; userId: string; roundId: string }
  | { type: 'deposit.confirmed'; depositId: string; userId: string }
  | { type: 'withdrawal.completed'; withdrawalId: string; userId: string }
  | { type: 'user.level_up'; userId: string; level: number }
  | { type: 'achievement.unlocked'; userId: string; achievementId: string };
