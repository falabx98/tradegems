import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * Screen → URL path mapping.
 * Every screen value in gameStore maps to a URL route.
 */
export const SCREEN_TO_PATH: Record<string, string> = {
  lobby: '/',
  auth: '/auth',
  setup: '/solo',
  playing: '/play',
  result: '/result',
  wallet: '/wallet',
  history: '/history',
  leaderboard: '/leaderboard',
  rewards: '/rewards',
  settings: '/settings',
  battle: '/tournament',
  prediction: '/predictions',
  fairness: '/fairness',
  season: '/season',
  admin: '/admin',
  profile: '/player',
};

export const PATH_TO_SCREEN: Record<string, string> = Object.fromEntries(
  Object.entries(SCREEN_TO_PATH).map(([screen, path]) => [path, screen])
);

/**
 * Custom hook that wraps react-router-dom navigate
 * and also updates the zustand screen state.
 */
export function useAppNavigate() {
  const navigate = useNavigate();
  const setScreen = useGameStore((s) => s.setScreen);

  const go = useCallback((screen: string) => {
    const path = SCREEN_TO_PATH[screen] || '/';
    setScreen(screen as any);
    navigate(path);
  }, [navigate, setScreen]);

  return go;
}
