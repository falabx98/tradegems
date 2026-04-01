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
  route?: string;
}

const MAIN_ITEMS: NavItem[] = [
  { id: 'lobby', label: 'Casino', icon: 'grid' },
];

const GAME_ITEMS: NavItem[] = [
  { id: 'rug-game', label: 'Rug Game', icon: 'terminal' },
  { id: 'mines', label: 'Mines', icon: 'diamond' },
  { id: 'candleflip', label: 'Candleflip', icon: 'swords' },
  { id: 'prediction', label: 'Predictions', icon: 'candles' },
  { id: 'trading-sim', label: 'Trading Sim', icon: 'chart' },
  { id: 'solo', label: 'Solo', icon: 'play', route: 'setup' },
  { id: 'lottery', label: 'Lottery', icon: 'star' },
];

const COMMUNITY_ITEMS: NavItem[] = [
  { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { id: 'season', label: 'VIP Club', icon: 'star' },
  { id: 'rewards', label: 'Promotions', icon: 'gift' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'my-bets', label: 'My Bets', icon: 'list' },
  { id: 'fairness', label: 'Fairness', icon: 'shield' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

interface SideNavProps {
  collapsed?: boolean;
}

export function SideNav({ collapsed = false }: SideNavProps) {
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
          ...(collapsed ? s.navItemCollapsed : {}),
          ...(isActive ? s.navItemActive : {}),
          ...(isHovered && !isActive ? s.navItemHover : {}),
        }}
        title={item.label}
      >
        {isActive && <div style={s.activeIndicator} />}
        <NavIcon
          name={item.icon}
          size={collapsed ? 20 : 18}
          color={isActive ? theme.accent.purple : theme.text.secondary}
        />
        {!collapsed && (
          <span style={{
            ...s.navLabel,
            color: isActive ? '#FFFFFF' : theme.text.secondary,
            fontWeight: isActive ? 600 : 400,
          }}>
            {item.label}
          </span>
        )}
      </button>
    );
  };

  const renderSection = (title: string, items: NavItem[]) => (
    <div style={s.section}>
      {!collapsed && <div style={s.sectionTitle}>{title}</div>}
      {collapsed && <div style={s.sectionDivider} />}
      {items.map(renderItem)}
    </div>
  );

  const navWidth = collapsed ? theme.layout.sidebarCollapsed : theme.layout.sidebarWidth;

  return (
    <nav style={{ ...s.nav, width: navWidth }}>
      {/* No search bar — removed in v5 */}

      <div style={s.scrollArea}>
        {/* Main */}
        <div style={s.section}>
          {MAIN_ITEMS.map(renderItem)}
        </div>

        {/* Games */}
        {renderSection('Originals', GAME_ITEMS)}

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
              ...(collapsed ? s.navItemCollapsed : {}),
              ...(activeId === 'admin' ? s.navItemActive : {}),
              ...(hoveredId === 'admin' && activeId !== 'admin' ? s.navItemHover : {}),
            }}
            title="Admin"
          >
            {activeId === 'admin' && <div style={{ ...s.activeIndicator, background: theme.accent.red }} />}
            <NavIcon name="shield" size={collapsed ? 20 : 18} color={theme.accent.red} />
            {!collapsed && (
              <span style={{ ...s.navLabel, color: activeId === 'admin' ? theme.accent.red : theme.text.secondary }}>
                Admin
              </span>
            )}
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
    background: theme.bg.secondary,
    borderRight: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
    transition: 'width 0.2s ease',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: `${theme.gap.sm}px 0`,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    padding: `0 ${theme.gap.sm}px`,
    marginBottom: theme.gap.xs,
  },
  sectionTitle: {
    fontSize: theme.textSize.xs.mobile,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: theme.text.muted,
    padding: `${theme.gap.md}px ${theme.gap.md}px ${theme.gap.sm}px`,
  },
  sectionDivider: {
    height: '1px',
    background: theme.border.subtle,
    margin: '6px 8px',
  },
  navItem: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: theme.gap.md,
    padding: `${theme.gap.sm}px ${theme.gap.md}px`,
    background: 'transparent',
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    width: '100%',
    textAlign: 'left' as const,
    overflow: 'hidden',
    minHeight: 36,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    padding: '10px',
    gap: '0',
  },
  navItemActive: {
    background: 'rgba(139, 92, 246, 0.06)',
  },
  navItemHover: {
    background: 'rgba(255, 255, 255, 0.03)',
  },
  activeIndicator: {
    position: 'absolute' as const,
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '2px',
    height: '18px',
    borderRadius: '0 3px 3px 0',
    background: theme.accent.purple,
  },
  navLabel: {
    fontSize: theme.textSize.sm.mobile,
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
    gap: 1,
    padding: `0 ${theme.gap.sm}px ${theme.gap.md}px`,
  },
  divider: {
    height: 1,
    background: theme.border.subtle,
    margin: `${theme.gap.xs}px ${theme.gap.sm}px ${theme.gap.sm}px`,
  },
};
