import { create } from 'zustand';
import { api, setAccessToken, getAccessToken } from '../utils/api';
import { connectPhantom, signMessage, disconnectPhantom } from '../utils/phantom';

interface AuthState {
  userId: string | null;
  username: string | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  register: (email: string, username: string, password: string, referralCode?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  connectWallet: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  username: null,
  walletAddress: null,
  isAuthenticated: !!getAccessToken(),
  isLoading: false,
  error: null,

  register: async (email, username, password, referralCode?) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.register({ email, username, password, referralCode: referralCode || undefined });
      setAccessToken(res.accessToken);
      set({
        userId: res.userId,
        username,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.login({ email, password });
      setAccessToken(res.accessToken);
      set({
        userId: res.userId,
        isAuthenticated: true,
        isLoading: false,
      });
      try {
        const me = await api.getMe();
        set({ username: me.username });
      } catch {}
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  connectWallet: async () => {
    set({ isLoading: true, error: null });
    try {
      const address = await connectPhantom();
      const { nonce, message } = await api.walletChallenge(address);
      const signature = await signMessage(message);
      const res = await api.walletVerify({ address, signature, nonce });
      setAccessToken(res.accessToken);
      set({
        userId: res.userId,
        walletAddress: address,
        isAuthenticated: true,
        isLoading: false,
      });
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
    try {
      await api.logout();
    } catch {}
    try {
      await disconnectPhantom();
    } catch {}
    setAccessToken(null);
    set({
      userId: null,
      username: null,
      walletAddress: null,
      isAuthenticated: false,
    });
  },

  checkAuth: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const me = await api.getMe();
      set({
        userId: me.id,
        username: me.username,
        isAuthenticated: true,
      });
    } catch {
      setAccessToken(null);
      set({ isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null }),
}));
