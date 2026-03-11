import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';

const TABS = [
  { id: 'lobby', label: 'Lobby', icon: 'grid' },
  { id: 'solo', label: 'Solo', icon: 'play' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'more', label: 'More', icon: 'more' },
] as const;

const MORE_ITEMS = [
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'battle', label: 'Battle', icon: 'swords' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
] as const;

export function BottomNav() {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);
  const [showMore, setShowMore] = useState(false);

  const activeId = screen === 'lobby' || screen === 'setup' ? 'lobby' : screen;
  const isMoreActive = MORE_ITEMS.some((m) => m.id === activeId);

  const handleTab = (id: string) => {
    if (id === 'more') {
      setShowMore((v) => !v);
      return;
    }
    setShowMore(false);
    if (id === 'lobby' || id === 'solo') {
      setScreen('lobby');
    } else {
      setScreen(id as any);
    }
  };

  const handleMoreItem = (id: string) => {
    setShowMore(false);
    if (id === 'battle') {
      setScreen('battle' as any);
    } else {
      setScreen(id as any);
    }
  };

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div style={styles.overlay} onClick={() => setShowMore(false)}>
          <div style={styles.moreMenu} onClick={(e) => e.stopPropagation()}>
            {MORE_ITEMS.map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleMoreItem(item.id)}
                  style={{
                    ...styles.moreItem,
                    ...(isActive ? styles.moreItemActive : {}),
                  }}
                >
                  <NavIcon name={item.icon} size={20} color={isActive ? '#c084fc' : theme.text.secondary} />
                  <span style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: isActive ? '#c084fc' : theme.text.primary,
                  }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = tab.id === 'more' ? isMoreActive || showMore : activeId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTab(tab.id)}
              style={styles.tab}
            >
              <NavIcon
                name={tab.icon}
                size={20}
                color={isActive ? '#c084fc' : theme.text.muted}
              />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: isActive ? '#c084fc' : theme.text.muted,
                marginTop: '2px',
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

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '56px',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    background: 'rgba(21, 15, 33, 0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
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
    fontFamily: 'Rajdhani, sans-serif',
    padding: 0,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 199,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: '68px',
  },
  moreMenu: {
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '12px',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: 'calc(100% - 32px)',
    maxWidth: '400px',
    animation: 'slideUp 0.15s ease',
  },
  moreItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
  },
  moreItemActive: {
    background: 'rgba(153, 69, 255, 0.08)',
  },
};
