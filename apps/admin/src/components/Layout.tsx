import type { CSSProperties, ReactNode } from 'react';
import { Sidebar, type Page } from './Sidebar';
import { theme } from '../styles/theme';

interface LayoutProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  username: string | null;
  children: ReactNode;
}

export function Layout({ activePage, onNavigate, onLogout, username, children }: LayoutProps) {
  return (
    <div style={styles.container}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <div style={styles.main}>
        <header style={styles.topbar}>
          <div style={styles.breadcrumb}>
            {activePage.charAt(0).toUpperCase() + activePage.slice(1).replace(/([A-Z])/g, ' $1')}
          </div>
          <div style={styles.user}>
            <span style={styles.userIcon}>●</span>
            <span style={styles.userName}>{username || 'Admin'}</span>
          </div>
        </header>
        <div style={styles.content}>
          {children}
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
