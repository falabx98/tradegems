import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

// ─── Legacy sizes (backward-compatible, used by non-flagship games) ───
export type CanvasSize = 'compact' | 'standard' | 'immersive' | 'board' | 'chart';

export interface GameCanvasProps {
  size?: CanvasSize;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Optional atmospheric background (e.g. radial-gradient for game identity) */
  atmosphere?: string;
}

// Legacy fixed heights — preserved for non-flagship games
const LEGACY_HEIGHTS: Record<string, { mobile: string; desktop: string }> = {
  compact:   { mobile: '200px', desktop: '260px' },
  standard:  { mobile: '240px', desktop: '320px' },
  immersive: { mobile: '260px', desktop: '400px' },
};

// Wave 1 — simplified strategies using clamp() for smooth responsive behavior
const STRATEGY_HEIGHTS: Record<string, { mobile: string; desktop: string }> = {
  board: { mobile: 'clamp(260px, 50vw, 360px)', desktop: '360px' },
  chart: { mobile: 'clamp(220px, 38vh, 300px)', desktop: '320px' },
};

export function GameCanvas({ size = 'standard', children, style, atmosphere }: GameCanvasProps) {
  const isMobile = useIsMobile();

  const isStrategy = size === 'board' || size === 'chart';
  const heights = isStrategy ? STRATEGY_HEIGHTS[size] : LEGACY_HEIGHTS[size];
  const h = isMobile ? heights.mobile : heights.desktop;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: h,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      border: `1px solid ${theme.border.subtle}`,
      background: '#0a0c10',
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
      {children}
    </div>
  );
}
