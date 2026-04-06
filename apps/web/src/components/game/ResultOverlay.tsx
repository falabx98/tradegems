import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';

export interface ResultOverlayProps {
  /** Controls visibility — true to show, false to hide */
  visible: boolean;
  /** 'win' = green tint, 'loss' = red tint */
  variant: 'win' | 'loss';
  /** Main result content (multiplier, title, profit, etc.) */
  children: React.ReactNode;
  /** Action buttons rendered below content — appear after delay */
  actions?: React.ReactNode;
  /** Delay before actions appear in ms (default: 1500 for win, 800 for loss) */
  actionsDelay?: number;
  /** Optional z-index override (default: 10) */
  zIndex?: number;
}

/**
 * Full-screen result overlay for game canvases.
 *
 * - Fades in over 300ms with backdrop blur
 * - Win: green-tinted bg with central card
 * - Loss: red-tinted bg with central card
 * - Actions appear after a delay (prevents accidental double-tap)
 * - Not dismissible by clicking background
 */
export function ResultOverlay({
  visible,
  variant,
  children,
  actions,
  actionsDelay,
  zIndex = 10,
}: ResultOverlayProps) {
  const [showActions, setShowActions] = useState(false);
  const [mounted, setMounted] = useState(false);

  const delay = actionsDelay ?? (variant === 'win' ? 1500 : 800);

  // Fade-in mount
  useEffect(() => {
    if (visible) {
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setMounted(false);
    setShowActions(false);
  }, [visible]);

  // Delayed actions appearance
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setShowActions(true), delay);
    return () => clearTimeout(t);
  }, [visible, delay]);

  if (!visible) return null;

  const isWin = variant === 'win';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 300ms ease',
        padding: '16px',
      }}
    >
      {/* Central result card */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '32px',
        background: theme.bg.surface,
        border: `1px solid ${isWin ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 59, 59, 0.2)'}`,
        borderRadius: '16px',
        boxShadow: theme.shadow.lg,
        maxWidth: '360px',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle glow at top */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '200px',
          height: '100px',
          background: isWin
            ? 'radial-gradient(ellipse, rgba(0, 230, 118, 0.12) 0%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(255, 59, 59, 0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Main content area */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          position: 'relative',
          zIndex: 1,
        }}>
          {children}
        </div>

        {/* Delayed actions */}
        {actions && (
          <div style={{
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            opacity: showActions ? 1 : 0,
            transform: showActions ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 300ms ease, transform 300ms ease',
            position: 'relative',
            zIndex: 1,
          }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
