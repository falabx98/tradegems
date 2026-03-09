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

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (data: { email: string; username: string; password: string }) =>
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
    apiFetch<{ id: string; username: string; email: string; level: number; vipTier: string }>('/v1/users/me'),

  getMyStats: () =>
    apiFetch('/v1/users/me/stats'),

  getMyProgression: () =>
    apiFetch('/v1/users/me/progression'),

  // Wallet
  getBalances: () =>
    apiFetch<{ balances: { asset: string; available: string; locked: string; pending: string }[] }>('/v1/wallet/balances'),

  getTransactions: (limit?: number) =>
    apiFetch(`/v1/wallet/transactions?limit=${limit || 20}`),

  devCredit: (amount: number) =>
    apiFetch('/v1/wallet/dev/credit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

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

  // Dev
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
};
