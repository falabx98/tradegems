import { theme } from '../../styles/theme';

// ─── LiveDot ────────────────────────────────────────────────────────────────
// Pulsing dot with expanding ring, replaces inline pulsing dots everywhere
export function LiveDot({ color = '#2ecc71', size = 8 }: { color?: string; size?: number }) {
  return (
    <span style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: `${size + 8}px`,
      height: `${size + 8}px`,
      flexShrink: 0,
    }}>
      {/* Expanding ring */}
      <span style={{
        position: 'absolute',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        animation: 'livePulseRing 2s ease-out infinite',
      }} />
      {/* Core dot */}
      <span style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }} />
    </span>
  );
}

// ─── MultiplierBadge ────────────────────────────────────────────────────────
// Color-coded multiplier display with hero/inline variants
export function MultiplierBadge({
  value,
  variant = 'inline',
  suffix = 'x',
}: {
  value: number;
  variant?: 'inline' | 'hero';
  suffix?: string;
}) {
  const isPositive = value >= 1.0;
  const color = isPositive ? '#2ecc71' : '#ef4444';
  const glowClass = isPositive ? 'glow-green' : 'glow-red';

  if (variant === 'hero') {
    return (
      <span
        className={`mono ${glowClass}`}
        style={{
          fontSize: '32px',
          fontWeight: 900,
          color,
          letterSpacing: '-0.5px',
        }}
      >
        {value.toFixed(2)}{suffix}
      </span>
    );
  }

  return (
    <span
      className="mono"
      style={{
        fontSize: '14px',
        fontWeight: 700,
        color,
        textShadow: `0 0 6px ${color}44`,
      }}
    >
      {value.toFixed(2)}{suffix}
    </span>
  );
}

// ─── WinAmountDisplay ───────────────────────────────────────────────────────
// Animated SOL amount with gradient text + glow
export function WinAmountDisplay({
  amount,
  isWin = true,
  size = 'md',
  showSign = true,
}: {
  amount: number | string;
  isWin?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
}) {
  const sizeMap = { sm: '12px', md: '14px', lg: '20px' };
  const color = isWin ? '#2ecc71' : '#ef4444';
  const glowClass = isWin ? 'glow-green' : 'glow-red';
  const sign = showSign ? (isWin ? '+' : '-') : '';
  const displayAmount = typeof amount === 'number'
    ? (amount / 1_000_000_000).toFixed(amount >= 100_000_000 ? 2 : 3)
    : amount;

  return (
    <span
      className={`mono ${glowClass}`}
      style={{
        fontSize: sizeMap[size],
        fontWeight: 700,
        color,
      }}
    >
      {sign}<img src="/sol-coin.png" alt="SOL" style={{ width: sizeMap[size], height: sizeMap[size], verticalAlign: 'middle', marginRight: '3px' }} />{displayAmount}
    </span>
  );
}

// ─── LiveRoundBanner ────────────────────────────────────────────────────────
// Banner with animated border glow for "LIVE ROUND" sections
export function LiveRoundBanner({
  title,
  subtitle,
  accentColor = '#2ecc71',
  count,
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
  count?: number;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 16px',
      borderRadius: '12px',
      background: `linear-gradient(135deg, ${accentColor}06, ${accentColor}02)`,
      border: `1px solid ${accentColor}20`,
      marginBottom: '12px',
    }}>
      <LiveDot color={accentColor} size={10} />
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 700,
          color: theme.text.primary,
          letterSpacing: '0.8px',
          textTransform: 'uppercase' as const,
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '2px' }}>
            {subtitle}
          </div>
        )}
      </div>
      {count !== undefined && (
        <div style={{
          padding: '4px 10px',
          borderRadius: '20px',
          background: `${accentColor}10`,
          border: `1px solid ${accentColor}20`,
          fontSize: '12px',
          fontWeight: 700,
          color: accentColor,
          fontFamily: 'var(--font-mono)',
        }}>
          {count}
        </div>
      )}
    </div>
  );
}

// ─── GameTypeBadge ──────────────────────────────────────────────────────────
// Small badge showing game type with color coding
export function GameTypeBadge({ type }: { type: 'rug' | 'candle' | 'trading' | 'solo' | 'prediction' }) {
  const config = {
    rug: { label: 'RUG', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
    candle: { label: 'FLIP', color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)' },
    trading: { label: 'SIM', color: '#059669', bg: 'rgba(5, 150, 105, 0.08)' },
    solo: { label: 'SOLO', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
    prediction: { label: 'PRED', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
  }[type];

  return (
    <span style={{
      padding: '3px 7px',
      borderRadius: '6px',
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.5px',
      color: config.color,
      background: config.bg,
      border: `1px solid ${config.color}18`,
      textTransform: 'uppercase' as const,
      fontFamily: 'var(--font-mono)',
    }}>
      {config.label}
    </span>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────────────
export function StatusBadge({ status, size = 'sm' }: { status: 'cashed' | 'rugged' | 'bullish' | 'bearish' | 'winner'; size?: 'sm' | 'md' }) {
  const config = {
    cashed: { label: 'CASHED', color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.08)' },
    rugged: { label: 'RUGGED', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
    bullish: { label: 'BULL', color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.08)' },
    bearish: { label: 'BEAR', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
    winner: { label: 'WINNER', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)' },
  }[status];

  const fontSize = size === 'sm' ? '10px' : '12px';
  const pad = size === 'sm' ? '3px 7px' : '4px 10px';

  return (
    <span style={{
      padding: pad,
      borderRadius: '6px',
      fontSize,
      fontWeight: 700,
      letterSpacing: '0.5px',
      color: config.color,
      background: config.bg,
      border: `1px solid ${config.color}18`,
      textTransform: 'uppercase' as const,
      fontFamily: 'var(--font-mono)',
      whiteSpace: 'nowrap' as const,
    }}>
      {config.label}
    </span>
  );
}

// ─── Relative time helper ───────────────────────────────────────────────────
export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
