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
                size={20}
                color={isActive ? '#fff' : theme.accent.violet}
              />
              <span style={{
                ...styles.navLabel,
                color: isActive ? '#fff' : theme.text.muted,
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
            <NavIcon name="shield" size={20} color={activeId === 'admin' ? '#f87171' : '#f87171'} />
            <span style={{
              ...styles.navLabel,
              color: activeId === 'admin' ? '#f87171' : theme.text.muted,
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
                size={20}
                color={isActive ? '#fff' : theme.accent.violet}
              />
              <span style={{
                ...styles.navLabel,
                color: isActive ? '#fff' : theme.text.muted,
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
    background: theme.bg.secondary,
    borderRight: `1px solid ${theme.border.subtle}`,
    padding: '8px 0',
    flexShrink: 0,
    overflow: 'hidden',
  },
  topSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 8px',
  },
  bottomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 8px',
  },
  divider: {
    height: '1px',
    background: theme.border.subtle,
    margin: '4px 4px 8px',
  },
  navItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '8px 2px 6px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    fontFamily: 'inherit',
  },
  navItemActive: {
    background: 'rgba(52, 56, 67, 0.8)', // shuffle active tab color
  },
  navLabel: {
    fontSize: '9px',
    fontWeight: 600,
    textAlign: 'center' as const,
    letterSpacing: '0.3px',
    lineHeight: 1.2,
  },
};
