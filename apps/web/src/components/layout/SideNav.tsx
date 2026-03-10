import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';
import { NavIcon } from './NavIcons';

const NAV_ITEMS = [
  { id: 'lobby', label: 'Lobby', icon: 'grid' },
  { id: 'solo', label: 'Solo', icon: 'play' },
  { id: 'battle', label: 'Battle', icon: 'swords' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
] as const;

const BOTTOM_ITEMS = [
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
] as const;

export function SideNav() {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);

  const activeId = screen === 'lobby' || screen === 'setup' ? 'lobby' : screen;

  const handleNav = (id: string) => {
    if (id === 'lobby' || id === 'solo') {
      setScreen('lobby');
    } else if (id === 'battle') {
      setScreen('battle' as any);
    } else if (id === 'leaderboard' || id === 'rewards' || id === 'wallet' || id === 'history' || id === 'settings') {
      setScreen(id as any);
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
            >
              <NavIcon
                name={item.icon}
                size={18}
                color={isActive ? '#c084fc' : theme.text.muted}
              />
              <span style={{
                ...styles.navLabel,
                ...(isActive ? styles.navLabelActive : {}),
              }}>
                {item.label}
              </span>
              {isActive && <div style={styles.activeBar} />}
            </button>
          );
        })}
      </div>

      <div style={styles.bottomSection}>
        <div style={styles.divider} />
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
            >
              <NavIcon
                name={item.icon}
                size={18}
                color={isActive ? '#c084fc' : theme.text.muted}
              />
              <span style={{
                ...styles.navLabel,
                ...(isActive ? styles.navLabelActive : {}),
              }}>
                {item.label}
              </span>
              {isActive && <div style={styles.activeBar} />}
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
    width: '64px',
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
    padding: '0 6px',
  },
  bottomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 6px',
  },
  divider: {
    height: '1px',
    background: theme.border.subtle,
    margin: '4px 8px 8px',
  },
  navItem: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    padding: '10px 4px 8px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    fontFamily: 'Rajdhani, sans-serif',
  },
  navItemActive: {
    background: `rgba(153, 69, 255, 0.08)`,
  },
  navLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: theme.text.muted,
    transition: 'color 0.15s ease',
    textAlign: 'center',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  navLabelActive: {
    color: '#c084fc',
  },
  activeBar: {
    position: 'absolute',
    left: '-6px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '2px',
    height: '20px',
    borderRadius: '0 2px 2px 0',
    background: '#9945FF',
  },
};
