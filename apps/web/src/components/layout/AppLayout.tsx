import { useState, useEffect } from 'react';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

const SIDEBAR_KEY = 'tradesol_sidebar_collapsed';

interface AppLayoutProps {
  children: React.ReactNode;
  hideChrome?: boolean;
}

export function AppLayout({ children, hideChrome = false }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Persist sidebar collapse state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  if (hideChrome) {
    return (
      <div style={styles.fullscreen}>
        {children}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <TopBar onToggleSidebar={() => setSidebarCollapsed(v => !v)} sidebarOpen={!sidebarCollapsed} />
      <div style={styles.body}>
        {!isMobile && <SideNav collapsed={sidebarCollapsed} />}
        <main style={{
          ...styles.main,
          ...(isMobile ? { padding: '8px 6px', paddingBottom: '80px' } : {}),
        }}>
          {children}
        </main>
      </div>
      {isMobile && <BottomNav />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: theme.bg.base,
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflowX: 'hidden',
    overflowY: 'auto',
    background: theme.bg.base,
    padding: '24px',
  },
  contentWrap: {
    maxWidth: theme.layout.maxWidth,
    margin: '0 auto',
    width: '100%',
  },
  fullscreen: {
    height: '100vh',
    background: theme.bg.base,
    overflow: 'hidden',
  },
};
