// ─── User Types ──────────────────────────────────────────────────────────────

export type VipTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'titan';
export type UserRole = 'player' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface UserProfile {
  id: string;
  email?: string;
  username: string;
  status: UserStatus;
  role: UserRole;
  vipTier: VipTier;
  level: number;
  xpTotal: number;
  xpCurrent: number;
  xpToNext: number;
  createdAt: string;
}

export interface UserStats {
  totalWagered: number;
  totalWon: number;
  roundsPlayed: number;
  bestMultiplier: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
}

export interface UserProgression {
  level: number;
  xpCurrent: number;
  xpToNext: number;
  vipTier: VipTier;
  rakebackRate: number;
}

export interface PublicProfile {
  id: string;
  username: string;
  level: number;
  vipTier: VipTier;
  roundsPlayed: number;
  bestMultiplier: number;
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
}

export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: number;
}
