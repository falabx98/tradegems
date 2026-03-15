// ─── TRADESOL v3 — Midnight Casino Design System ─────────────────────────────
// Clean, flat, modern Web3 casino. Purple gradient accents.

export const theme = {
  // Backgrounds — true black (Shuffle-style)
  bg: {
    primary: '#080808',
    secondary: '#0e0e10',
    tertiary: '#121418',
    card: '#1a1c21',
    elevated: '#202329',
    overlay: 'rgba(0, 0, 0, 0.9)',
  },

  // Text
  text: {
    primary: '#e8ecf4',
    secondary: '#7c8599',
    muted: '#3d4555',
    inverse: '#080808',
  },

  // Accent colors
  accent: {
    purple: '#8b5cf6',        // PRIMARY — CTAs, active, highlights
    violet: '#7c3aed',        // deep purple
    lavender: '#a78bfa',      // light purple
    green: '#00dc82',         // success / profit only
    blue: '#3b82f6',          // info, links
    red: '#ff4757',           // loss, danger
    amber: '#ffaa00',         // warning, VIP
    cyan: '#22d3ee',          // subtle highlight
  },

  // Gradients
  gradient: {
    primary: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
    primaryHover: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #8b5cf6 100%)',
    secondary: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    green: 'linear-gradient(135deg, #059669, #10b981)',
    greenHover: 'linear-gradient(135deg, #047857, #059669)',
    danger: 'linear-gradient(135deg, #ef4444, #ff4757)',
    pill: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
    pillHover: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)',
    card: '#1a1c21',
    cardHover: '#202329',
    glass: 'rgba(18, 20, 24, 0.95)',
    wallet: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
    rugGame: 'linear-gradient(135deg, #7f1d1d, #dc2626)',
    candleflip: 'linear-gradient(135deg, #92400e, #d97706)',
    tradingSim: 'linear-gradient(135deg, #064e3b, #059669)',
    liveCard: '#1a1c21',
    purpleText: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    greenText: 'linear-gradient(135deg, #00dc82, #00b86e)',
    redText: 'linear-gradient(135deg, #ff4757, #ef4444)',
    blueText: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    amberText: 'linear-gradient(135deg, #ffaa00, #ffc107)',
  },

  // Semantic
  success: '#00dc82',
  warning: '#ffaa00',
  danger: '#ff4757',
  info: '#3b82f6',

  // Game
  game: {
    multiplier: '#00dc82',
    divider: '#ff4757',
    shield: '#3b82f6',
    fakeBreakout: '#ffaa00',
    volatilitySpike: '#8b5cf6',
    chartLine: '#00dc82',
    chartGlow: 'rgba(0, 220, 130, 0.15)',
    chartFill: 'rgba(0, 220, 130, 0.03)',
    nodeGlow: 'rgba(0, 220, 130, 0.3)',
    nodeDanger: 'rgba(255, 71, 87, 0.3)',
  },

  // VIP
  vip: {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    titan: '#ff6b35',
  },

  // Phase
  phase: {
    opening: '#00dc82',
    buildup: '#3b82f6',
    chaos: '#ff4757',
    final: '#8b5cf6',
    frozen: '#22d3ee',
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.04)',
    medium: 'rgba(255, 255, 255, 0.07)',
    strong: 'rgba(255, 255, 255, 0.12)',
    accent: 'rgba(139, 92, 246, 0.2)',
    glow: 'rgba(139, 92, 246, 0.1)',
  },

  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 8px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
    glow: '0 0 12px rgba(139, 92, 246, 0.08)',
    greenGlow: '0 0 12px rgba(0, 220, 130, 0.1)',
    redGlow: '0 0 12px rgba(255, 71, 87, 0.1)',
  },

  // Radii
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  fontSize: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.875rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '2rem',
    '3xl': '2.5rem',
    '4xl': '3.5rem',
    hero: '4.5rem',
  },

  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },

  layout: {
    headerHeight: '56px',
    sidebarWidth: '220px',
    bottomNavHeight: '64px',
    maxWidth: '1400px',
  },
} as const;

export type Theme = typeof theme;
