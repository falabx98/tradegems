// ─── Admin Backoffice Theme ─────────────────────────────────────────────────

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

  // Solana gradient
  gradient: {
    solana: 'linear-gradient(135deg, #9945FF, #14F195)',
    solanaHover: 'linear-gradient(135deg, #8839e6, #12d986)',
  },

  // Semantic colors
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#5b8def',

  // VIP tiers
  vip: {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    titan: '#ff6b35',
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
  },

  // Spacing
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
} as const;

export type Theme = typeof theme;
