// ─── Trading Arena Theme ─────────────────────────────────────────────────────

export const theme = {
  // Core backgrounds
  bg: {
    primary: '#111114',
    secondary: '#18181b',
    tertiary: '#1f1f23',
    card: '#222226',
    elevated: '#2a2a2e',
    overlay: 'rgba(17, 17, 20, 0.88)',
  },

  // Text
  text: {
    primary: '#ececef',
    secondary: '#8a8a8e',
    muted: '#555559',
    inverse: '#111114',
  },

  // Accent colors
  accent: {
    cyan: '#6c9cff',
    purple: '#9945FF',
    blue: '#5b8def',
    indigo: '#8b8bf5',
    green: '#14F195',
  },

  // Solana gradient for buttons
  gradient: {
    solana: 'linear-gradient(135deg, #9945FF, #14F195)',
    solanaHover: 'linear-gradient(135deg, #8839e6, #12d986)',
    chart: 'linear-gradient(90deg, #6c9cff, #9945FF)',
  },

  // Semantic colors
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#5b8def',

  // Game-specific
  game: {
    multiplier: '#34d399',
    divider: '#f87171',
    shield: '#5b8def',
    fakeBreakout: '#fbbf24',
    volatilitySpike: '#8b8bf5',
    chartLine: '#6c9cff',
    chartGlow: 'rgba(108, 156, 255, 0.2)',
    chartFill: 'rgba(108, 156, 255, 0.04)',
    nodeGlow: 'rgba(52, 211, 153, 0.4)',
    nodeDanger: 'rgba(248, 113, 113, 0.4)',
  },

  // VIP tiers
  vip: {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    titan: '#ff6b35',
  },

  // Phase colors
  phase: {
    opening: '#4ade80',
    buildup: '#facc15',
    chaos: '#ef4444',
    final: '#a855f7',
    frozen: '#6366f1',
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.07)',
    medium: 'rgba(255, 255, 255, 0.10)',
    strong: 'rgba(255, 255, 255, 0.14)',
    accent: 'rgba(108, 156, 255, 0.2)',
  },

  // Shadows
  shadow: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
    md: '0 2px 8px rgba(0, 0, 0, 0.4)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },

  // Radii
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Font sizes
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
    hero: '5rem',
  },

  // Spacing
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
} as const;

export type Theme = typeof theme;
