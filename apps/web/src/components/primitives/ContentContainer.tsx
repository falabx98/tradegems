import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ContentContainerProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function ContentNarrow({ children, style }: ContentContainerProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      maxWidth: theme.layout.narrowWidth,
      margin: '0 auto',
      width: '100%',
      padding: isMobile ? '8px 10px' : '20px 24px',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function ContentWide({ children, style }: ContentContainerProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      maxWidth: theme.layout.maxWidth,
      margin: '0 auto',
      width: '100%',
      padding: isMobile ? '12px' : '20px 24px',
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * Wave 1 — Game screen container (960px max-width).
 * Responsive padding: 12px mobile → 20px tablet → 24px desktop.
 * Used for all flagship game screens (Mines, Rug Game, etc).
 */
export function ContentGame({ children, style }: ContentContainerProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      maxWidth: theme.layout.gameWidth,
      margin: '0 auto',
      width: '100%',
      padding: isMobile ? '8px 12px' : '16px 24px',
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * Lobby container — wider than game screens for casino browsing feel.
 * 1440px max-width with 32px side padding on desktop.
 * Mobile: full-width with 12px padding.
 */
export function ContentLobby({ children, style }: ContentContainerProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      maxWidth: 1600,
      margin: '0 auto',
      width: '100%',
      padding: isMobile ? '8px 12px' : '16px 24px',
      ...style,
    }}>
      {children}
    </div>
  );
}
