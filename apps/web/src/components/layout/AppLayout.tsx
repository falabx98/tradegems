import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { theme } from '../../styles/theme';

interface AppLayoutProps {
  children: React.ReactNode;
  hideChrome?: boolean; // Hide top bar + nav during gameplay
}

export function AppLayout({ children, hideChrome = false }: AppLayoutProps) {
  if (hideChrome) {
    return (
      <div style={styles.fullscreen}>
        {children}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <TopBar />
      <div style={styles.body}>
        <SideNav />
        <main style={styles.main}>
          {children}
        </main>
      </div>
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
