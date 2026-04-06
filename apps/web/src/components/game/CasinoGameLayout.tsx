/**
 * CasinoGameLayout — Unified casino game shell.
 *
 * Desktop: viewport-height layout. Rail scrolls internally, stage fills space.
 * Mobile: stage → rail → footer (stacked, normal scroll).
 * Edge-to-edge panels, no border-radius — clean Shuffle-style.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

const RAIL_WIDTH = 300;
const FOOTER_HEIGHT = 44;

interface CasinoGameLayoutProps {
  rail: ReactNode;
  stage: ReactNode;
  footer?: ReactNode;
  below?: ReactNode;
}

export function CasinoGameLayout({ rail, stage, footer, below }: CasinoGameLayoutProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={mobileShell}>
        <div style={{ flex: 1, minHeight: '50vh', display: 'flex', flexDirection: 'column' }}>{stage}</div>
        <div>{rail}</div>
        {footer && <div>{footer}</div>}
        {below}
      </div>
    );
  }

  return (
    <div style={desktopShell}>
      <div style={desktopBody}>
        <div style={desktopRail}>{rail}</div>
        <div style={desktopStage}>{stage}</div>
      </div>
      {footer && <div style={{ flexShrink: 0 }}>{footer}</div>}
      {below}
    </div>
  );
}

// ─── GameControlRail ────────────────────────────────────────

interface GameControlRailProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function GameControlRail({ children, style }: GameControlRailProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      background: theme.bg.surface,
      padding: isMobile ? '16px' : '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: theme.gap.md,
      ...(isMobile
        ? { borderTop: `1px solid ${theme.border.subtle}` }
        : {
            height: '100%',
            overflowY: 'auto' as const,
            scrollbarWidth: 'thin' as const,
            borderRight: `1px solid ${theme.border.subtle}`,
          }),
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── GameStage ──────────────────────────────────────────────

interface GameStageProps {
  children: ReactNode;
  atmosphere?: string;
  style?: CSSProperties;
}

export function GameStage({ children, atmosphere, style }: GameStageProps) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: theme.bg.base,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 0,
      flex: 1,
      ...style,
    }}>
      {atmosphere && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: atmosphere,
          pointerEvents: 'none',
          zIndex: 0,
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// ─── GameFooterBar ──────────────────────────────────────────

interface GameFooterBarProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function GameFooterBar({ children, style }: GameFooterBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      fontSize: 13,
      color: theme.text.muted,
      background: theme.bg.sidebar,
      borderTop: `1px solid ${theme.border.subtle}`,
      height: FOOTER_HEIGHT,
      minHeight: FOOTER_HEIGHT,
      ...style,
    }}>
      <div />
      <img
        src="/logo-footer.png"
        alt="TradeGems"
        draggable={false}
        style={{ height: 28, opacity: 0.5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const desktopShell: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(100vh - 64px)', // 64px = TopBar height
  overflow: 'hidden',
  background: theme.bg.base,
};

const desktopBody: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const desktopRail: CSSProperties = {
  width: RAIL_WIDTH,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
};

const desktopStage: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const mobileShell: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 'calc(100vh - 64px)',
  background: theme.bg.base,
};
