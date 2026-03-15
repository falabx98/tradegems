import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { GiftIcon } from '../ui/GameIcons';
import { LiveDot, GameTypeBadge, timeAgo } from '../ui/LiveIndicators';
import { ActivityFeed } from '../ActivityFeed';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { StatCard } from '../ui/StatCard';

/* ─── BANNER DATA ─── */

interface BannerData {
  id: string;
  headline: string;
  accentWord: string;
  subtitle: string;
  cta: string;
  gradient: string;
  accentColor: string;
  action: 'bonus' | 'referrals' | 'rewards';
  glowColor: string;
}

const BANNERS: BannerData[] = [
  {
    id: 'welcome-bonus',
    headline: '100% DEPOSIT',
    accentWord: 'BONUS',
    subtitle: 'Double your first deposit. We match it 100% — start trading with 2x the power.',
    cta: 'Claim Bonus',
    gradient: 'linear-gradient(135deg, #1a0533 0%, #2d1052 30%, #4c1d95 60%, #7c3aed 100%)',
    accentColor: theme.accent.purple,
    action: 'bonus',
    glowColor: 'rgba(139, 92, 246, 0.3)',
  },
  {
    id: 'referral',
    headline: 'INVITE & EARN',
    accentWord: '10%',
    subtitle: 'Share your code. Earn on every trade your friends make — forever.',
    cta: 'Get Referral Link',
    gradient: 'linear-gradient(135deg, #0a1628 0%, #0f2847 30%, #1e3a5f 60%, #3b82f6 100%)',
    accentColor: theme.accent.blue,
    action: 'referrals',
    glowColor: 'rgba(59, 130, 246, 0.3)',
  },
  {
    id: 'daily-rewards',
    headline: 'DAILY',
    accentWord: 'REWARDS',
    subtitle: 'Claim rakeback, XP boosts & VIP bonuses. Log in every day to level up faster.',
    cta: 'Claim Now',
    gradient: 'linear-gradient(135deg, #1a0a00 0%, #3d1f00 30%, #6b3a00 60%, #d97706 100%)',
    accentColor: theme.accent.amber,
    action: 'rewards',
    glowColor: 'rgba(217, 119, 6, 0.3)',
  },
];

/* ─── CATEGORY CARDS (hero right side) ─── */

interface CategoryCard {
  id: string;
  title: string;
  subtitle: string;
  gradient: string;
  route: string;
}

const CATEGORY_CARDS: CategoryCard[] = [
  { id: 'pvp', title: 'PVP', subtitle: 'Compete & Win', gradient: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)', route: 'candleflip' },
  { id: 'solo', title: 'SOLO', subtitle: 'Trade the Chart', gradient: 'linear-gradient(135deg, #059669 0%, #22d3ee 100%)', route: 'setup' },
  { id: 'lottery', title: 'LOTTERY', subtitle: 'Jackpot Draws', gradient: 'linear-gradient(135deg, #d97706 0%, #ffaa00 100%)', route: 'lottery' },
  { id: 'rewards', title: 'REWARDS', subtitle: 'Earn & Collect', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', route: 'rewards' },
];

/* ─── GAME DEFINITIONS ─── */

type GameCategory = 'all' | 'pvp' | 'solo' | 'jackpot';

interface GameCardDef {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  image: string;
  category: GameCategory[];
  gradientOverlay: string;
  isLive?: boolean;
}

const GAME_DEFS: GameCardDef[] = [
  { id: 'solo', route: 'setup', title: 'Solo', subtitle: 'Trade vs. the chart', image: '/game-solo.png', category: ['solo'], gradientOverlay: 'linear-gradient(135deg, rgba(139,92,246,0.35) 0%, rgba(59,130,246,0.20) 100%)' },
  { id: 'predictions', route: 'prediction', title: 'Predictions', subtitle: 'Up or Down?', image: '/game-predictions.png', category: ['solo'], gradientOverlay: 'linear-gradient(135deg, rgba(59,130,246,0.35) 0%, rgba(139,92,246,0.20) 100%)' },
  { id: 'trading-sim', route: 'trading-sim', title: 'Trading Sim', subtitle: 'PvP Trading Arena', image: '/game-trading-sim.png', category: ['pvp'], gradientOverlay: 'linear-gradient(135deg, rgba(6,78,59,0.55) 0%, rgba(5,150,105,0.30) 100%)', isLive: true },
  { id: 'candleflip', route: 'candleflip', title: 'Candleflip', subtitle: 'Over/Under 1.00x', image: '/game-candleflip.png', category: ['pvp'], gradientOverlay: 'linear-gradient(135deg, rgba(146,64,14,0.55) 0%, rgba(217,119,6,0.30) 100%)', isLive: true },
  { id: 'rug-game', route: 'rug-game', title: 'Rug Game', subtitle: 'Cash Out or Get Rugged', image: '/game-rug-game.png', category: ['pvp'], gradientOverlay: 'linear-gradient(135deg, rgba(127,29,29,0.55) 0%, rgba(220,38,38,0.30) 100%)', isLive: true },
  { id: 'lottery', route: 'lottery', title: 'Lottery', subtitle: 'Jackpot Draws', image: '/game-lottery.png', category: ['jackpot'], gradientOverlay: 'linear-gradient(135deg, rgba(161,139,40,0.55) 0%, rgba(255,170,0,0.30) 100%)' },
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Games' },
  { id: 'pvp', label: 'PvP' },
  { id: 'solo', label: 'Solo' },
  { id: 'jackpot', label: 'Jackpot' },
];

/* ═══════════════════════════════════════════════════════════════
   LOBBY SCREEN
   ═══════════════════════════════════════════════════════════════ */

export function LobbyScreen() {
  const isMobile = useIsMobile();
  const { profile, syncProfile } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const go = useAppNavigate();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [liveStats, setLiveStats] = useState({ active: 0, volume: '0', topWin: '1.0x' });
  const [rugRecent, setRugRecent] = useState<any[]>([]);
  const [candleRecent, setCandleRecent] = useState<any[]>([]);
  const [tradingRooms, setTradingRooms] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const [rug, candle, trading] = await Promise.all([
          api.getRugGameRecentRounds(3).catch(() => ({ rounds: [] })),
          api.getCandleflipRecentRounds(3).catch(() => ({ rounds: [] })),
          api.getTradingSimRooms().catch(() => ({ rooms: [] })),
        ]);
        setRugRecent(rug.rounds || []);
        setCandleRecent(candle.rounds || []);
        setTradingRooms(trading.rooms || []);
      } catch {}
    };
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 5000);
    return () => clearInterval(interval);
  }, []);

  const allRecent = [
    ...rugRecent.map(g => ({ ...g, gameType: 'rug' as const, time: g.resolvedAt })),
    ...candleRecent.map(g => ({ ...g, gameType: 'candle' as const, time: g.resolvedAt })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 3);

  const activeRoomCount = tradingRooms.filter(r => r.status === 'waiting' || r.status === 'active').length;

  useEffect(() => {
    (async () => {
      const [profitRes, multRes, onlineRes] = await Promise.all([
        api.getLeaderboard('profit', 'daily').catch(() => ({ data: [] })) as any,
        api.getLeaderboard('multiplier', 'daily').catch(() => ({ data: [] })) as any,
        api.getOnlineCount().catch(() => ({ onlineCount: 0 })),
      ]);
      const profitData = profitRes.data || [];
      const multData = multRes.data || [];
      const totalVol = profitData.reduce((sum: number, e: any) => sum + Math.abs(Number(e.score || 0)), 0);
      const topMult = multData.reduce((max: number, e: any) => Math.max(max, Number(e.score || 0)), 0);
      setLiveStats({
        active: onlineRes.onlineCount || profitData.length || 0,
        volume: `${formatSol(totalVol)}`,
        topWin: topMult > 1 ? `${topMult.toFixed(1)}x` : '1.0x',
      });
    })();
  }, []);

  const handleBannerClick = (banner: BannerData) => {
    if (banner.action === 'bonus') {
      if (!isAuthenticated) go('auth'); else go('wallet');
    } else if (banner.action === 'referrals' || banner.action === 'rewards') {
      if (!isAuthenticated) setShowAuthPrompt(true); else go('rewards');
    }
  };

  const isGameLive = (id: string): boolean => {
    if (id === 'candleflip') return candleRecent.length > 0;
    if (id === 'rug-game') return rugRecent.length > 0;
    if (id === 'trading-sim') return activeRoomCount > 0;
    return false;
  };

  const getLiveExtra = (id: string) => {
    if (id === 'candleflip' && candleRecent.length > 0) {
      return (
        <span style={s.liveDataRow}>
          {candleRecent.slice(0, 5).map((r: any, i: number) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: r.result === 'bullish' ? theme.accent.green : theme.accent.red, display: 'inline-block' }} />
          ))}
        </span>
      );
    }
    if (id === 'rug-game' && rugRecent.length > 0) {
      const last = rugRecent[0];
      return (
        <span style={{ ...s.liveDataRow, marginTop: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: theme.accent.green }} className="mono">
            {Number(last.rugMultiplier).toFixed(2)}x — {last.playerCount}p
          </span>
        </span>
      );
    }
    if (id === 'trading-sim' && activeRoomCount > 0) {
      return (
        <span style={{ ...s.liveDataRow, marginTop: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: theme.accent.green }} className="mono">
            {activeRoomCount} room{activeRoomCount !== 1 ? 's' : ''} live
          </span>
        </span>
      );
    }
    return null;
  };

  // Filter games
  const filteredGames = GAME_DEFS.filter(g => {
    const matchesCategory = activeCategory === 'all' || g.category.includes(activeCategory as GameCategory);
    const matchesSearch = !searchQuery || g.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  /* ─── HERO SECTION ─── */
  const heroSection = (
    <div style={isMobile ? s.heroMobile : s.hero}>
      {/* Left — Banner Carousel */}
      <div style={isMobile ? s.heroBannerMobile : s.heroBanner}>
        <BannerCarousel isMobile={isMobile} onBannerClick={handleBannerClick} />
      </div>

      {/* Right — Category Cards 2x2 (desktop only) */}
      {!isMobile && (
        <div style={s.heroCategoryGrid}>
          {CATEGORY_CARDS.map((cat) => (
            <div
              key={cat.id}
              onClick={() => go(cat.route as any)}
              style={{
                ...s.categoryCard,
                background: cat.gradient,
                border: hoveredCard === `cat-${cat.id}` ? `1px solid rgba(255,255,255,0.2)` : `1px solid rgba(255,255,255,0.08)`,
                transform: hoveredCard === `cat-${cat.id}` ? 'translateY(-1px)' : 'none',
              }}
              onMouseEnter={() => setHoveredCard(`cat-${cat.id}`)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={s.categoryCardContent}>
                <span style={s.categoryTitle}>{cat.title}</span>
                <span style={s.categorySub}>{cat.subtitle}</span>
              </div>
              <button style={s.categoryPlayBtn}>Play</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ─── SEARCH & FILTER BAR ─── */
  const searchBar = (
    <div style={s.searchRow}>
      <div style={s.searchInputWrap}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search games..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={s.searchInput}
        />
      </div>
      <div style={s.filterRow}>
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              ...s.filterBtn,
              ...(activeCategory === cat.id ? s.filterBtnActive : {}),
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );

  /* ─── GAME CARDS GRID ─── */
  const gameCardsSection = (
    <div>
      <div style={s.sectionHeader}>
        <span style={s.sectionTitle}>
          {activeCategory === 'all' ? 'All Games' : CATEGORY_FILTERS.find(c => c.id === activeCategory)?.label || 'Games'}
        </span>
        <span style={s.gameCount}>{filteredGames.length} games</span>
      </div>
      <div style={{ ...s.gameGrid, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)' }}>
        {filteredGames.map((game) => {
          const live = isGameLive(game.id);
          const hovered = hoveredCard === game.id;
          return (
            <div
              key={game.id}
              onClick={() => go(game.route as any)}
              onMouseEnter={() => setHoveredCard(game.id)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                ...s.gameCard,
                border: hovered ? `1px solid rgba(139, 92, 246, 0.45)` : `1px solid ${theme.border.subtle}`,
                transform: hovered ? 'scale(1.02)' : 'scale(1)',
                boxShadow: hovered
                  ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.15)`
                  : `0 2px 8px rgba(0,0,0,0.3)`,
              }}
            >
              <img src={game.image} alt={game.title} draggable={false} style={s.gameCardImg} />
              <div style={{ ...s.gameCardGradTop, background: game.gradientOverlay }} />
              <div style={s.gameCardGradBottom} />

              {live && (
                <div style={s.liveBadge}>
                  <LiveDot size={5} color={theme.accent.green} />
                  <span style={s.liveBadgeText}>LIVE</span>
                </div>
              )}

              <div style={s.gameCardContent}>
                <span style={s.gameCardTitle}>{game.title}</span>
                <span style={s.gameCardSub}>{game.subtitle}</span>
                {getLiveExtra(game.id)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ─── STATS STRIP ─── */
  const statsStrip = (
    <div style={s.statsStrip}>
      <div style={s.statItem}>
        <LiveDot size={5} color={theme.accent.green} />
        <span style={s.statItemLabel}>{liveStats.active} Players Online</span>
      </div>
      <div style={s.statDividerV} />
      <div style={s.statItem}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
        <span style={s.statItemLabel}>24h Volume: <span style={{ color: theme.text.primary, fontWeight: 700 }} className="mono">{liveStats.volume} SOL</span></span>
      </div>
      <div style={s.statDividerV} />
      <div style={s.statItem}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.accent.amber} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
        <span style={s.statItemLabel}>Top Win: <span style={{ color: theme.accent.amber, fontWeight: 700 }} className="mono">{liveStats.topWin}</span></span>
      </div>
    </div>
  );

  /* ─── LIVE ACTIVITY ─── */
  const liveActivitySection = allRecent.length > 0 && (
    <div style={s.liveSection}>
      <div style={s.liveSectionHeader}>
        <LiveDot size={6} />
        <span style={s.liveSectionTitle}>Live Action</span>
      </div>
      {allRecent.map((item, i) => (
        <div key={i} style={{ ...s.liveRow, borderBottom: i < allRecent.length - 1 ? `1px solid ${theme.border.subtle}` : 'none' }}>
          <GameTypeBadge type={item.gameType === 'rug' ? 'rug' : 'candle'} />
          <span style={s.liveRowText}>
            {item.gameType === 'rug'
              ? `Rug ${Number(item.rugMultiplier).toFixed(2)}x — ${item.playerCount} player${item.playerCount !== 1 ? 's' : ''}`
              : `${item.result === 'bullish' ? 'Bull' : 'Bear'} flip — ${Number(item.resultMultiplier).toFixed(2)}x`
            }
          </span>
          {item.time && <span style={s.liveRowTime}>{timeAgo(item.time)}</span>}
        </div>
      ))}
    </div>
  );

  const bonusCard = isAuthenticated && (
    <div style={s.bonusCard} onClick={() => go('wallet')}>
      <div style={s.bonusInner}>
        <div style={s.bonusIconWrap}>
          <GiftIcon size={isMobile ? 20 : 24} color={theme.accent.purple} />
        </div>
        <div style={s.bonusText}>
          <span style={s.bonusTitle}>100% Deposit Bonus</span>
          <span style={s.bonusDesc}>{isMobile ? 'Double your first deposit!' : 'Double your first deposit — we match it 100%!'}</span>
        </div>
        <span style={s.bonusArrow}>Deposit →</span>
      </div>
    </div>
  );

  const authModal = showAuthPrompt && (
    <div style={s.authOverlay} onClick={() => setShowAuthPrompt(false)}>
      <div style={s.authModal} onClick={(e) => e.stopPropagation()}>
        <div style={s.authModalGlow} />
        <span style={s.authTitle}>Sign in to play</span>
        <span style={s.authDesc}>Create an account or sign in to start trading rounds.</span>
        <button style={s.authBtn} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>Sign in / Register</button>
        <button style={s.authDismiss} onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
      </div>
    </div>
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div style={{ ...s.container, padding: '10px', gap: '12px' }}>
        {heroSection}

        {/* Mobile category pills */}
        <div style={s.mobileCategoryRow}>
          {CATEGORY_CARDS.map((cat) => (
            <div key={cat.id} onClick={() => go(cat.route as any)} style={{ ...s.mobileCategoryPill, background: cat.gradient }}>
              <span style={s.mobileCategoryLabel}>{cat.title}</span>
            </div>
          ))}
        </div>

        {searchBar}
        {gameCardsSection}
        {statsStrip}
        {liveActivitySection}
        <LiveWinsTicker />
        <TopPlayers />
        {bonusCard}
        <ActivityFeed />
        {authModal}
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <div style={s.container}>
      {heroSection}
      {searchBar}

      <div style={s.columns}>
        <div style={s.leftCol}>
          {gameCardsSection}
          {statsStrip}
          {liveActivitySection}
          <LiveWinsTicker />
          <TopPlayers />
        </div>

        <div style={s.rightCol}>
          {/* Stats Panel */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Stats</span>
            </div>
            <div style={s.statsBody}>
              <div style={s.balanceRow}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '22px', height: '22px', flexShrink: 0 }} />
                <span style={s.balanceBig} className="mono">{formatSol(profile.balance)} SOL</span>
              </div>
              <div style={s.statDivider} />
              <div style={s.levelVipRow}>
                <div style={s.statChip}>
                  <span style={s.statChipLabel}>LVL</span>
                  <span style={s.statChipValue} className="mono">{profile.level}</span>
                </div>
                <div style={{
                  ...s.statChip,
                  background: `${(theme.vip as any)[profile.vipTier] || theme.accent.purple}15`,
                  border: `1px solid ${(theme.vip as any)[profile.vipTier] || theme.accent.purple}30`,
                }}>
                  <span style={{
                    ...s.statChipValue,
                    color: (theme.vip as any)[profile.vipTier] || theme.text.secondary,
                    fontSize: '12px',
                    fontWeight: 700,
                  }}>{profile.vipTier}</span>
                </div>
              </div>
              <div style={s.statDivider} />
              <StatRow label="Rounds" value={`${profile.roundsPlayed}`} />
              <StatRow label="Best" value={`${profile.bestMultiplier.toFixed(1)}x`} color={theme.game.multiplier} />
              <div style={s.statDivider} />
              <StatRow label="XP" value={`${profile.xp}/${profile.xpToNext}`} color={theme.accent.purple} />
              <div style={s.xpBarContainer}>
                <div style={{ ...s.xpBar, width: `${(profile.xp / profile.xpToNext) * 100}%` }} />
              </div>
            </div>
          </div>

          {bonusCard}
          <ActivityFeed />
        </div>
      </div>

      {authModal}
    </div>
  );
}

/* ─── SUB COMPONENTS ─── */

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statValue, color: color || theme.text.primary }} className="mono">{value}</span>
    </div>
  );
}

function TopPlayers() {
  const [players, setPlayers] = useState<Array<{ username: string; score: number }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getLeaderboard('profit', 'all') as any;
        setPlayers((res.data || []).slice(0, 5).map((p: any) => ({
          username: p.username || 'Anonymous',
          score: Number(p.score || 0),
        })));
      } catch { /* ignore */ }
    })();
  }, []);

  if (players.length === 0) return null;
  const medals = ['#8b5cf6', '#94a3b8', '#cd7f32'];

  return (
    <div style={s.liveSection}>
      <div style={s.liveSectionHeader}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.accent.purple} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
        <span style={s.liveSectionTitle}>Top Players</span>
      </div>
      {players.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: i < players.length - 1 ? `1px solid ${theme.border.subtle}` : 'none' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: i < 3 ? `${medals[i]}20` : theme.bg.tertiary, color: i < 3 ? medals[i] : theme.text.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>{i + 1}</span>
          <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: getAvatarGradient(null, p.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#fff' }}>{getInitials(p.username)}</div>
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.username}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accent.purple }} className="mono">{(p.score / 1e9).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function LiveWinsTicker() {
  const [wins, setWins] = useState<Array<{ id: number; username: string; feedType: string; multiplier: number; profit: number }>>([]);

  useEffect(() => {
    const fetchWins = async () => {
      try {
        const res = await api.getActivityFeed(20);
        const items = (res.data || []) as any[];
        setWins(items.filter((i: any) => i.payload.payout > i.payload.betAmount).map((i: any) => ({
          id: i.id,
          username: i.payload.username,
          feedType: i.feedType === 'prediction_result' ? 'PRED' : 'SOLO',
          multiplier: Number(i.payload.multiplier) || 0,
          profit: i.payload.payout - i.payload.betAmount,
        })));
      } catch { /* ignore */ }
    };
    fetchWins();
    const interval = setInterval(fetchWins, 8000);
    return () => clearInterval(interval);
  }, []);

  if (wins.length === 0) return null;
  const doubled = [...wins, ...wins];

  return (
    <div style={s.liveSection}>
      <div style={s.liveSectionHeader}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.success, display: 'inline-block', boxShadow: `0 0 6px ${theme.success}80` }} />
        <span style={s.liveSectionTitle}>Recent Wins</span>
      </div>
      <div style={{ display: 'flex', gap: '16px', padding: '10px 14px', whiteSpace: 'nowrap' as const, width: 'max-content' }} className="ticker-track">
        {doubled.map((w, i) => {
          const badgeColor = w.feedType === 'PRED' ? theme.accent.purple : theme.accent.blue;
          return (
            <div key={`${w.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0, padding: '0 4px' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: getAvatarGradient(null, w.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#fff' }}>{getInitials(w.username)}</div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text.secondary, maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.username}</span>
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.5px', background: `${badgeColor}20`, color: badgeColor }}>{w.feedType}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: theme.game.multiplier }} className="mono">{w.multiplier.toFixed(2)}x</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: theme.game.multiplier }} className="mono">+{(w.profit / 1e9).toFixed(3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BannerCarousel({ isMobile, onBannerClick }: { isMobile: boolean; onBannerClick: (b: BannerData) => void }) {
  const visible = 1; // Always show 1 banner at a time for hero layout
  const total = BANNERS.length;
  const extendedBanners = [...BANNERS, ...BANNERS.slice(0, visible)];
  const extendedCount = extendedBanners.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);

  const startAutoSlide = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => prev + 1);
      setIsTransitioning(true);
    }, 4000);
  };

  useEffect(() => {
    startAutoSlide();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (activeIndex >= total) {
      const timeout = setTimeout(() => {
        setIsTransitioning(false);
        setActiveIndex(activeIndex % total);
      }, 520);
      return () => clearTimeout(timeout);
    }
  }, [activeIndex, total]);

  useEffect(() => {
    if (!isTransitioning) {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsTransitioning(true));
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isTransitioning]);

  const goTo = (idx: number) => { setActiveIndex(idx); setIsTransitioning(true); startAutoSlide(); };
  const goNext = () => { setActiveIndex((prev) => prev + 1); setIsTransitioning(true); startAutoSlide(); };
  const goPrev = () => {
    setActiveIndex((prev) => prev <= 0 ? total - 1 : prev - 1);
    setIsTransitioning(true);
    startAutoSlide();
  };

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { if (diff > 0) goNext(); else goPrev(); }
  };

  const slideWidth = 100 / extendedCount;
  const trackOffset = -(activeIndex * slideWidth);
  const dotIndex = activeIndex % total;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: theme.radius.lg, height: '100%' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div style={{
        display: 'flex',
        transition: isTransitioning ? 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        transform: `translateX(${trackOffset}%)`,
        width: `${extendedCount * 100}%`,
        height: '100%',
      }}>
        {extendedBanners.map((banner, i) => (
          <div
            key={`${banner.id}-${i}`}
            onClick={() => onBannerClick(banner)}
            style={{
              flex: `0 0 ${100 / extendedCount}%`,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              cursor: 'pointer',
              height: '100%',
              background: banner.gradient,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column' as const,
              justifyContent: 'center',
              padding: isMobile ? '24px 20px' : '40px 48px',
            }}
          >
            {/* Decorative glow orb */}
            <div style={{
              position: 'absolute',
              top: '-20%',
              right: '-10%',
              width: '60%',
              height: '140%',
              background: `radial-gradient(ellipse, ${banner.glowColor} 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
            {/* Grid pattern overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
              pointerEvents: 'none',
            }} />
            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1, maxWidth: '65%' }}>
              <div style={{
                fontSize: isMobile ? '28px' : '42px',
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.5px',
                color: '#fff',
                marginBottom: '4px',
              }}>
                {banner.headline}{' '}
                <span style={{
                  color: banner.accentColor,
                  textShadow: `0 0 30px ${banner.glowColor}`,
                }}>
                  {banner.accentWord}
                </span>
              </div>
              <div style={{
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.55)',
                lineHeight: 1.5,
                marginBottom: isMobile ? '14px' : '20px',
                maxWidth: '380px',
              }}>
                {banner.subtitle}
              </div>
              <button style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: isMobile ? '10px 20px' : '12px 28px',
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: 700,
                color: '#fff',
                background: banner.accentColor,
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.3px',
                boxShadow: `0 4px 20px ${banner.glowColor}`,
              }}>
                {banner.cta}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', position: 'absolute', bottom: '12px', left: 0, right: 0 }}>
        {BANNERS.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{
            width: dotIndex === i ? '22px' : '7px', height: '7px', borderRadius: '4px', border: 'none',
            background: dotIndex === i ? theme.accent.purple : 'rgba(255,255,255,0.15)',
            cursor: 'pointer', padding: 0, transition: 'all 0.3s ease',
            boxShadow: dotIndex === i ? `0 0 8px ${theme.accent.purple}80` : 'none',
          }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  },

  /* ─── Hero ─── */
  hero: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '12px',
    minHeight: '320px',
  },
  heroMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  heroBanner: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    minHeight: '320px',
  },
  heroBannerMobile: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    aspectRatio: '16 / 7',
  },
  heroCategoryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  categoryCard: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '16px',
    transition: 'all 0.18s ease',
  },
  categoryCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  categoryTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '0.5px',
    textShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  categorySub: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
  },
  categoryPlayBtn: {
    alignSelf: 'flex-start',
    padding: '6px 18px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(0,0,0,0.4)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '8px',
    backdropFilter: 'blur(4px)',
  },

  /* ─── Mobile category pills ─── */
  mobileCategoryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  mobileCategoryPill: {
    borderRadius: '10px',
    padding: '12px 8px',
    textAlign: 'center' as const,
    cursor: 'pointer',
  },
  mobileCategoryLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.5px',
  },

  /* ─── Search Bar ─── */
  searchRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  searchInputWrap: {
    flex: 1,
    minWidth: '200px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: theme.text.primary,
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  filterRow: {
    display: 'flex',
    gap: '4px',
  },
  filterBtn: {
    padding: '9px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
  },
  filterBtnActive: {
    color: '#fff',
    background: theme.accent.purple,
    border: `1px solid ${theme.accent.purple}`,
  },

  /* ─── Section Header ─── */
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.primary,
    letterSpacing: '0.3px',
  },
  gameCount: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },

  /* ─── Columns ─── */
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '16px',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
    overflow: 'hidden',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  /* ─── Game Cards ─── */
  gameGrid: {
    display: 'grid',
    gap: '12px',
  },
  gameCard: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    cursor: 'pointer',
    aspectRatio: '16 / 10',
    minWidth: 0,
    background: theme.bg.card,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
  },
  gameCardImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  gameCardGradTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 1,
  },
  gameCardGradBottom: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 45%, transparent 70%)',
    zIndex: 2,
  },
  gameCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px 14px',
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
  },
  gameCardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.3px',
    textShadow: '0 2px 8px rgba(0,0,0,0.7)',
  },
  gameCardSub: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
  },
  liveBadge: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    zIndex: 4,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(6px)',
    border: `1px solid rgba(0, 220, 130, 0.3)`,
    borderRadius: '6px',
    padding: '3px 7px',
  },
  liveBadgeText: {
    fontSize: '9px',
    fontWeight: 800,
    color: theme.accent.green,
    letterSpacing: '0.8px',
  },
  liveDataRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    marginTop: '2px',
  },

  /* ─── Stats Strip ─── */
  statsStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    flexWrap: 'wrap' as const,
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statItemLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.secondary,
  },
  statDividerV: {
    width: '1px',
    height: '16px',
    background: theme.border.medium,
  },

  /* ─── Live Activity ─── */
  liveSection: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  liveSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
  },
  liveSectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  liveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 14px',
  },
  liveRowText: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  liveRowTime: {
    fontSize: '10px',
    color: theme.text.muted,
  },

  /* ─── Panels (right col) ─── */
  panel: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
  },
  panelTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    flex: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  statsBody: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  balanceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  balanceBig: {
    fontSize: '20px',
    fontWeight: 800,
    color: theme.accent.purple,
  },
  statDivider: {
    height: '1px',
    background: theme.border.subtle,
  },
  levelVipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 10px',
    background: `${theme.accent.purple}12`,
    border: `1px solid ${theme.accent.purple}25`,
    borderRadius: theme.radius.md,
  },
  statChipLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  statChipValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  statValue: {
    fontSize: '14px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
  xpBarContainer: {
    height: '5px',
    background: theme.bg.tertiary,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  xpBar: {
    height: '100%',
    background: `linear-gradient(90deg, ${theme.accent.violet}, ${theme.accent.purple}, ${theme.accent.lavender})`,
    borderRadius: '3px',
    transition: 'width 0.4s ease',
    boxShadow: `0 0 8px ${theme.accent.purple}60`,
  },

  /* ─── Bonus Card ─── */
  bonusCard: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: theme.bg.card,
    border: `1px solid rgba(139, 92, 246, 0.2)`,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  bonusInner: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    zIndex: 1,
    background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.04) 100%)',
  },
  bonusIconWrap: {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    background: `${theme.accent.purple}15`,
    border: `1px solid ${theme.accent.purple}25`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  bonusTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.accent.lavender,
  },
  bonusDesc: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.3,
  },
  bonusArrow: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },

  /* ─── Auth Modal ─── */
  authOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  authModal: {
    position: 'relative',
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.xl,
    padding: '28px 24px',
    maxWidth: '340px',
    width: '90%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    textAlign: 'center' as const,
    overflow: 'hidden',
  },
  authModalGlow: {
    position: 'absolute',
    top: '-40px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '180px',
    height: '180px',
    background: `radial-gradient(circle, ${theme.accent.purple}18 0%, transparent 70%)`,
    pointerEvents: 'none',
  },
  authTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  authDesc: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.5,
  },
  authBtn: {
    padding: '13px 24px',
    fontSize: '15px',
    fontWeight: 600,
    width: '100%',
    background: theme.gradient.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  authDismiss: {
    padding: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
};
