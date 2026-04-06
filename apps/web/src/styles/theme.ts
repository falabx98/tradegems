// ─── TradeGems v6 — Redesign Design System ───────────────────────────────────
// Stake-inspired dark mode: layered surfaces, high contrast text, subtle borders.
// Purple = brand / CTAs. Green = wins/money. Red = losses. Amber = warnings/live.

export const theme = {

  // ═══════════════════════════════════════════════════════════
  // BACKGROUNDS — 4 clearly distinguishable surface layers
  // ═══════════════════════════════════════════════════════════
  bg: {
    base:     '#0E0E12',     // page background, deepest layer
    sidebar:  '#141418',     // sidebar, header, nav
    surface:  '#1C1C21',     // cards, panels, content areas
    elevated: '#26262C',     // dropdowns, modals, hover states

    // Semantic aliases (mapped to layers)
    primary:   '#0E0E12',   // ← base
    secondary: '#141418',   // ← sidebar
    tertiary:  '#1C1C21',   // ← surface
    card:      '#1C1C21',   // ← surface
    input:     '#0E0E12',   // input fields sit on base
    overlay:   'rgba(0, 0, 0, 0.80)',

    // Game-specific panels
    gameRail:  '#141418',   // ← sidebar
    gameStage: '#1C1C21',   // ← surface
    gameFooter:'#141418',   // ← sidebar
  },

  // ═══════════════════════════════════════════════════════════
  // TEXT — high contrast hierarchy
  // ═══════════════════════════════════════════════════════════
  text: {
    primary:   '#FFFFFF',
    secondary: '#B8C4DC',
    muted:     '#6B7B99',
    disabled:  '#3D4A66',
    inverse:   '#0E0E12',
  },

  // ═══════════════════════════════════════════════════════════
  // ACCENT COLORS
  // ═══════════════════════════════════════════════════════════
  accent: {
    // Brand — primary violet
    primary:      '#8B5CF6',
    primaryHover: '#7C3AED',
    purple:       '#8B5CF6',     // alias for backward compat
    violet:       '#7C3AED',     // alias for backward compat
    lavender:     '#a78bfa',     // lighter brand tint

    // Functional
    green:     '#00E676',        // wins, profits, deposits
    neonGreen: '#00E676',        // alias for backward compat
    red:       '#FF3B3B',        // losses, danger, bust
    amber:     '#FFB300',        // warnings, XP, LIVE badges
    gold:      '#FFD700',        // VIP, jackpots
    blue:      '#3b82f6',        // info, links
    cyan:      '#06B6D4',        // secondary highlight, links
    secondary: '#06B6D4',        // alias
  },

  // ═══════════════════════════════════════════════════════════
  // GAME STATES — semantic colors + background tints
  // ═══════════════════════════════════════════════════════════
  gameState: {
    win:     '#00E676',
    winBg:   'rgba(0, 230, 118, 0.08)',
    loss:    '#FF3B3B',
    lossBg:  'rgba(255, 59, 59, 0.08)',
    live:    '#FFB300',
    liveBg:  'rgba(255, 179, 0, 0.12)',
  },

  // ═══════════════════════════════════════════════════════════
  // GRADIENTS
  // ═══════════════════════════════════════════════════════════
  gradient: {
    // Brand
    primary:     'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #a78bfa 100%)',
    primaryHover:'linear-gradient(135deg, #6d28d9 0%, #7C3AED 50%, #8B5CF6 100%)',
    secondary:   'linear-gradient(135deg, #3b82f6, #2563eb)',

    // Functional
    green:       'linear-gradient(135deg, #059669, #10b981)',
    greenHover:  'linear-gradient(135deg, #047857, #059669)',
    neonGreen:   'linear-gradient(135deg, #00C800, #00E676)',
    danger:      'linear-gradient(135deg, #ef4444, #FF3B3B)',

    // UI
    pill:        'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
    pillHover:   'linear-gradient(135deg, #6d28d9 0%, #7C3AED 100%)',
    card:        '#1C1C21',
    cardHover:   '#26262C',
    glass:       'rgba(23, 27, 46, 0.95)',
    wallet:      'linear-gradient(135deg, #7C3AED, #8B5CF6)',

    // Game-specific
    rugGame:     'linear-gradient(135deg, #7f1d1d, #dc2626)',
    candleflip:  'linear-gradient(135deg, #92400e, #d97706)',
    tradingSim:  'linear-gradient(135deg, #064e3b, #059669)',
    liveCard:    '#1C1C21',

    // Text gradients
    purpleText:  'linear-gradient(135deg, #8B5CF6, #a78bfa)',
    greenText:   'linear-gradient(135deg, #00E676, #00C853)',
    redText:     'linear-gradient(135deg, #FF3B3B, #ef4444)',
    blueText:    'linear-gradient(135deg, #3b82f6, #60a5fa)',
    amberText:   'linear-gradient(135deg, #FFB300, #ffc107)',
  },

  // ═══════════════════════════════════════════════════════════
  // SEMANTIC STATUS (top-level shortcuts)
  // ═══════════════════════════════════════════════════════════
  success: '#00E676',
  warning: '#FFB300',
  danger:  '#FF3B3B',
  info:    '#3b82f6',

  // ═══════════════════════════════════════════════════════════
  // GAME COLORS — chart, nodes, events
  // ═══════════════════════════════════════════════════════════
  game: {
    multiplier:     '#00E676',
    divider:        '#FF3B3B',
    shield:         '#3b82f6',
    fakeBreakout:   '#FFB300',
    volatilitySpike:'#8B5CF6',
    chartLine:      '#00E676',
    chartGlow:      'rgba(0, 230, 118, 0.15)',
    chartFill:      'rgba(0, 230, 118, 0.03)',
    nodeGlow:       'rgba(0, 230, 118, 0.3)',
    nodeDanger:     'rgba(255, 59, 59, 0.3)',
  },

  // ═══════════════════════════════════════════════════════════
  // VIP TIERS
  // ═══════════════════════════════════════════════════════════
  vip: {
    bronze:   '#cd7f32',
    silver:   '#c0c0c0',
    gold:     '#FFD700',
    platinum: '#e5e4e2',
    titan:    '#ff6b35',
  },

  // ═══════════════════════════════════════════════════════════
  // BORDERS
  // ═══════════════════════════════════════════════════════════
  border: {
    subtle:   'rgba(255, 255, 255, 0.06)',
    default:  'rgba(255, 255, 255, 0.10)',
    strong:   'rgba(255, 255, 255, 0.16)',
    focus:    '#8B5CF6',

    // Backward compat aliases
    medium:   'rgba(255, 255, 255, 0.10)',   // → default
    card:     'rgba(255, 255, 255, 0.06)',   // → subtle
    accent:   'rgba(139, 92, 246, 0.2)',
    glow:     'rgba(139, 92, 246, 0.1)',
    greenGlow:'rgba(0, 230, 118, 0.15)',
  },

  // ═══════════════════════════════════════════════════════════
  // SHADOWS
  // ═══════════════════════════════════════════════════════════
  shadow: {
    sm:       '0 1px 3px rgba(0, 0, 0, 0.2)',
    md:       '0 4px 12px rgba(0, 0, 0, 0.3)',
    lg:       '0 8px 24px rgba(0, 0, 0, 0.4)',
    glow:     '0 0 16px rgba(139, 92, 246, 0.1)',
    greenGlow:'0 0 16px rgba(0, 230, 118, 0.12)',
    redGlow:  '0 0 16px rgba(255, 59, 59, 0.12)',
    neonBtn:  '0 0 20px rgba(0, 230, 118, 0.25), 0 0 40px rgba(0, 230, 118, 0.1)',
  },

  // ═══════════════════════════════════════════════════════════
  // BORDER RADIUS
  // ═══════════════════════════════════════════════════════════
  radius: {
    xs:   '4px',
    sm:   '6px',
    md:   '8px',
    lg:   '12px',
    xl:   '16px',
    '2xl':'16px',
    full: '9999px',
  },

  // ═══════════════════════════════════════════════════════════
  // SPACING — pixel values for gap/padding/margin
  // ═══════════════════════════════════════════════════════════
  gap: {
    xs:   4,
    sm:   8,
    md:   12,
    lg:   16,
    xl:   24,
    '2xl':32,
    '3xl':48,
  },

  // ═══════════════════════════════════════════════════════════
  // TYPOGRAPHY — responsive px values { mobile, desktop }
  // ═══════════════════════════════════════════════════════════
  textSize: {
    xs:   { mobile: 11, desktop: 11 },   // timestamps, seed hashes
    sm:   { mobile: 12, desktop: 13 },   // badges, chips, captions
    md:   { mobile: 14, desktop: 14 },   // body text, bet amounts
    lg:   { mobile: 16, desktop: 18 },   // section headers
    xl:   { mobile: 20, desktop: 24 },   // balance, multiplier
    hero: { mobile: 28, desktop: 40 },   // hero results, big numbers
  },

  // Full typography specs (new)
  type: {
    display: {
      hero:  { size: { mobile: 28, desktop: 40 }, weight: 800, family: 'Inter' },
      title: { size: { mobile: 22, desktop: 28 }, weight: 700, family: 'Inter' },
    },
    heading: {
      lg: { size: { mobile: 18, desktop: 22 }, weight: 700, family: 'Inter' },
      md: { size: { mobile: 16, desktop: 18 }, weight: 600, family: 'Inter' },
    },
    body: {
      lg: { size: 16, weight: 500, family: 'Inter' },
      md: { size: 14, weight: 400, family: 'Inter' },
      sm: { size: 12, weight: 400, family: 'Inter' },
    },
    mono: {
      lg: { size: { mobile: 22, desktop: 28 }, weight: 700, family: "'JetBrains Mono', monospace" },
      md: { size: 16, weight: 500, family: "'JetBrains Mono', monospace" },
      sm: { size: 13, weight: 400, family: "'JetBrains Mono', monospace" },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // LAYOUT DIMENSIONS
  // ═══════════════════════════════════════════════════════════
  layout: {
    headerHeight:    '60px',
    sidebarWidth:    '220px',
    sidebarCollapsed:'60px',
    bottomNavHeight: '64px',
    maxWidth:        '1200px',
    narrowWidth:     '820px',
    gameWidth:       '960px',
  },

  // ═══════════════════════════════════════════════════════════
  // DEPRECATED — kept for backward compat, will be removed
  // ═══════════════════════════════════════════════════════════
  /** @deprecated use gameState instead */
  phase: {
    opening: '#00E676',
    buildup: '#3b82f6',
    chaos:   '#FF3B3B',
    final:   '#8B5CF6',
    frozen:  '#06B6D4',
  },

} as const;

export type Theme = typeof theme;
