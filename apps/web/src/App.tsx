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
import { BattleScreen } from './components/screens/BattleScreen';
import { StatsScreen } from './components/screens/StatsScreen';
import { PredictionScreen } from './components/screens/PredictionScreen';
import { OnboardingModal, useOnboarding } from './components/OnboardingModal';
import { ChatPanel } from './components/ChatPanel';
import { ChatToggle } from './components/layout/ChatToggle';
import { ToastOverlay } from './components/ToastOverlay';
import './styles/global.css';

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const syncProfile = useGameStore((state) => state.syncProfile);
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);
  const { showOnboarding, closeOnboarding } = useOnboarding();

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
        <ToastOverlay />
      </AppLayout>
    );
  }

  // All other screens get the full layout shell
  // Auth screen overlays on top of the lobby
  return (
    <AppLayout>
      {showOnboarding && !isAuthenticated && (
        <OnboardingModal onClose={() => {
          closeOnboarding();
          if (!isAuthenticated) setScreen('auth');
        }} />
      )}
      {(screen === 'lobby' || screen === 'auth') && <LobbyScreen />}
      {screen === 'setup' && <LobbyScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'wallet' && <WalletScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'leaderboard' && <LeaderboardScreen />}
      {screen === 'rewards' && <RewardsScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'battle' && <BattleScreen />}
      {screen === 'prediction' && <PredictionScreen />}
      {screen === 'auth' && (
        <AuthScreen onSuccess={() => {
          syncProfile();
          setScreen('lobby');
        }} />
      )}
      {isAuthenticated && <ChatToggle />}
      {isAuthenticated && <ChatPanel />}
      <ToastOverlay />
    </AppLayout>
  );
}
