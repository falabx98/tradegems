import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';

const TABS = [
  { id: 'lobby', label: 'Lobby', icon: 'grid' },
  { id: 'solo', label: 'Solo', icon: 'play' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'more', label: 'More', icon: 'more' },
] as const;

const MORE_ITEMS = [
  { id: 'prediction', label: 'Predict', icon: 'candles' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
] as const;

export function BottomNav() {
  const screen = useGameStore((s) => s.screen);
  const go = useAppNavigate();
  const [showMore, setShowMore] = useState(false);

  const activeId = screen === 'setup' ? 'solo' : screen;
  const isMoreActive = MORE_ITEMS.some((m) => m.id === activeId);

  const handleTab = (id: string) => {
    playButtonClick();
    hapticLight();
    if (id === 'more') {
      setShowMore((v) => !v);
      return;
    }
    setShowMore(false);
    if (id === 'solo') {
      go('setup');
    } else {
      go(id);
    }
  };

  const handleMoreItem = (id: string) => {
    playButtonClick();
    hapticLight();
    setShowMore(false);
    go(id);
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
                  <NavIcon name={item.icon} size={20} color={isActive ? theme.accent.violet : theme.text.secondary} />
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isActive ? '#fff' : theme.text.primary,
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
                size={22}
                color={isActive ? '#fff' : theme.text.muted}
              />
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: isActive ? '#fff' : theme.text.muted,
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
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 199,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: '72px',
  },
  moreMenu: {
    background: theme.bg.card,
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
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  moreItemActive: {
    background: 'rgba(52, 56, 67, 0.6)',
  },
};
