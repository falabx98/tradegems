import { theme } from '../../styles/theme';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple'
    | 'live' | 'hot' | 'new' | 'win' | 'pvp';
  size?: 'sm' | 'md';
  glow?: boolean;
  dot?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const COLORS: Record<string, { bg: string; border: string; text: string }> = {
  // Core variants
  default:  { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: theme.text.secondary },
  success:  { bg: 'rgba(0,230,118,0.08)',   border: 'rgba(0,230,118,0.20)',   text: theme.accent.green },
  danger:   { bg: 'rgba(255,59,59,0.08)',    border: 'rgba(255,59,59,0.20)',   text: theme.accent.red },
  warning:  { bg: 'rgba(255,179,0,0.08)',    border: 'rgba(255,179,0,0.20)',   text: theme.accent.amber },
  info:     { bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.20)',  text: theme.accent.blue },
  purple:   { bg: 'rgba(139,92,246,0.08)',   border: 'rgba(139,92,246,0.20)',  text: theme.accent.primary },

  // Semantic game variants
  live:     { bg: 'rgba(255,179,0,0.10)',    border: 'rgba(255,179,0,0.25)',   text: theme.accent.amber },
  hot:      { bg: 'rgba(255,59,59,0.10)',    border: 'rgba(255,59,59,0.25)',   text: theme.accent.red },
  new:      { bg: 'rgba(139,92,246,0.10)',   border: 'rgba(139,92,246,0.25)',  text: theme.accent.primary },
  win:      { bg: 'rgba(0,230,118,0.10)',    border: 'rgba(0,230,118,0.25)',   text: theme.accent.green },
  pvp:      { bg: 'rgba(6,182,212,0.10)',    border: 'rgba(6,182,212,0.25)',   text: theme.accent.cyan },
};

export function Badge({ variant = 'default', size = 'md', glow, dot, children, style }: BadgeProps) {
  const c = COLORS[variant] || COLORS.default;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: size === 'sm' ? '3px 8px' : '4px 10px',
      fontSize: size === 'sm' ? '10px' : '11px',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '0.02em',
      textTransform: 'uppercase' as const,
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
