import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';
import { GamesSheet } from '../primitives/GamesSheet';

const TABS = [
  { id: 'lobby', label: 'Casino', icon: 'grid' },
  { id: 'games', label: 'Games', icon: 'play' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'settings', label: 'Profile', icon: 'gear' },
] as const;

// Game screen IDs that should highlight the "Games" tab
const GAME_SCREENS = ['solo', 'setup', 'prediction', 'trading-sim', 'candleflip', 'rug-game', 'playing', 'result'];

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
    if (tabId === 'rewards') return screen === 'rewards' || screen === 'season';
    if (tabId === 'settings') return screen === 'settings';
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
              {/* Dot indicator above icon */}
              <div style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: isActive ? theme.accent.primary : 'transparent',
                marginBottom: 4,
                transition: 'background 0.15s ease',
              }} />
              <NavIcon
                name={tab.icon}
                size={24}
                color={isActive ? theme.accent.primary : theme.text.muted}
              />
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? theme.accent.primary : theme.text.muted,
                marginTop: 2,
                letterSpacing: '0.02em',
                transition: 'color 0.15s ease',
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
    background: theme.bg.sidebar,
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
