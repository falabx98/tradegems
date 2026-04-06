/**
 * SectionState — Unified loading / empty / error state wrapper.
 *
 * Usage:
 *   <SectionState loading={isLoading} error={error} empty={items.length === 0} onRetry={reload}>
 *     <ActualContent />
 *   </SectionState>
 *
 *   // Or with custom messages:
 *   <SectionState
 *     loading={isLoading}
 *     error={error}
 *     empty={items.length === 0}
 *     emptyIcon="🎲"
 *     emptyTitle="No bets yet"
 *     emptySubtitle="Play a game to see your history here"
 *     onRetry={reload}
 *   >
 *     <ActualContent />
 *   </SectionState>
 */
import type { CSSProperties, ReactNode } from 'react';
import { theme } from '../../styles/theme';

interface SectionStateProps {
  children: ReactNode;
  /** Show loading skeleton */
  loading?: boolean;
  /** Error message — if truthy, shows error state */
  error?: string | null;
  /** Whether the data set is empty */
  empty?: boolean;
  /** Retry handler — shows retry button on error */
  onRetry?: () => void;
  /** Number of skeleton rows to show (default 3) */
  skeletonRows?: number;
  /** Custom empty icon (default 📭) */
  emptyIcon?: string;
  /** Custom empty title */
  emptyTitle?: string;
  /** Custom empty subtitle */
  emptySubtitle?: string;
  /** Compact mode — smaller padding/spacing */
  compact?: boolean;
}

export function SectionState({
  children,
  loading,
  error,
  empty,
  onRetry,
  skeletonRows = 3,
  emptyIcon = '',
  emptyTitle = 'Nothing here yet',
  emptySubtitle,
  compact,
}: SectionStateProps) {
  const pad = compact ? theme.gap.sm : theme.gap.md;

  // Loading — pulse skeleton rows
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.gap.sm, padding: pad }}>
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div
            key={i}
            style={{
              height: compact ? 32 : 40,
              borderRadius: theme.radius.md,
              background: 'rgba(255,255,255,0.04)',
              animation: 'pulse 1.5s ease infinite',
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  // Error — calm message with optional retry
  if (error) {
    return (
      <div style={errorContainer}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 12, color: theme.text.muted, marginTop: 2 }}>
          {error}
        </div>
        {onRetry && (
          <button onClick={onRetry} style={retryBtn}>
            Tap to retry
          </button>
        )}
      </div>
    );
  }

  // Empty — calm informational state
  if (empty) {
    return (
      <div style={emptyContainer}>
        {emptyIcon && <span style={{ fontSize: 24 }}>{emptyIcon}</span>}
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>
          {emptyTitle}
        </div>
        {emptySubtitle && (
          <div style={{ fontSize: 12, color: theme.text.muted, marginTop: 2 }}>
            {emptySubtitle}
          </div>
        )}
      </div>
    );
  }

  // Normal — render children
  return <>{children}</>;
}

// ─── Styles ─────────────────────────────────────────────────

const errorContainer: CSSProperties = {
  textAlign: 'center',
  padding: `${theme.gap.lg}px ${theme.gap.md}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.gap.xs,
};

const emptyContainer: CSSProperties = {
  textAlign: 'center',
  padding: `${theme.gap.lg}px ${theme.gap.md}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.gap.xs,
};

const retryBtn: CSSProperties = {
  marginTop: theme.gap.sm,
  padding: `${theme.gap.sm}px ${theme.gap.lg}px`,
  fontSize: 12,
  fontWeight: 600,
  color: theme.accent.purple,
  background: 'rgba(139, 92, 246, 0.08)',
  border: '1px solid rgba(139, 92, 246, 0.2)',
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  minHeight: 32,
};
