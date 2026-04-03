import { create } from 'zustand';
import { api, setAccessToken, getAccessToken, setRefreshToken } from '../utils/api';

import { funnelTrack, track } from '../utils/analytics';

interface AuthState {
  userId: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  register: (email: string, username: string, password: string, referralCode?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  username: null,
  isAuthenticated: !!getAccessToken(),
  isLoading: false,
  error: null,

  register: async (email, username, password, referralCode?) => {
    set({ isLoading: true, error: null });
    funnelTrack.authStart();
    try {
      const res = await api.register({ email, username, password, referralCode: referralCode || undefined });
      setAccessToken(res.accessToken);
      if (res.refreshToken) setRefreshToken(res.refreshToken);
      set({
        userId: res.userId,
        username,
        isAuthenticated: true,
        isLoading: false,
      });
      funnelTrack.authComplete();
      track('auth.signup_completed');
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      track('auth.signup_failed', { reason: err.message });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    funnelTrack.authStart();
    try {
      const res = await api.login({ email, password });
      setAccessToken(res.accessToken);
      if (res.refreshToken) setRefreshToken(res.refreshToken);
      set({
        userId: res.userId,
        isAuthenticated: true,
        isLoading: false,
      });
      funnelTrack.authComplete();
      track('auth.login_completed');
      try {
        const me = await api.getMe();
        set({ username: me.username });
      } catch {}
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    track('auth.logout');
    try {
      await api.logout();
    } catch {}
    setAccessToken(null);
    setRefreshToken(null);
    set({
      userId: null,
      username: null,
      isAuthenticated: false,
    });
    // Reset game state to prevent data leaking to next user
    const { resetRound } = await import('./gameStore').then(m => m.useGameStore.getState());
    resetRound();
  },

  checkAuth: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      // apiFetch auto-refreshes on 401, so if this succeeds the session is valid
      const me = await api.getMe();
      set({
        userId: me.id,
        username: me.username,
        isAuthenticated: true,
      });
    } catch (err: any) {
      // Only clear auth if it's truly a session error (not a network issue)
      if (err?.status === 401 || err?.code === 'SESSION_EXPIRED') {
        setAccessToken(null);
        setRefreshToken(null);
        set({ isAuthenticated: false });
      }
      // For network errors, keep the token — user might just be offline
    }
  },

  clearError: () => set({ error: null }),
}));
