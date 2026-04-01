import { theme } from '../../styles/theme';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
  size?: 'sm' | 'md';
  glow?: boolean;
  dot?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const COLORS = {
  default: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: theme.text.secondary },
  success: { bg: 'rgba(0,231,1,0.08)', border: 'rgba(0,231,1,0.15)', text: theme.accent.neonGreen },
  danger: { bg: 'rgba(255,51,51,0.08)', border: 'rgba(255,51,51,0.15)', text: theme.accent.red },
  warning: { bg: 'rgba(255,170,0,0.08)', border: 'rgba(255,170,0,0.15)', text: theme.accent.amber },
  info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)', text: theme.accent.blue },
  purple: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)', text: theme.accent.purple },
} as const;

const SIZES = {
  sm: { padding: '2px 6px', fontSize: '10px' },
  md: { padding: '4px 8px', fontSize: '11px' },
} as const;

export function Badge({ variant = 'default', size = 'md', glow, dot, children, style }: BadgeProps) {
  const c = COLORS[variant];
  const s = SIZES[size];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: s.padding,
      fontSize: s.fontSize,
      fontWeight: 600,
      lineHeight: 1.2,
      color: c.text,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: theme.radius.sm,
      whiteSpace: 'nowrap',
      ...(glow ? { boxShadow: `0 0 8px ${c.border}` } : {}),
      ...style,
    }}>
      {dot && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: c.text,
          animation: 'pulse 1.5s ease infinite',
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}
