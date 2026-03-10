import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

interface AppLayoutProps {
  children: React.ReactNode;
  hideChrome?: boolean; // Hide top bar + nav during gameplay
}

export function AppLayout({ children, hideChrome = false }: AppLayoutProps) {
  const isMobile = useIsMobile();

  if (hideChrome) {
    return (
      <div style={styles.fullscreen}>
        <div className="neon-grid" />
        {children}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div className="neon-grid" />
      <TopBar />
      <div style={styles.body}>
        {!isMobile && <SideNav />}
        <main style={{
          ...styles.main,
          ...(isMobile ? { paddingBottom: '64px' } : {}),
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
    background: theme.bg.primary,
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
  fullscreen: {
    height: '100vh',
    background: theme.bg.primary,
    overflow: 'hidden',
  },
};
