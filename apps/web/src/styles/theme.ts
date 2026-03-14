// ─── TRADESOL Theme (Shuffle.com-inspired dark casino) ──────────────────────

export const theme = {
  // Core backgrounds — near-black like shuffle
  bg: {
    primary: '#080808',       // main background (shuffle: #080808)
    secondary: '#121418',     // sidebar, header (shuffle: rgb(18,20,24))
    tertiary: '#1a1d24',      // elevated surfaces
    card: '#1e2128',          // card backgrounds
    elevated: '#202329',      // inputs, search (shuffle: rgb(32,35,41))
    overlay: 'rgba(8, 8, 8, 0.92)',
  },

  // Text
  text: {
    primary: '#ffffff',
    secondary: '#bec6d1',     // shuffle: rgb(190,198,209)
    muted: '#6b7280',         // gray-500
    inverse: '#080808',
  },

  // Accent colors — shuffle purple palette
  accent: {
    purple: '#7717ff',        // shuffle primaryNeonPurple
    violet: '#886cff',        // shuffle primaryViolet
    blue: '#4185f0',          // shuffle lightBlue
    green: '#00bd71',         // shuffle btnGreen
    cyan: '#856ffc',          // shuffle primary-color
  },

  // Primary gradients
  gradient: {
    primary: 'linear-gradient(135deg, #7717ff, #886cff)',
    primaryHover: 'linear-gradient(135deg, #6610e6, #7a5ff0)',
    wallet: 'linear-gradient(135deg, #7717ff, #9945ff)',
    card: 'linear-gradient(145deg, #1e2128 0%, #1a1d24 100%)',
    green: 'linear-gradient(135deg, #00bd71, #34d399)',
    // Game-specific
    rugGame: 'linear-gradient(135deg, #450a0a, #dc2626)',
    candleflip: 'linear-gradient(135deg, #713f12, #eab308)',
    tradingSim: 'linear-gradient(135deg, #064e3b, #0d9488)',
    liveCard: 'linear-gradient(145deg, #1a1d24 0%, rgba(119,23,255,0.04) 100%)',
    // Text gradients
    goldText: 'linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24)',
    greenText: 'linear-gradient(135deg, #34d399, #10b981, #34d399)',
    redText: 'linear-gradient(135deg, #f87171, #ef4444, #f87171)',
    purpleText: 'linear-gradient(135deg, #7717ff, #886cff, #c084fc)',
  },

  // Semantic colors
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#4185f0',

  // Game-specific
  game: {
    multiplier: '#34d399',
    divider: '#f87171',
    shield: '#4185f0',
    fakeBreakout: '#fbbf24',
    volatilitySpike: '#886cff',
    chartLine: '#7717ff',
    chartGlow: 'rgba(119, 23, 255, 0.2)',
    chartFill: 'rgba(119, 23, 255, 0.04)',
    nodeGlow: 'rgba(0, 189, 113, 0.4)',
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
    final: '#886cff',
    frozen: '#4185f0',
  },

  // Borders — subtle gray, not purple
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    medium: 'rgba(255, 255, 255, 0.1)',
    strong: 'rgba(255, 255, 255, 0.15)',
    accent: 'rgba(119, 23, 255, 0.3)',
  },

  // Shadows
  shadow: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.5)',
    md: '0 2px 8px rgba(0, 0, 0, 0.6)',
    lg: '0 4px 20px rgba(0, 0, 0, 0.6)',
  },

  // Radii — shuffle uses 6px everywhere
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Font sizes
  fontSize: {
    xs: '0.75rem',      // 12px
    sm: '0.875rem',     // 14px
    base: '1rem',       // 16px
    md: '1.125rem',     // 18px
    lg: '1.375rem',     // 22px (shuffle headings)
    xl: '1.625rem',     // 26px
    '2xl': '2.25rem',
    '3xl': '2.75rem',
    '4xl': '3.75rem',
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

  // Layout
  layout: {
    headerHeight: '64px',
    sidebarWidth: '64px',
    bottomNavHeight: '60px',
    maxWidth: '1280px',
  },
} as const;

export type Theme = typeof theme;
