/**
 * Custom SVG icon set — replaces all emoji usage across the app.
 * Every icon is a React component with configurable size and color.
 */

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const defaults = (size: number, style?: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex', flexShrink: 0, verticalAlign: 'middle', ...style,
});

// ─── Game Node Icons ─────────────────────────────────────────────────────────

export function GemIcon({ size = 20, color = '#00E701', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M6 3h12l4 7-10 12L2 10l4-7z" fill={color} opacity="0.2" />
      <path d="M6 3h12l4 7-10 12L2 10l4-7z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 10h20M12 22l4-12M12 22L8 10M6 3l2 7M18 3l-2 7" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

export function BombIcon({ size = 20, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <circle cx="12" cy="14" r="8" fill={color} opacity="0.15" />
      <circle cx="12" cy="14" r="8" stroke={color} strokeWidth="1.5" />
      <path d="M14 6l2-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 3l1-1" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 2l1.5 0.5M17 2l-0.5 1.5" stroke="#8b5cf6" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function ShieldIcon({ size = 20, color = '#5b8def', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M12 2l8 4v6c0 5.25-3.4 8.5-8 10-4.6-1.5-8-4.75-8-10V6l8-4z" fill={color} opacity="0.15" />
      <path d="M12 2l8 4v6c0 5.25-3.4 8.5-8 10-4.6-1.5-8-4.75-8-10V6l8-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LightningIcon({ size = 20, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={color} opacity="0.15" />
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function WaveIcon({ size = 20, color = '#5b8def', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M2 12c2-3 4-6 6-3s4 3 6 0 4-6 6-3" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M2 17c2-3 4-6 6-3s4 3 6 0 4-6 6-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

// ─── Battle / PvP Icons ──────────────────────────────────────────────────────

export function SwordsIcon({ size = 20, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6M16 16l4 4" />
      <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" />
      <path d="M11 5l-6 6M8 8L4 4" />
    </svg>
  );
}

// ─── Direction / Prediction Icons ────────────────────────────────────────────

export function ArrowUpIcon({ size = 24, color = '#00E701', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M12 20V4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M5 11l7-7 7 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 24, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M12 4v16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M5 13l7 7 7-7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowSidewaysIcon({ size = 24, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M4 12h16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 8l-4 4 4 4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8l4 4-4 4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Result Icons ────────────────────────────────────────────────────────────

export function TrophyIcon({ size = 24, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke={color} strokeWidth="1.5" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke={color} strokeWidth="1.5" />
      <path d="M4 22h16" stroke={color} strokeWidth="1.5" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" stroke={color} strokeWidth="1.5" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" stroke={color} strokeWidth="1.5" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function ExplosionIcon({ size = 24, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M12 2l1.5 5L18 4l-2 5 5 1-4 3 3 4-5-1-1 5-2-4.5L10 22l-1-5-5 1 3-4-4-3 5-1-2-5 4.5 3L12 2z" fill={color} opacity="0.15" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Medal Icons (Leaderboard) ───────────────────────────────────────────────

export function MedalIcon({ size = 20, rank, className, style }: IconProps & { rank: 1 | 2 | 3 }) {
  const colors = { 1: '#8b5cf6', 2: '#94a3b8', 3: '#d97706' };
  const c = colors[rank];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <circle cx="12" cy="14" r="7" fill={c} opacity="0.2" stroke={c} strokeWidth="1.5" />
      <text x="12" y="17" textAnchor="middle" fill={c} fontSize="10" fontWeight="800" fontFamily="Inter, sans-serif">{rank}</text>
      <path d="M8 2l4 6 4-6" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Utility Icons ───────────────────────────────────────────────────────────

export function GiftIcon({ size = 20, color = '#a78bfa', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <rect x="3" y="8" width="18" height="4" rx="1" fill={color} opacity="0.12" />
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

export function HandshakeIcon({ size = 20, color = '#5b8def', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <path d="M11 17l-1-1a2 2 0 0 1 3-3l1 1" />
      <path d="M14 14l2 2a2 2 0 0 1-3 3" />
      <path d="M2 10l5.5-5.5a1 1 0 0 1 .7-.3h2.6L14 7.5" />
      <path d="M22 10l-5.5-5.5a1 1 0 0 0-.7-.3h-2.6L10 7.5" />
      <path d="M2 10h4l3 3" />
      <path d="M22 10h-4l-3 3" />
    </svg>
  );
}

export function PackageIcon({ size = 20, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" fill={color} opacity="0.1" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 7l8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}

export function LockIcon({ size = 20, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function PartyIcon({ size = 20, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M4 20l3.5-14L21.5 9.5 4 20z" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="14" cy="4" r="1.5" fill="#f87171" />
      <circle cx="19" cy="6" r="1" fill="#00E701" />
      <circle cx="17" cy="2" r="1" fill="#5b8def" />
      <path d="M8.5 7l1 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 16, color = '#00E701', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M5 12l5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XIcon({ size = 16, color = '#f87171', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function InfoIcon({ size = 16, color = '#5b8def', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
      <path d="M12 16v-4M12 8h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WarningIcon({ size = 16, color = '#8b5cf6', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={defaults(size, style)}>
      <path d="M12 2L2 20h20L12 2z" fill={color} opacity="0.12" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 9v4M12 17h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MoneyIcon({ size = 20, color = '#00E701', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function UserIcon({ size = 20, color = '#8888a0', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <circle cx="12" cy="8" r="4" fill={color} opacity="0.15" />
      <path d="M20 21c0-3.87-3.58-7-8-7s-8 3.13-8 7" fill={color} opacity="0.1" />
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21c0-3.87-3.58-7-8-7s-8 3.13-8 7" />
    </svg>
  );
}

export function UploadIcon({ size = 20, color = '#a78bfa', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function WalletIcon({ size = 20, color = '#a78bfa', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <rect x="2" y="6" width="20" height="14" rx="2" fill={color} opacity="0.1" />
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" opacity="0.5" />
      <circle cx="17" cy="14" r="1.5" fill={color} />
    </svg>
  );
}

export function ChartBarIcon({ size = 20, color = '#5b8def', className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={defaults(size, style)}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill={color} opacity="0.15" />
      <rect x="10" y="6" width="4" height="15" rx="1" fill={color} opacity="0.15" />
      <rect x="17" y="3" width="4" height="18" rx="1" fill={color} opacity="0.15" />
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="6" width="4" height="15" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}
