import { useEffect, useState } from 'react';
import { useGameStore } from './stores/gameStore';
import { useAuthStore } from './stores/authStore';
import { AppLayout } from './components/layout/AppLayout';
import { AuthScreen } from './components/screens/AuthScreen';
import { LobbyScreen } from './components/screens/LobbyScreen';
import { PlayingScreen } from './components/screens/PlayingScreen';
import { ResultScreen } from './components/screens/ResultScreen';
import { WalletScreen } from './components/screens/WalletScreen';
import { HistoryScreen } from './components/screens/HistoryScreen';
import { LeaderboardScreen } from './components/screens/LeaderboardScreen';
import { RewardsScreen } from './components/screens/RewardsScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import './styles/global.css';

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const syncProfile = useGameStore((state) => state.syncProfile);
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth().finally(() => setAuthChecked(true));
  }, [checkAuth]);

  // Sync profile from server when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      syncProfile();
    }
  }, [isAuthenticated, syncProfile]);

  // Show nothing until auth check completes
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0b0f' }} />
    );
  }

  // Playing screen gets full immersion (no top bar / side nav)
  if (screen === 'playing') {
    return (
      <AppLayout hideChrome>
        <PlayingScreen />
      </AppLayout>
    );
  }

  // All other screens get the full layout shell
  // Auth screen overlays on top of the lobby
  return (
    <AppLayout>
      {(screen === 'lobby' || screen === 'auth') && <LobbyScreen />}
      {screen === 'setup' && <LobbyScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'wallet' && <WalletScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'leaderboard' && <LeaderboardScreen />}
      {screen === 'rewards' && <RewardsScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'auth' && (
        <AuthScreen onSuccess={() => {
          syncProfile();
          setScreen('lobby');
        }} />
      )}
    </AppLayout>
  );
}
