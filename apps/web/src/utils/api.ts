// ─── API Client ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('accessToken');
  }
  return accessToken;
}

async function refreshToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      setAccessToken(data.accessToken);
    } catch {
      setAccessToken(null);
      throw new Error('Session expired');
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    try {
      await refreshToken();
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch {
      // Refresh failed, redirect to login
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.error?.code || 'UNKNOWN',
      body.error?.message || res.statusText,
      body.error?.details,
    );
  }

  return res.json();
}

// ─── Server Config Cache (M1 fix: fee rate from server) ─────────────────────

let _serverConfig: { feeRate: number; minBetLamports: number; maxBetLamports: number } | null = null;
let _configFetchedAt = 0;

export async function getServerConfig() {
  const now = Date.now();
  if (_serverConfig && now - _configFetchedAt < 300_000) return _serverConfig; // Cache 5 min
  try {
    const data = await apiFetch<{ feeRate: number; minBetLamports: number; maxBetLamports: number }>('/v1/config');
    _serverConfig = data;
    _configFetchedAt = now;
    return data;
  } catch {
    return _serverConfig ?? { feeRate: 0.05, minBetLamports: 1_000_000, maxBetLamports: 10_000_000_000 };
  }
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (data: { email: string; username: string; password: string; referralCode?: string }) =>
    apiFetch<{ accessToken: string; userId: string }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiFetch<{ accessToken: string; userId: string }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiFetch('/v1/auth/logout', { method: 'POST' }),

  // User
  getMe: () =>
    apiFetch<{ id: string; username: string; email: string; level: number; vipTier: string; avatarUrl?: string }>('/v1/users/me'),

  updateMe: (data: { username?: string; displayName?: string; avatarUrl?: string }) =>
    apiFetch<{ id: string; username: string; avatarUrl?: string }>('/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getMyStats: () =>
    apiFetch('/v1/users/me/stats'),

  getMyProgression: () =>
    apiFetch('/v1/users/me/progression'),

  // Wallet
  getBalances: () =>
    apiFetch<{ balances: { asset: string; available: string; locked: string; pending: string }[] }>('/v1/wallet/balances'),

  getTransactions: (limit?: number) =>
    apiFetch(`/v1/wallet/transactions?limit=${limit || 20}`),

  // Rounds
  getLobby: () =>
    apiFetch<{ nextRound: { id: string; status: string; scheduledAt: string; playerCount: number } | null }>('/v1/rounds/lobby'),

  getRound: (id: string) =>
    apiFetch(`/v1/rounds/${id}`),

  getRoundResult: (id: string) =>
    apiFetch(`/v1/rounds/${id}/result`),

  placeBet: (roundId: string, data: { amount: number; riskTier: string; idempotencyKey: string }) =>
    apiFetch(`/v1/rounds/${roundId}/bet`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelBet: (roundId: string) =>
    apiFetch(`/v1/rounds/${roundId}/bet`, { method: 'DELETE' }),

  getRoundHistory: (limit?: number) =>
    apiFetch(`/v1/rounds/history?limit=${limit || 20}`),

  // Solo round lifecycle
  startSoloRound: () =>
    apiFetch('/v1/rounds/solo/start', { method: 'POST' }),

  resolveSoloRound: (roundId: string) =>
    apiFetch(`/v1/rounds/solo/resolve/${roundId}`, { method: 'POST' }),

  // Dev (admin only — kept for admin tools)
  scheduleRound: () =>
    apiFetch('/v1/rounds/dev/schedule', { method: 'POST' }),

  devResolveRound: (roundId: string) =>
    apiFetch(`/v1/rounds/dev/resolve/${roundId}`, { method: 'POST' }),

  // Leaderboard
  getLeaderboard: (type: string, period?: string) =>
    apiFetch(`/v1/leaderboards/${type}?period=${period || 'all'}`),

  // Wallet Auth
  walletChallenge: (address: string) =>
    apiFetch<{ nonce: string; message: string }>(`/v1/auth/wallet/challenge?address=${address}`),

  walletVerify: (data: { address: string; signature: string; nonce: string }) =>
    apiFetch<{ accessToken: string; userId: string; isNewAccount: boolean }>('/v1/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Deposit
  getDepositInfo: (asset: string = 'SOL') =>
    apiFetch<{ asset: string; address: string; minimumAmount: string; requiredConfirmations: number }>(
      `/v1/wallet/deposit/${asset}`,
    ),

  verifyDeposit: (txHash: string) =>
    apiFetch<{ id: string; status: string; amount: string; asset: string }>('/v1/wallet/deposit/verify', {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    }),

  // Withdrawal
  requestWithdrawal: (data: { asset: string; amount: string; destination: string }) =>
    apiFetch<{ id: string; status: string; amount: string; fee: string; txHash?: string }>(
      '/v1/wallet/withdraw',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Link wallet
  linkWallet: (address: string) =>
    apiFetch<{ message: string; address: string }>('/v1/wallet/link-wallet', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  // Bonus
  claimBonus: () =>
    apiFetch<{ success: boolean; message: string; amount?: number }>('/v1/wallet/claim-bonus', {
      method: 'POST',
    }),

  getBonusStatus: () =>
    apiFetch<{
      claimed: boolean;
      bonusAmount: number;
      profitRequired: number;
      currentProfit: number;
      withdrawalUnlocked: boolean;
    }>('/v1/wallet/bonus-status'),

  // Rewards
  getMissions: () =>
    apiFetch<{ data: Array<{ id: string; title: string; description: string; progress: number; target: number; reward: number; completed: boolean }> }>('/v1/rewards/missions'),

  claimMission: (id: string) =>
    apiFetch<{ success: boolean; message?: string }>(`/v1/rewards/missions/${id}/claim`, { method: 'POST' }),

  getAchievements: () =>
    apiFetch<{ data: Array<{ id: string; title: string; description: string; unlockedAt: string | null }> }>('/v1/rewards/achievements'),

  getRakeback: () =>
    apiFetch<{ rate: number; tier: string; accumulated: number; claimable: number }>('/v1/rewards/rakeback'),

  claimRakeback: () =>
    apiFetch<{ success: boolean; claimed?: number; message?: string }>('/v1/rewards/rakeback/claim', { method: 'POST' }),

  // Daily Mystery Box
  getDailyBox: () =>
    apiFetch<{
      available: boolean;
      nextAvailableAt: string | null;
      level: number;
      vipTier: string;
      rewardTable: Array<{ rarity: string; probability: number; amountLamports: number }>;
      nextTierRewards: { tier: string; rewards: Array<{ rarity: string; probability: number; amountLamports: number }> } | null;
      history: Array<{ id: string; claimedAt: string; rarity: string; amountLamports: number; userLevel: number; vipTier: string }>;
    }>('/v1/rewards/daily-box'),

  claimDailyBox: () =>
    apiFetch<{
      success: boolean;
      message?: string;
      nextAvailableAt?: string;
      reward?: { id: string; rarity: string; amountLamports: number; level: number; vipTier: string };
    }>('/v1/rewards/daily-box/claim', { method: 'POST' }),

  // Tournaments
  getTournamentRooms: () =>
    apiFetch<{
      tiers: Array<{
        buyIn: number;
        label: string;
        rooms: Array<{ roomId: string; buyIn: number; playerCount: number; maxPlayers: number; countdownStartedAt: number | null; phaseEndsAt: number; createdAt: number }>;
        openCount: number;
      }>;
      buyInOptions: number[];
    }>('/v1/battles/rooms'),

  joinTournament: (buyIn: number) =>
    apiFetch<{
      success: boolean;
      roomId: string;
      state: string;
      players: any[];
      playerCount: number;
      buyIn: number;
      grossPool: number;
      netPool: number;
    }>('/v1/battles/join', {
      method: 'POST',
      body: JSON.stringify({ buyIn }),
    }),

  getTournamentRoom: (roomId: string) =>
    apiFetch<{
      roomId: string;
      buyIn: number;
      fee: number;
      state: 'waiting' | 'round_active' | 'round_results' | 'final_results' | 'closed';
      currentRound: number;
      totalRounds: number;
      phaseStartedAt: number;
      phaseEndsAt: number;
      countdownStartedAt: number | null;
      players: any[];
      playerCount: number;
      maxPlayers: number;
      minPlayers: number;
      grossPool: number;
      netPool: number;
      elapsed: number | null;
      myPlayerId: string | null;
      roundConfig: any | null;
      winner: { id: string; username: string; cumulativeScore: number; payout: number } | null;
    }>(`/v1/battles/${roomId}`),

  reportTournamentMultiplier: (roomId: string, round: number, finalMultiplier: number) =>
    apiFetch('/v1/battles/' + roomId + '/report', {
      method: 'POST',
      body: JSON.stringify({ round, finalMultiplier }),
    }),

  leaveTournament: (roomId: string) =>
    apiFetch('/v1/battles/' + roomId + '/leave', {
      method: 'POST',
    }),

  // Referrals / Affiliates
  getReferralCode: () =>
    apiFetch<{ code: string }>('/v1/referrals/code'),

  getReferralStats: () =>
    apiFetch<{
      referralCode: string;
      referredCount: number;
      totalWagered: number;
      totalEarned: number;
      claimable: number;
      referredUsers: Array<{
        username: string;
        joinedAt: string;
        totalWagered: number;
        yourEarnings: number;
      }>;
    }>('/v1/referrals/stats'),

  claimReferralEarnings: () =>
    apiFetch<{ success: boolean; claimed?: number; message?: string }>(
      '/v1/referrals/claim', { method: 'POST' },
    ),

  // Chat
  getChatMessages: (channel?: string, after?: string) => {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (after) params.set('after', after);
    return apiFetch<{
      messages: Array<{
        id: string;
        userId: string;
        username: string;
        message: string;
        channel: string;
        createdAt: string;
      }>;
    }>(`/v1/chat/messages?${params.toString()}`);
  },

  sendChatMessage: (message: string, channel?: string) =>
    apiFetch<{
      id: string;
      userId: string;
      username: string;
      message: string;
      createdAt: string;
    }>('/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ message, channel }),
    }),

  // Tips
  sendTip: (data: { recipientUsername: string; amount: number; message?: string }) =>
    apiFetch<{ success: boolean; amount: number; recipient: string; tipId: string }>('/v1/tips/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTipHistory: () =>
    apiFetch<{ tips: Array<{ id: string; type: string; amount: number; metadata: any; createdAt: string }> }>('/v1/tips/history'),

  // Fairness
  verifyRoundFairness: (roundId: string) =>
    apiFetch(`/v1/fairness/${roundId}`),

  // Season Pass
  getSeasonStatus: () =>
    apiFetch<{ seasonNumber: number; playerLevel: number; claimedFree: number[]; claimedPremium: number[]; hasPremium: boolean }>('/v1/season/status'),

  claimSeasonReward: (level: number, track: 'free' | 'premium') =>
    apiFetch<{ success: boolean; amount: number; newBalance: number }>('/v1/season/claim', {
      method: 'POST',
      body: JSON.stringify({ level, track }),
    }),

  // Predictions
  savePredictionRound: (data: { direction: string; betAmount: number; result: string; payout: number; multiplier: number; pattern?: string }) =>
    apiFetch<{ success: boolean; id: string }>('/v1/predictions/save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPredictionHistory: (limit?: number) =>
    apiFetch<{ data: Array<{ id: string; direction: string; betAmount: number; result: string; payout: number; multiplier: string; pattern: string | null; createdAt: string }> }>(`/v1/predictions/history?limit=${limit || 20}`),

  // Player Profile
  getPlayerProfile: (id: string) =>
    apiFetch(`/v1/users/${id}/profile`),

  searchUsers: (q: string) =>
    apiFetch<{ data: Array<{ id: string; username: string; level: number; vipTier: string; avatarUrl: string | null; roundsPlayed: number }> }>(`/v1/users/search?q=${encodeURIComponent(q)}`),

  // Tournament History
  getTournamentHistory: (limit?: number) =>
    apiFetch(`/v1/battles/history?limit=${limit || 20}`),

  // Spectate
  spectateTournament: (roomId: string) =>
    apiFetch(`/v1/battles/${roomId}/spectate`),
};
