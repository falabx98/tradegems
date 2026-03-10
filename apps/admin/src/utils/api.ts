// ─── Admin API Client ────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('admin_accessToken', token);
  } else {
    localStorage.removeItem('admin_accessToken');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('admin_accessToken');
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

// ─── Admin API Methods ───────────────────────────────────────────────────────

export const adminApi = {
  // Auth (reuses player auth endpoints)
  login: (data: { email: string; password: string }) =>
    apiFetch<{ accessToken: string; userId: string }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () =>
    apiFetch<{ id: string; username: string; email: string; role: string }>('/v1/users/me'),

  // ─── Dashboard ──────────────────────────────────────
  getDashboardKpis: (period: string = '24h') =>
    apiFetch(`/v1/admin/dashboard/kpis?period=${period}`),

  getDashboardStats: () =>
    apiFetch('/v1/admin/dashboard/stats'),

  // ─── Users ──────────────────────────────────────────
  getUsers: (params: { limit?: number; offset?: number; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.search) q.set('search', params.search);
    return apiFetch<{ data: unknown[] }>(`/v1/admin/users?${q}`);
  },

  getUserDetail: (id: string) =>
    apiFetch(`/v1/admin/users/${id}`),

  updateUser: (id: string, data: { status?: string; role?: string }) =>
    apiFetch(`/v1/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  adjustBalance: (userId: string, data: { amount: number; reason: string; asset?: string }) =>
    apiFetch(`/v1/admin/users/${userId}/balance-adjustment`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ─── Treasury ───────────────────────────────────────
  getTreasuryOverview: () =>
    apiFetch('/v1/admin/treasury/overview'),

  getDeposits: (params: { limit?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.status) q.set('status', params.status);
    return apiFetch<{ data: unknown[] }>(`/v1/admin/treasury/deposits?${q}`);
  },

  getWithdrawals: (params: { limit?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.status) q.set('status', params.status);
    return apiFetch<{ data: unknown[] }>(`/v1/admin/treasury/withdrawals?${q}`);
  },

  updateWithdrawal: (id: string, data: { status: 'approved' | 'rejected'; reason?: string }) =>
    apiFetch(`/v1/admin/treasury/withdrawals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ─── Rounds ─────────────────────────────────────────
  getRounds: (params: { limit?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.status) q.set('status', params.status);
    return apiFetch<{ data: unknown[] }>(`/v1/admin/rounds?${q}`);
  },

  getRoundDetail: (id: string) =>
    apiFetch(`/v1/admin/rounds/${id}`),

  // ─── Fairness ───────────────────────────────────────
  getFairnessMetrics: () =>
    apiFetch('/v1/admin/fairness/metrics'),

  getFairnessRound: (id: string) =>
    apiFetch(`/v1/admin/fairness/round/${id}`),

  // ─── Engine Config ──────────────────────────────────
  getEngineConfig: () =>
    apiFetch('/v1/admin/engine-config'),

  getEngineConfigHistory: () =>
    apiFetch<{ data: unknown[] }>('/v1/admin/engine-config/history'),

  createEngineConfig: (config: unknown) =>
    apiFetch('/v1/admin/engine-config', {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),

  activateEngineConfig: (id: string) =>
    apiFetch(`/v1/admin/engine-config/${id}/activate`, {
      method: 'PATCH',
    }),

  // ─── Feature Flags ─────────────────────────────────
  getFeatureFlags: () =>
    apiFetch<unknown[]>('/v1/admin/feature-flags'),

  updateFeatureFlag: (key: string, data: { enabled?: boolean; config?: unknown }) =>
    apiFetch(`/v1/admin/feature-flags/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  createFeatureFlag: (data: { flagKey: string; description: string; enabled?: boolean; config?: unknown }) =>
    apiFetch('/v1/admin/feature-flags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ─── Risk Flags ─────────────────────────────────────
  getRiskFlags: (params: { severity?: string; resolved?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.severity) q.set('severity', params.severity);
    if (params.resolved !== undefined) q.set('resolved', String(params.resolved));
    if (params.limit) q.set('limit', String(params.limit));
    return apiFetch<{ data: unknown[] }>(`/v1/admin/risk-flags?${q}`);
  },

  resolveRiskFlag: (id: string, data: { notes: string }) =>
    apiFetch(`/v1/admin/risk-flags/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ─── Audit Logs ─────────────────────────────────────
  getAuditLogs: (params: { limit?: number; actionType?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.actionType) q.set('actionType', params.actionType);
    return apiFetch<{ data: unknown[] }>(`/v1/admin/audit-logs?${q}`);
  },

  // ─── Analytics ──────────────────────────────────────
  getTimeseries: (metric: string, period: string = '30d') =>
    apiFetch(`/v1/admin/analytics/timeseries?metric=${metric}&period=${period}`),

  getDistributions: () =>
    apiFetch('/v1/admin/analytics/distributions'),
};
