import { theme } from '../../styles/theme';

export interface CardProps {
  variant?: 'panel' | 'game' | 'stat' | 'premium' | 'elevated';
  padding?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const VARIANTS = {
  panel: {
    background: theme.bg.surface,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    defaultPadding: '16px',
  },
  game: {
    background: theme.bg.surface,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    defaultPadding: '0',
  },
  stat: {
    background: theme.bg.surface,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    defaultPadding: '8px 12px',
  },
  premium: {
    background: theme.bg.surface,
    border: `1px solid ${theme.border.accent}`,
    borderRadius: theme.radius.lg,
    defaultPadding: '16px',
  },
  elevated: {
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.default}`,
    borderRadius: theme.radius.lg,
    defaultPadding: '16px',
  },
} as const;

export function Card({ variant = 'panel', padding, onClick, className, style, children }: CardProps) {
  const v = VARIANTS[variant];
  const isClickable = !!onClick;

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: v.background,
        border: v.border,
        borderRadius: v.borderRadius,
        padding: padding ?? v.defaultPadding,
        overflow: variant === 'game' ? 'hidden' : undefined,
        cursor: isClickable ? 'pointer' : undefined,
        transition: 'all 0.15s ease',
        boxShadow: variant === 'elevated' ? theme.shadow.md : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
