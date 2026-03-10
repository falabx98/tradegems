import type { CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { theme } from '../styles/theme';

interface SidebarProps {
  onLogout: () => void;
}

const navItems: { path: string; label: string; icon: string }[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/users', label: 'Users', icon: '👥' },
  { path: '/treasury', label: 'Treasury', icon: '🏦' },
  { path: '/rounds', label: 'Rounds', icon: '🎮' },
  { path: '/fairness', label: 'Fairness', icon: '⚖️' },
  { path: '/game-config', label: 'Game Config', icon: '⚙️' },
  { path: '/feature-flags', label: 'Feature Flags', icon: '🚩' },
  { path: '/risk', label: 'Risk Flags', icon: '🛡️' },
  { path: '/audit', label: 'Audit Log', icon: '📝' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/deposit-wallets', label: 'Wallets', icon: '🏧' },
  { path: '/referrals', label: 'Referrals', icon: '🔗' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ onLogout }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>◆</span>
        <span style={styles.logoText}>TRADESOL</span>
        <span style={styles.badge}>ADMIN</span>
      </div>

      <nav style={styles.nav}>
        {navItems.map(({ path, label, icon }) => (
          <button
            key={path}
            style={{
              ...styles.navItem,
              background: isActive(path) ? theme.bg.tertiary : 'transparent',
              color: isActive(path) ? theme.accent.cyan : theme.text.secondary,
              borderLeft: isActive(path)
                ? `3px solid ${theme.accent.cyan}`
                : '3px solid transparent',
            }}
            onClick={() => navigate(path)}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div style={styles.bottom}>
        <button style={styles.logoutBtn} onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  sidebar: {
    width: '220px',
    minWidth: '220px',
    height: '100vh',
    background: theme.bg.secondary,
    borderRight: `1px solid ${theme.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky' as const,
    top: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '20px 16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  logoIcon: {
    fontSize: '1.3rem',
    background: theme.gradient.solana,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoText: {
    fontWeight: 700,
    fontSize: theme.fontSize.md,
    color: theme.text.primary,
    letterSpacing: '1px',
  },
  badge: {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: theme.accent.cyan,
    border: `1px solid ${theme.accent.cyan}`,
    borderRadius: theme.radius.sm,
    padding: '1px 5px',
    letterSpacing: '1px',
  },
  nav: {
    flex: 1,
    padding: '12px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto' as const,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    border: 'none',
    cursor: 'pointer',
    fontSize: theme.fontSize.base,
    fontWeight: 500,
    transition: 'all 0.15s',
    textAlign: 'left' as const,
    width: '100%',
  },
  bottom: {
    padding: '12px 16px',
    borderTop: `1px solid ${theme.border.subtle}`,
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    background: 'transparent',
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm,
    color: theme.text.secondary,
    fontSize: theme.fontSize.sm,
    cursor: 'pointer',
  },
};
