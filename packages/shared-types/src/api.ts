// ─── API Types ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface WalletVerifyRequest {
  address: string;
  signature: string;
  nonce: string;
}

// ─── Gameplay API ────────────────────────────────────────────────────────────

export interface PlaceBetRequest {
  amount: number;
  riskTier: 'conservative' | 'balanced' | 'aggressive';
  idempotencyKey: string;
}

export interface PlaceBetResponse {
  bet: {
    id: string;
    roundId: string;
    amount: number;
    fee: number;
    riskTier: string;
    betSizeTier: string;
    status: string;
    lockedAt: string;
  };
  balance: {
    available: number;
    locked: number;
  };
}

export interface LobbyState {
  nextRound?: {
    id: string;
    mode: string;
    status: string;
    scheduledAt: string;
    playerCount: number;
    poolSize: number;
  };
  countdown: number;
  activePlayers: number;
}

export interface RoundHistoryItem {
  id: string;
  mode: string;
  betAmount: number;
  riskTier: string;
  finalMultiplier: number;
  payout: number;
  resultType: string;
  xpAwarded: number;
  createdAt: string;
}

// ─── Leaderboard API ─────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  level: number;
  vipTier: string;
  score: number;
}

// ─── Rewards API ─────────────────────────────────────────────────────────────

export interface Mission {
  id: string;
  type: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardXP: number;
  rewardBalance: number;
  completed: boolean;
  claimed: boolean;
  expiresAt?: string;
}

export interface Achievement {
  id: string;
  type: string;
  title: string;
  description: string;
  icon?: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface RakebackSummary {
  rate: number;
  accumulated: number;
  claimable: number;
  lastClaimedAt?: string;
}

// ─── Admin API ───────────────────────────────────────────────────────────────

export interface AdminDashboardStats {
  activeUsers: number;
  roundsToday: number;
  betVolumeToday: number;
  payoutVolumeToday: number;
  platformFeeToday: number;
  pendingWithdrawals: number;
  openRiskFlags: number;
}
