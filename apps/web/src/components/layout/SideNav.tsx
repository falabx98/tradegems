import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';
import { apiFetch } from '../../utils/api';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route?: string; // override if different from id
}

const MAIN_ITEMS: NavItem[] = [
  { id: 'lobby', label: 'Main', icon: 'grid' },
];

const GAME_ITEMS: NavItem[] = [
  { id: 'solo', label: 'Solo', icon: 'play', route: 'setup' },
  { id: 'prediction', label: 'Predictions', icon: 'candles' },
  { id: 'trading-sim', label: 'Trading Sim', icon: 'chart' },
  { id: 'candleflip', label: 'Candleflip', icon: 'swords' },
  { id: 'rug-game', label: 'Rug Game', icon: 'terminal' },
  { id: 'lottery', label: 'Lottery', icon: 'diamond' },
];

const COMMUNITY_ITEMS: NavItem[] = [
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'season', label: 'Season', icon: 'star' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'fairness', label: 'Fairness', icon: 'shield' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

export function SideNav() {
  const screen = useGameStore((s) => s.screen);
  const go = useAppNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setIsAdmin(false); return; }
    apiFetch<{ role: string }>('/v1/users/me')
      .then((me) => setIsAdmin(me.role === 'admin' || me.role === 'superadmin'))
      .catch(() => setIsAdmin(false));
  }, [isAuthenticated]);

  const activeId = screen === 'setup' ? 'solo' : screen;

  const handleNav = (item: NavItem) => {
    playButtonClick();
    hapticLight();
    go(item.route || item.id);
  };

  const renderItem = (item: NavItem) => {
    const isActive = activeId === item.id;
    const isHovered = hoveredId === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleNav(item)}
        onMouseEnter={() => setHoveredId(item.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          ...s.navItem,
          ...(isActive ? s.navItemActive : {}),
          ...(isHovered && !isActive ? s.navItemHover : {}),
        }}
        title={item.label}
      >
        {isActive && <div style={s.activeIndicator} />}
        <NavIcon
          name={item.icon}
          size={18}
          color={isActive ? theme.accent.purple : theme.text.secondary}
        />
        <span style={{
          ...s.navLabel,
          color: isActive ? theme.text.primary : theme.text.secondary,
          fontWeight: isActive ? 600 : 400,
        }}>
          {item.label}
        </span>
      </button>
    );
  };

  const renderSection = (title: string, items: NavItem[]) => (
    <div style={s.section}>
      <div style={s.sectionTitle}>{title}</div>
      {items.map(renderItem)}
    </div>
  );

  return (
    <nav style={s.nav}>
      <div style={s.scrollArea}>
        {/* Main */}
        <div style={s.section}>
          {MAIN_ITEMS.map(renderItem)}
        </div>

        {/* Games */}
        {renderSection('Games', GAME_ITEMS)}

        {/* Community */}
        {renderSection('Community', COMMUNITY_ITEMS)}
      </div>

      {/* Bottom */}
      <div style={s.bottomSection}>
        <div style={s.divider} />
        {isAdmin && (
          <button
            onClick={() => { playButtonClick(); hapticLight(); go('admin'); }}
            onMouseEnter={() => setHoveredId('admin')}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              ...s.navItem,
              ...(activeId === 'admin' ? s.navItemActive : {}),
              ...(hoveredId === 'admin' && activeId !== 'admin' ? s.navItemHover : {}),
            }}
            title="Admin"
          >
            {activeId === 'admin' && <div style={{ ...s.activeIndicator, background: theme.accent.red }} />}
            <NavIcon name="shield" size={18} color={theme.accent.red} />
            <span style={{ ...s.navLabel, color: activeId === 'admin' ? theme.accent.red : theme.text.secondary }}>
              Admin
            </span>
          </button>
        )}
        {BOTTOM_ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: theme.layout.sidebarWidth,
    background: theme.bg.secondary,
    borderRight: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px 0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 10px',
    marginBottom: '8px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '1.2px',
    color: theme.text.muted,
    padding: '12px 12px 6px',
  },
  navItem: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '9px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    width: '100%',
    textAlign: 'left' as const,
    overflow: 'hidden',
  },
  navItemActive: {
    background: 'rgba(139, 92, 246, 0.08)',
  },
  navItemHover: {
    background: 'rgba(255, 255, 255, 0.03)',
  },
  activeIndicator: {
    position: 'absolute' as const,
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '20px',
    borderRadius: '0 3px 3px 0',
    background: theme.accent.purple,
  },
  navLabel: {
    fontSize: '13px',
    fontWeight: 400,
    letterSpacing: '0.2px',
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  bottomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 10px 12px',
  },
  divider: {
    height: '1px',
    background: theme.border.subtle,
    margin: '4px 12px 8px',
  },
};
