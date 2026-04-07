import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { SoloSetupScreen } from './components/screens/SoloSetupScreen';
import { PredictionScreen } from './components/screens/PredictionScreen';
import { FairnessScreen } from './components/screens/FairnessScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { AdminScreen } from './components/screens/AdminScreen';
import { PlayerProfileScreen } from './components/screens/PlayerProfileScreen';
import { TradingSimScreen } from './components/screens/TradingSimScreen';
import { CandleflipScreen } from './components/screens/CandleflipScreen';
import { RugGameScreen } from './components/screens/RugGameScreen';
import { MinesScreen } from './components/screens/MinesScreen';
import { MyBetsScreen } from './components/screens/MyBetsScreen';
import { AboutScreen } from './components/screens/AboutScreen';
import { ResponsibleGamblingScreen } from './components/screens/ResponsibleGamblingScreen';
import { PrivacyScreen } from './components/screens/PrivacyScreen';
import { TermsScreen } from './components/screens/TermsScreen';
import { FAQScreen } from './components/screens/FAQScreen';
import { SessionTimeReminder } from './components/ResponsibleGambling';

import { ChatPanel } from './components/ChatPanel';
import { ChatToggle } from './components/layout/ChatToggle';
import { ToastOverlay } from './components/ToastOverlay';
import { PATH_TO_SCREEN, SCREEN_TO_PATH } from './hooks/useAppNavigate';
import { getServerConfig, getAccessToken, setSessionExpiredCallback } from './utils/api';
import { connectWebSocket, disconnectWebSocket, useWebSocket } from './utils/ws';
import { requestNotificationPermission, notifyDeposit } from './utils/notifications';
import './styles/global.css';

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const syncProfile = useGameStore((state) => state.syncProfile);
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Check auth on mount + register session expiry handler
  useEffect(() => {
    checkAuth().finally(() => setAuthChecked(true));
    // M1 fix: prefetch server config (fee rate, etc.) and cache globally
    getServerConfig().then(cfg => {
      (globalThis as any).__serverFeeRate = cfg.feeRate;
    });
    // Auto-logout when session expires (prevents 401 spam loop)
    setSessionExpiredCallback(() => {
      useAuthStore.getState().logout();
    });
  }, [checkAuth]);

  // Sync profile from server when authenticated + connect WebSocket
  useEffect(() => {
    if (isAuthenticated) {
      syncProfile();
      // Connect WebSocket for real-time updates
      const token = getAccessToken();
      if (token) connectWebSocket(token);
      // Request notification permission (non-blocking)
      requestNotificationPermission();
    } else {
      disconnectWebSocket();
    }
  }, [isAuthenticated, syncProfile]);

  // Auto-refresh balance when a deposit is confirmed via WebSocket
  useWebSocket('deposit_confirmed', (msg: any) => {
    syncProfile();
    if (msg?.amount) notifyDeposit(Number(msg.amount));
  });

  // Sync URL → store on first load and browser back/forward
  useEffect(() => {
    const screenFromPath = PATH_TO_SCREEN[location.pathname];
    if (screenFromPath && screenFromPath !== screen) {
      setScreen(screenFromPath as any);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store → URL when screen changes programmatically
  useEffect(() => {
    const expectedPath = SCREEN_TO_PATH[screen] || '/';
    if (location.pathname !== expectedPath) {
      // Don't override the URL if it already maps to a valid screen
      // (prevents race condition on initial load where screen is still 'lobby'
      //  but the URL already points to a valid deep-linked screen)
      const currentUrlScreen = PATH_TO_SCREEN[location.pathname];
      if (currentUrlScreen && currentUrlScreen !== screen) return;
      navigate(expectedPath, { replace: true });
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show nothing until auth check completes
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0b0f' }} />
    );
  }

  // Playing screen — keep header visible per user requirement
  if (screen === 'playing') {
    return (
      <AppLayout>
        <PlayingScreen />
        <ToastOverlay />
      </AppLayout>
    );
  }

  // All other screens get the full layout shell
  const authOverlay = screen === 'auth' ? (
    <AuthScreen onSuccess={() => {
      syncProfile();
      setScreen('lobby');
      navigate('/');
    }} />
  ) : null;

  return (
    <>
      <AppLayout>

        {(screen === 'lobby' || screen === 'auth') && <LobbyScreen />}
        {screen === 'setup' && <SoloSetupScreen />}
        {screen === 'result' && <ResultScreen />}
        {screen === 'wallet' && <WalletScreen />}
        {screen === 'history' && <HistoryScreen />}
        {screen === 'leaderboard' && <LeaderboardScreen />}
        {screen === 'rewards' && <RewardsScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'prediction' && <PredictionScreen />}
        {screen === 'fairness' && <FairnessScreen />}
        {screen === 'season' && <SeasonScreen />}
        {screen === 'admin' && <AdminScreen />}
        {screen === 'profile' && <PlayerProfileScreen />}
        {screen === 'trading-sim' && <TradingSimScreen />}
        {screen === 'candleflip' && <CandleflipScreen />}
        {screen === 'rug-game' && <RugGameScreen />}
        {screen === 'mines' && <MinesScreen />}
        {screen === 'my-bets' && <MyBetsScreen />}
        {screen === 'about' && <AboutScreen />}
        {screen === 'responsible-gambling' && <ResponsibleGamblingScreen />}
        {screen === 'privacy' && <PrivacyScreen />}
        {screen === 'terms' && <TermsScreen />}
        {screen === 'faq' && <FAQScreen />}
        {/* Chat disabled for now */}
        {/* {isAuthenticated && <ChatToggle />} */}
        {/* {isAuthenticated && <ChatPanel />} */}
        <SessionTimeReminder />
        <ToastOverlay />
      </AppLayout>
      {authOverlay}
    </>
  );
}
