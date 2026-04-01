/**
 * CasinoGameLayout — Unified casino game shell.
 *
 * Desktop: viewport-height layout. Rail scrolls internally, stage fills space.
 * Mobile: stage → rail → footer (stacked, normal scroll).
 * All panels: border-radius 20px.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

const RAIL_WIDTH = 296;
const PANEL_RADIUS = 20;
const DESKTOP_GAP = 12;
const MOBILE_GAP = theme.gap.md;
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
        <div>{stage}</div>
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
      background: '#0e0e12',
      borderRadius: isMobile ? 0 : PANEL_RADIUS,
      padding: isMobile ? '16px 16px' : '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: theme.gap.md,
      // Desktop: fill parent height, scroll internally
      ...(isMobile ? {} : {
        height: '100%',
        overflowY: 'auto' as const,
        scrollbarWidth: 'thin' as const,
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
  const isMobile = useIsMobile();
  return (
    <div style={{
      position: 'relative',
      borderRadius: isMobile ? 0 : PANEL_RADIUS,
      overflow: 'hidden',
      background: '#141418',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      flex: isMobile ? undefined : 1,
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
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
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
  const isMobile = useIsMobile();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 20px',
      fontSize: theme.textSize.xs.mobile,
      color: theme.text.muted,
      background: '#1a1a20',
      borderRadius: isMobile ? 0 : PANEL_RADIUS,
      minHeight: FOOTER_HEIGHT,
      ...style,
    }}>
      <img
        src="/logo-footer.png"
        alt="TradeGems"
        draggable={false}
        style={{ height: 18, opacity: 0.6 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const desktopShell: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  width: '100%',
  padding: `${DESKTOP_GAP}px 24px`,
  display: 'flex',
  flexDirection: 'column',
  gap: DESKTOP_GAP,
  // Fixed viewport height — no page scroll
  height: `calc(100vh - 64px)`, // 64px = TopBar height
  overflow: 'hidden',
};

const desktopBody: CSSProperties = {
  display: 'flex',
  gap: DESKTOP_GAP,
  alignItems: 'stretch',
  flex: 1,
  minHeight: 0, // Critical: allows flex children to shrink below content size
  overflow: 'hidden',
};

const desktopRail: CSSProperties = {
  width: RAIL_WIDTH,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden', // Rail panel clips, GameControlRail scrolls internally
};

const desktopStage: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

const mobileShell: CSSProperties = {
  width: '100%',
  padding: `${MOBILE_GAP}px 0`,
  display: 'flex',
  flexDirection: 'column',
  gap: 8, // Small visual rhythm between stage and rail on mobile
};
