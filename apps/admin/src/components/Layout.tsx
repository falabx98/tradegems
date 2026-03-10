import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../stores/authStore';
import { theme } from '../styles/theme';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/treasury': 'Treasury',
  '/rounds': 'Rounds',
  '/fairness': 'Fairness',
  '/game-config': 'Game Config',
  '/feature-flags': 'Feature Flags',
  '/risk': 'Risk Flags',
  '/audit': 'Audit Log',
  '/analytics': 'Analytics',
  '/chat': 'Chat Moderation',
  '/deposit-wallets': 'Deposit Wallets',
  '/referrals': 'Referrals',
  '/settings': 'Settings',
};

export function AdminLayout() {
  const { username, logout } = useAuthStore();
  const location = useLocation();

  const path = location.pathname;
  const title = path.startsWith('/users/') && path !== '/users'
    ? 'User Detail'
    : pageTitles[path] || 'Admin';

  return (
    <div style={styles.container}>
      <Sidebar onLogout={logout} />
      <div style={styles.main}>
        <header style={styles.topbar}>
          <div style={styles.breadcrumb}>{title}</div>
          <div style={styles.user}>
            <span style={styles.userIcon}>●</span>
            <span style={styles.userName}>{username || 'Admin'}</span>
          </div>
        </header>
        <div style={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: theme.bg.primary,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 28px',
    background: theme.bg.secondary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  breadcrumb: {
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    color: theme.text.primary,
  },
  user: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  userIcon: {
    color: theme.success,
    fontSize: '0.6rem',
  },
  userName: {
    fontSize: theme.fontSize.sm,
    color: theme.text.secondary,
  },
  content: {
    flex: 1,
    padding: '28px',
    overflowY: 'auto' as const,
  },
};
