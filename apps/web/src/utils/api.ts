// ─── API Client ──────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredCallback(cb: () => void) {
  _onSessionExpired = cb;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('accessToken', token);
    // Schedule proactive refresh 5 min before expiry (token lasts 1h)
    scheduleTokenRefresh();
  } else {
    localStorage.removeItem('accessToken');
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  }
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

function scheduleTokenRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  // Parse JWT exp to calculate actual time until expiry, refresh 5 min before
  let delayMs = 55 * 60 * 1000; // default 55 min
  try {
    const token = accessToken || localStorage.getItem('accessToken');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp) {
        const expiresInMs = payload.exp * 1000 - Date.now();
        delayMs = Math.max(10_000, expiresInMs - 5 * 60 * 1000); // 5 min before expiry, min 10s
      }
    }
  } catch { /* fallback to default */ }
  _refreshTimer = setTimeout(async () => {
    try {
      await refreshTokenCall();
    } catch {
      // Will be caught on next API call
    }
  }, delayMs);
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('accessToken');
    if (accessToken) scheduleTokenRefresh();
  }
  return accessToken;
}

async function refreshTokenCall(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const storedRefresh = getRefreshToken();
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
    } catch {
      setAccessToken(null);
      setRefreshToken(null);
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
    ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
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
      await refreshTokenCall();
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch {
      // Refresh failed — force logout and clear token
      setAccessToken(null);
      _onSessionExpired?.();
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
    return _serverConfig ?? { feeRate: 0.03, minBetLamports: 1_000_000, maxBetLamports: 10_000_000_000 };
  }
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (data: { email: string; username: string; password: string; referralCode?: string }) =>
    apiFetch<{ accessToken: string; refreshToken?: string; userId: string }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiFetch<{ accessToken: string; refreshToken?: string; userId: string }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiFetch('/v1/auth/logout', { method: 'POST' }),

  // Auth - Set Password
  setPassword: (data: { email?: string; password: string }) =>
    apiFetch<{ success: boolean }>('/v1/auth/set-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Referral - Update Code
  updateReferralCode: (code: string) =>
    apiFetch<{ success: boolean; code: string }>('/v1/referrals/code', {
      method: 'PATCH',
      body: JSON.stringify({ code }),
    }),

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

  getRecentRounds: (limit?: number) =>
    apiFetch<{ data: any[] }>(`/v1/rounds/recent?limit=${limit || 20}`),

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
    apiFetch<{ accessToken: string; refreshToken?: string; userId: string; isNewAccount: boolean }>('/v1/auth/wallet/verify', {
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

  getActiveDeposits: () =>
    apiFetch<{
      active: Array<{
        id: string; status: string; amount: string; txHash: string;
        confirmations: number; requiredConfirmations: number;
        confirmedAt: string | null; createdAt: string;
      }>;
      lastConfirmed: { id: string; amount: string; txHash: string; confirmedAt: string | null } | null;
    }>('/v1/wallet/deposits/active'),

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
  getBonusStatus: () =>
    apiFetch<{
      claimed: boolean;
      bonusAmount: number;
      profitRequired: number;
      currentProfit: number;
      withdrawalUnlocked: boolean;
    }>('/v1/wallet/bonus-status'),

  redeemBonusCode: (code: string) =>
    apiFetch<{ success: boolean; message: string; amount: number }>('/v1/wallet/redeem-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // Rewards
  getMissions: () =>
    apiFetch<{ data: Array<{ id: string; title: string; description: string; progress: number; target: number; reward: number; completed: boolean; claimed: boolean }> }>('/v1/rewards/missions'),

  claimMission: (id: string) =>
    apiFetch<{ success: boolean; message?: string; amount?: number }>(`/v1/rewards/missions/${id}/claim`, { method: 'POST' }),

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
  lockPrediction: (betAmount: number, direction: 'up' | 'down' | 'sideways') =>
    apiFetch<{ success: boolean; lockRef: string; fee: number; chartDirection: 'up' | 'down' | 'sideways' }>('/v1/predictions/lock', {
      method: 'POST',
      body: JSON.stringify({ betAmount, direction }),
    }),

  savePredictionRound: (data: { lockRef: string; direction: string; result: string; pattern?: string }) =>
    apiFetch<{ success: boolean; id: string; payout: number; xpGained: number; result: 'win' | 'loss' }>('/v1/predictions/save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPredictionHistory: (limit?: number) =>
    apiFetch<{ data: Array<{ id: string; direction: string; betAmount: number; result: string; payout: number; multiplier: string; pattern: string | null; createdAt: string }> }>(`/v1/predictions/history?limit=${limit || 20}`),

  getRecentPredictions: (limit?: number) =>
    apiFetch<{ data: any[] }>(`/v1/predictions/recent?limit=${limit || 20}`),

  // Player Profile
  getPlayerProfile: (id: string) =>
    apiFetch(`/v1/users/${id}/profile`),

  searchUsers: (q: string) =>
    apiFetch<{ data: Array<{ id: string; username: string; level: number; vipTier: string; avatarUrl: string | null; roundsPlayed: number }> }>(`/v1/users/search?q=${encodeURIComponent(q)}`),

  // Online count
  getOnlineCount: () =>
    apiFetch<{ onlineCount: number }>('/v1/chat/online'),

  // Lottery (Powerball-style)
  getLotteryCurrentDraw: () =>
    apiFetch<any>('/v1/lottery/current'),

  getLotteryDraw: (id: string) =>
    apiFetch<any>(`/v1/lottery/draw/${id}`),

  getLotteryDrawByNumber: (num: number) =>
    apiFetch<any>(`/v1/lottery/draw/number/${num}`),

  getLotteryHistory: (limit?: number) =>
    apiFetch<any[]>(`/v1/lottery/history?limit=${limit || 10}`),

  getLotteryPrizes: (drawId: string) =>
    apiFetch<any>(`/v1/lottery/prizes/${drawId}`),

  buyLotteryTickets: (drawId: string, tickets: { entryType: string; numbers: number[]; gemBall: number }[]) =>
    apiFetch<{ tickets: any[]; totalCost: string; ticketCount: number }>('/v1/lottery/buy', {
      method: 'POST',
      body: JSON.stringify({ drawId, tickets }),
    }),

  getMyLotteryTickets: (drawId?: string) =>
    apiFetch<any[]>(drawId ? `/v1/lottery/my-tickets/${drawId}` : '/v1/lottery/my-tickets'),

  autoFillLotteryNumbers: (count: number) =>
    apiFetch<{ numbers: number[]; gemBall: number }[]>('/v1/lottery/auto-fill', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  // Trading Sim
  getTradingSimRooms: () =>
    apiFetch<{ rooms: any[] }>('/v1/trading-sim/rooms'),

  getTradingSimRecent: (limit = 20) =>
    apiFetch<{ rooms: any[] }>(`/v1/trading-sim/recent?limit=${limit}`),

  createTradingSimRoom: (entryFee: number, maxPlayers: number) =>
    apiFetch<{ room: any }>('/v1/trading-sim/create', {
      method: 'POST',
      body: JSON.stringify({ entryFee, maxPlayers }),
    }),

  joinTradingSimRoom: (roomId: string) =>
    apiFetch<{ room: any }>('/v1/trading-sim/join', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    }),

  executeTradingSimTrade: (roomId: string, tradeType: string, quantity: number, price: number, timestamp: number) =>
    apiFetch<{ success: boolean }>('/v1/trading-sim/trade', {
      method: 'POST',
      body: JSON.stringify({ roomId, tradeType, quantity, price, timestamp }),
    }),

  getTradingSimRoom: (roomId: string) =>
    apiFetch<{ room: any }>(`/v1/trading-sim/room/${roomId}`),

  startTradingSimRoom: (roomId: string) =>
    apiFetch<{ room: any }>('/v1/trading-sim/start', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    }),

  // ─── Candleflip (Public Rounds) ──────────────────────────────

  getCandleflipRound: () =>
    apiFetch<{ round: any }>('/v1/candleflip/round'),

  betCandleflipRound: (pick: 'bullish' | 'bearish', betAmount: number) =>
    apiFetch<{ success: boolean; message?: string }>('/v1/candleflip/bet', {
      method: 'POST',
      body: JSON.stringify({ pick, betAmount }),
    }),

  getCandleflipRecentRounds: (limit = 10) =>
    apiFetch<{ rounds: any[] }>(`/v1/candleflip/rounds/recent?limit=${limit}`),

  // Legacy candleflip endpoints (backward compat)
  getCandleflipLobbies: () =>
    apiFetch<{ lobbies: any[] }>('/v1/candleflip/lobbies'),

  getCandleflipRecent: (limit = 20) =>
    apiFetch<{ results: any[] }>(`/v1/candleflip/recent?limit=${limit}`),

  getCandleflipGame: (gameId: string) =>
    apiFetch<{ game: any }>(`/v1/candleflip/game/${gameId}`),

  getCandleflipHistory: (limit = 20) =>
    apiFetch<{ games: any[] }>(`/v1/candleflip/history?limit=${limit}`),

  // ─── Rug Game (Public Rounds) ────────────────────────────────

  getRugGameRound: () =>
    apiFetch<{ round: any }>('/v1/rug-game/round'),

  joinRugGameRound: (betAmount: number) =>
    apiFetch<{ success: boolean; message?: string }>('/v1/rug-game/join', {
      method: 'POST',
      body: JSON.stringify({ betAmount }),
    }),

  cashOutRugGameRound: (roundId: string) =>
    apiFetch<{ success: boolean; multiplier?: number; payout?: number; message?: string }>('/v1/rug-game/round-cashout', {
      method: 'POST',
      body: JSON.stringify({ roundId }),
    }),

  getRugGameRecentRounds: (limit = 10) =>
    apiFetch<{ rounds: any[] }>(`/v1/rug-game/rounds/recent?limit=${limit}`),

  // Legacy rug game endpoints (backward compat)
  startRugGame: (betAmount: number) =>
    apiFetch<{ game: any }>('/v1/rug-game/start', {
      method: 'POST',
      body: JSON.stringify({ betAmount }),
    }),

  cashOutRugGame: (gameId: string, multiplier: number) =>
    apiFetch<{ game: any }>('/v1/rug-game/cashout', {
      method: 'POST',
      body: JSON.stringify({ gameId, multiplier }),
    }),

  getRugGameRecent: (limit = 20) =>
    apiFetch<{ games: any[] }>(`/v1/rug-game/recent?limit=${limit}`),

  getRugGame: (gameId: string) =>
    apiFetch<{ game: any }>(`/v1/rug-game/game/${gameId}`),

  getActiveRugGame: () =>
    apiFetch<{ game: any | null }>('/v1/rug-game/active'),

  getRugGameHistory: (limit = 20) =>
    apiFetch<{ games: any[] }>(`/v1/rug-game/history?limit=${limit}`),

  // P&L History
  getPnlHistory: () =>
    apiFetch<{ data: Array<{ date: string; balance: number }> }>('/v1/wallet/pnl-history'),

  // Activity Feed
  getActivityFeed: (limit?: number, after?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (after) params.set('after', after);
    return apiFetch<{
      data: Array<{
        id: number;
        feedType: string;
        userId: string;
        payload: any;
        createdAt: string;
      }>;
    }>(`/v1/activity/feed?${params.toString()}`);
  },

  getDailyMissions: () =>
    apiFetch<{ missions: Array<{ id: string; title: string; description: string; target: number; progress: number; xpReward: number; completed: boolean; claimed: boolean }> }>('/v1/missions/daily'),

  claimDailyMission: (missionId: string) =>
    apiFetch<{ success: boolean; xpReward: number }>(`/v1/missions/claim/${missionId}`, { method: 'POST' }),

  demoRefill: () =>
    apiFetch<{ success: boolean; demoBalance: number; refillsUsed: number; refillsRemaining: number; message?: string; nextRefillAt?: string }>('/v1/users/me/demo-refill', { method: 'POST' }),

  getReturnHooks: () =>
    apiFetch<{ hooks: Array<{ type: string; priority: number; icon: string; title: string; subtitle: string; cta?: string }> }>('/v1/hooks/active'),

  getMyBets: (limit?: number, game?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (game) params.set('game', game);
    return apiFetch<{
      data: Array<{
        id: number;
        feedType: string;
        userId: string;
        payload: any;
        createdAt: string;
      }>;
    }>(`/v1/activity/feed/me?${params.toString()}`);
  },

  // Tournament (stubs — feature not yet implemented)
  getTournamentRoom: (_roomId: string): Promise<any> => {
    throw new Error('Tournaments coming soon');
  },
  reportTournamentMultiplier: (_roomId: string, _round: number, _multiplier: number): Promise<any> => {
    throw new Error('Tournaments coming soon');
  },

  // Weekly Race
  getWeeklyRace: (limit?: number) =>
    apiFetch<{ data: any }>(`/v1/races/current?limit=${limit || 50}`),

  getWeeklyRaceMyRank: () =>
    apiFetch<{ data: { rank: number | null; wagered: number; betCount: number } }>('/v1/races/current/my-rank'),

  getWeeklyRaceHistory: (limit?: number) =>
    apiFetch<{ data: any[] }>(`/v1/races/history?limit=${limit || 4}`),

};
