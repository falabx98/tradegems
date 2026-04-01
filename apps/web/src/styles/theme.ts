// ─── TRADESOL v5 — Casino Redesign Phase 1 Design System ──────────────────────
// Pure black backgrounds, purple brand, neon green for money/success only.
// Purple = structural active state. Green = money/success contexts only.

export const theme = {
  // Backgrounds — tighter steps, warmer darks
  bg: {
    primary: '#0A0A0A',
    secondary: '#111111',
    tertiary: '#161616',
    card: '#141414',
    elevated: '#1c1c1c',
    input: '#0d0d0d',
    overlay: 'rgba(0, 0, 0, 0.80)',
  },

  // Text — warmer greys for secondary/muted
  text: {
    primary: '#FFFFFF',
    secondary: '#8B8B8B',
    muted: '#555555',
    inverse: '#0A0A0A',
  },

  // Accent colors — brand preserved
  accent: {
    purple: '#8b5cf6',        // PRIMARY brand — nav active, CTAs, highlights
    violet: '#7c3aed',        // deep purple — gradient anchor
    lavender: '#a78bfa',      // light purple — brand accent
    neonGreen: '#00E701',     // money/success — deposit, cashout, profit
    green: '#00dc82',         // game multipliers, chart lines, profit
    blue: '#3b82f6',          // info, links
    red: '#FF3333',           // loss, danger, bust
    amber: '#ffaa00',         // warning, VIP
    cyan: '#22d3ee',          // rare secondary highlight only
  },

  // Gradients — all preserved
  gradient: {
    primary: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
    primaryHover: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #8b5cf6 100%)',
    secondary: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    green: 'linear-gradient(135deg, #059669, #10b981)',
    greenHover: 'linear-gradient(135deg, #047857, #059669)',
    neonGreen: 'linear-gradient(135deg, #00C800, #00E701)',
    danger: 'linear-gradient(135deg, #ef4444, #FF3333)',
    pill: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
    pillHover: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)',
    card: '#141414',
    cardHover: '#1c1c1c',
    glass: 'rgba(20, 20, 20, 0.95)',
    wallet: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
    rugGame: 'linear-gradient(135deg, #7f1d1d, #dc2626)',
    candleflip: 'linear-gradient(135deg, #92400e, #d97706)',
    tradingSim: 'linear-gradient(135deg, #064e3b, #059669)',
    liveCard: '#141414',
    purpleText: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    greenText: 'linear-gradient(135deg, #00dc82, #00b86e)',
    redText: 'linear-gradient(135deg, #FF3333, #ef4444)',
    blueText: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    amberText: 'linear-gradient(135deg, #ffaa00, #ffc107)',
  },

  // Semantic
  success: '#00E701',
  warning: '#ffaa00',
  danger: '#FF3333',
  info: '#3b82f6',

  // Game — unchanged
  game: {
    multiplier: '#00dc82',
    divider: '#FF3333',
    shield: '#3b82f6',
    fakeBreakout: '#ffaa00',
    volatilitySpike: '#8b5cf6',
    chartLine: '#00dc82',
    chartGlow: 'rgba(0, 220, 130, 0.15)',
    chartFill: 'rgba(0, 220, 130, 0.03)',
    nodeGlow: 'rgba(0, 220, 130, 0.3)',
    nodeDanger: 'rgba(255, 51, 51, 0.3)',
  },

  // VIP — unchanged
  vip: {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    titan: '#ff6b35',
  },

  // Phase — unchanged
  phase: {
    opening: '#00dc82',
    buildup: '#3b82f6',
    chaos: '#FF3333',
    final: '#8b5cf6',
    frozen: '#22d3ee',
  },

  // Borders — medium/strong slightly stronger
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    medium: 'rgba(255, 255, 255, 0.10)',
    strong: 'rgba(255, 255, 255, 0.14)',
    card: 'rgba(255, 255, 255, 0.06)',
    accent: 'rgba(139, 92, 246, 0.2)',
    glow: 'rgba(139, 92, 246, 0.1)',
    greenGlow: 'rgba(0, 231, 1, 0.15)',
  },

  // Shadows — preserved for glow-discipline zones
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 4px 12px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
    glow: '0 0 16px rgba(139, 92, 246, 0.1)',
    greenGlow: '0 0 16px rgba(0, 231, 1, 0.12)',
    redGlow: '0 0 16px rgba(255, 51, 51, 0.12)',
    neonBtn: '0 0 20px rgba(0, 231, 1, 0.25), 0 0 40px rgba(0, 231, 1, 0.1)',
  },

  // Radii — xs added, xl fixed to 16px
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '16px',
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

  // Spacing — micro (2-8) + layout (12-48)
  space: {
    '2': '2px',    // micro: dot-to-text, icon badge offset
    xs: '4px',     // micro: icon-to-label, badge padding-y
    '6': '6px',    // micro: chip gap, tag padding-x
    sm: '8px',     // micro: row-to-row inside panel
    '12': '12px',  // layout: mobile padding, section gap in panel
    md: '16px',    // layout: panel padding, gap between panels
    '20': '20px',  // layout: desktop page padding-x
    lg: '24px',    // layout: section-to-section
    xl: '32px',    // layout: major section break
    '2xl': '48px', // layout: hero spacing
    '3xl': '64px',
  },

  // ─── Wave 1: Strict spacing tokens (gap system) ───
  gap: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  // ─── Wave 1: Typography floor tokens (px values) ───
  textSize: {
    xs: { mobile: 11, desktop: 11 },     // round ID, seed hash, timestamps
    sm: { mobile: 12, desktop: 13 },     // badges, chips, secondary info
    md: { mobile: 13, desktop: 14 },     // body text, bet amounts
    lg: { mobile: 16, desktop: 18 },     // section headers, game name
    xl: { mobile: 20, desktop: 24 },     // primary numbers (balance, multiplier)
    hero: { mobile: 28, desktop: 36 },   // hero result (win amount, big multiplier)
  },

  layout: {
    headerHeight: '64px',
    sidebarWidth: '240px',
    sidebarCollapsed: '64px',
    bottomNavHeight: '56px',
    maxWidth: '1200px',
    narrowWidth: '820px',
    gameWidth: '960px',
  },
} as const;

export type Theme = typeof theme;
