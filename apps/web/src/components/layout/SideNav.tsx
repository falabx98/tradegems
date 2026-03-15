import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';
import { apiFetch } from '../../utils/api';

const NAV_ITEMS = [
  { id: 'lobby', label: 'Lobby', icon: 'grid' },
  { id: 'solo', label: 'Solo', icon: 'play' },
  { id: 'prediction', label: 'Predict', icon: 'candles' },
  { id: 'trading-sim', label: 'Trading', icon: 'chart' },
  { id: 'lottery', label: 'Lottery', icon: 'diamond' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'season', label: 'Season', icon: 'star' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
] as const;

const BOTTOM_ITEMS = [
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'fairness', label: 'Fair', icon: 'shield' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
] as const;

export function SideNav() {
  const screen = useGameStore((s) => s.screen);
  const go = useAppNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setIsAdmin(false); return; }
    apiFetch<{ role: string }>('/v1/users/me')
      .then((me) => setIsAdmin(me.role === 'admin' || me.role === 'superadmin'))
      .catch(() => setIsAdmin(false));
  }, [isAuthenticated]);

  const activeId = screen === 'setup' ? 'solo' : screen;

  const handleNav = (id: string) => {
    playButtonClick();
    hapticLight();
    if (id === 'solo') {
      go('setup');
    } else {
      go(id);
    }
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.topSection}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
              title={item.label}
            >
              <NavIcon
                name={item.icon}
                size={19}
                color={isActive ? theme.accent.purple : theme.text.muted}
              />
              <span style={{
                ...styles.navLabel,
                color: isActive ? theme.accent.purple : theme.text.muted,
                fontWeight: isActive ? 700 : 500,
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div style={styles.bottomSection}>
        <div style={styles.divider} />
        {isAdmin && (
          <button
            onClick={() => handleNav('admin')}
            style={{
              ...styles.navItem,
              ...(activeId === 'admin' ? styles.navItemActive : {}),
            }}
            title="Admin"
          >
            <NavIcon name="shield" size={19} color={activeId === 'admin' ? '#ef4444' : '#ef4444'} />
            <span style={{
              ...styles.navLabel,
              color: activeId === 'admin' ? '#ef4444' : theme.text.muted,
            }}>
              Admin
            </span>
          </button>
        )}
        {BOTTOM_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
              title={item.label}
            >
              <NavIcon
                name={item.icon}
                size={19}
                color={isActive ? theme.accent.purple : theme.text.muted}
              />
              <span style={{
                ...styles.navLabel,
                color: isActive ? theme.accent.purple : theme.text.muted,
                fontWeight: isActive ? 700 : 500,
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: theme.layout.sidebarWidth,
    background: theme.bg.card,
    borderRight: `1px solid ${theme.border.subtle}`,
    padding: '8px 0',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative' as const,
    zIndex: 2,
  },
  topSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 6px',
  },
  bottomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 6px',
  },
  divider: {
    height: '1px',
    background: theme.border.subtle,
    margin: '4px 6px 8px',
  },
  navItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    padding: '8px 2px 6px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  navItemActive: {
    background: 'rgba(139, 92, 246, 0.1)',
    borderRadius: '8px',
  },
  navLabel: {
    fontSize: '9px',
    fontWeight: 500,
    textAlign: 'center' as const,
    letterSpacing: '0.3px',
    lineHeight: 1.2,
  },
};
