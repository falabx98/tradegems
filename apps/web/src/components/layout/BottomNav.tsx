import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';
import { GamesSheet } from '../primitives/GamesSheet';

const TABS = [
  { id: 'lobby', label: 'Home', icon: 'grid' },
  { id: 'games', label: 'Games', icon: 'play' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'my-bets', label: 'My Bets', icon: 'list' },
] as const;

// Game screen IDs that should highlight the "Games" tab
const GAME_SCREENS = ['solo', 'setup', 'prediction', 'trading-sim', 'candleflip', 'rug-game', 'lottery', 'playing', 'result'];

export function BottomNav() {
  const screen = useGameStore((s) => s.screen);
  const go = useAppNavigate();
  const [showGames, setShowGames] = useState(false);

  const isGameScreen = GAME_SCREENS.includes(screen);

  const handleTab = (id: string) => {
    playButtonClick();
    hapticLight();
    if (id === 'games') {
      setShowGames((v) => !v);
      return;
    }
    setShowGames(false);
    if (id === 'lobby') {
      go('lobby');
    } else {
      go(id);
    }
  };

  const getIsActive = (tabId: string) => {
    if (tabId === 'games') return isGameScreen || showGames;
    if (tabId === 'lobby') return screen === 'lobby';
    return screen === tabId;
  };

  return (
    <>
      {/* Games sheet */}
      <GamesSheet open={showGames} onClose={() => setShowGames(false)} />

      {/* Bottom tab bar */}
      <nav style={s.bar}>
        {TABS.map((tab) => {
          const isActive = getIsActive(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => handleTab(tab.id)}
              style={s.tab}
            >
              <NavIcon
                name={tab.icon}
                size={20}
                color={isActive ? theme.accent.purple : theme.text.muted}
              />
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? theme.accent.purple : theme.text.muted,
                marginTop: 2,
                letterSpacing: '0.02em',
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: theme.layout.bottomNavHeight,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    background: theme.bg.secondary,
    borderTop: `1px solid ${theme.border.subtle}`,
    zIndex: 200,
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    minHeight: '44px',
  },
};
