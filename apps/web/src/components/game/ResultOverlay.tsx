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
 * Wave 1B — Shared result overlay for game canvases.
 *
 * Renders as an overlay on top of the game canvas area.
 * - Fades in over 300ms
 * - Win: green-tinted semi-transparent bg
 * - Loss: red-tinted semi-transparent bg
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
      // Small RAF delay so initial opacity:0 renders first, then transition fires
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
  const bgTint = isWin
    ? 'rgba(16, 185, 129, 0.12)'
    : 'rgba(239, 68, 68, 0.10)';

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
        background: `linear-gradient(180deg, ${bgTint} 0%, rgba(0,0,0,0.85) 100%)`,
        backdropFilter: 'blur(4px)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 300ms ease',
        padding: `${theme.gap.lg}px`,
      }}
    >
      {/* Main content area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${theme.gap.sm}px`,
      }}>
        {children}
      </div>

      {/* Delayed actions */}
      {actions && (
        <div style={{
          marginTop: `${theme.gap.lg}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: `${theme.gap.sm}px`,
          width: '100%',
          maxWidth: '280px',
          opacity: showActions ? 1 : 0,
          transform: showActions ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 300ms ease, transform 300ms ease',
        }}>
          {actions}
        </div>
      )}
    </div>
  );
}
