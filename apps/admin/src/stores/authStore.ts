import { create } from 'zustand';
import { adminApi, setAccessToken, getAccessToken } from '../utils/api';

interface AuthState {
  userId: string | null;
  username: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  checkAuth: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  username: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { accessToken, userId } = await adminApi.login({ email, password });
      setAccessToken(accessToken);

      // Verify admin role
      const me = await adminApi.getMe();
      if (me.role !== 'admin' && me.role !== 'superadmin') {
        setAccessToken(null);
        set({ isLoading: false, error: 'Access denied. Admin role required.' });
        return;
      }

      set({
        userId,
        username: me.username,
        role: me.role,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ isLoading: false, error: message });
    }
  },

  checkAuth: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const me = await adminApi.getMe();
      if (me.role !== 'admin' && me.role !== 'superadmin') {
        setAccessToken(null);
        set({ isLoading: false });
        return;
      }
      set({
        userId: me.id,
        username: me.username,
        role: me.role,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      setAccessToken(null);
      set({ isLoading: false });
    }
  },

  logout: () => {
    setAccessToken(null);
    set({
      userId: null,
      username: null,
      role: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
