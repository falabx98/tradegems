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
import { TabBar } from '../ui/TabBar';
import { StatCard } from '../ui/StatCard';

interface BannerData {
  id: string;
  image: string;
  cta: string;
  accentColor: string;
  action: 'bonus' | 'referrals' | 'rewards';
}

const BANNERS: BannerData[] = [
  {
    id: 'welcome-bonus',
    image: '/Welcome-Bonus.png',
    cta: 'Claim Now',
    accentColor: theme.accent.purple,
    action: 'bonus',
  },
  {
    id: 'referral',
    image: '/Referral-Program.jpg',
    cta: 'View Referrals',
    accentColor: theme.accent.purple,
    action: 'referrals',
  },
  {
    id: 'daily-rewards',
    image: '/Daily-Rewards.jpg',
    cta: 'Claim',
    accentColor: '#8b5cf6',
    action: 'rewards',
  },
];

type GameCategory = 'all' | 'pvp' | 'solo' | 'jackpot';

const CATEGORY_TABS = [
  { id: 'all', label: 'All Games' },
  { id: 'pvp', label: 'PvP' },
  { id: 'solo', label: 'Solo' },
  { id: 'jackpot', label: 'Jackpot' },
];

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
  {
    id: 'solo',
    route: 'setup',
    title: 'Solo',
    subtitle: 'Trade vs. the chart',
    image: '/game-solo.png',
    category: ['solo'],
    gradientOverlay: 'linear-gradient(135deg, rgba(139,92,246,0.35) 0%, rgba(59,130,246,0.20) 100%)',
  },
  {
    id: 'predictions',
    route: 'prediction',
    title: 'Predictions',
    subtitle: 'Up or Down?',
    image: '/game-predictions.png',
    category: ['solo'],
    gradientOverlay: 'linear-gradient(135deg, rgba(59,130,246,0.35) 0%, rgba(139,92,246,0.20) 100%)',
  },
  {
    id: 'trading-sim',
    route: 'trading-sim',
    title: 'Trading Sim',
    subtitle: 'PvP Trading Arena',
    image: '/game-trading-sim.png',
    category: ['pvp'],
    gradientOverlay: 'linear-gradient(135deg, rgba(6,78,59,0.55) 0%, rgba(5,150,105,0.30) 100%)',
    isLive: true,
  },
  {
    id: 'candleflip',
    route: 'candleflip',
    title: 'Candleflip',
    subtitle: 'Over/Under 1.00x',
    image: '/game-candleflip.png',
    category: ['pvp'],
    gradientOverlay: 'linear-gradient(135deg, rgba(146,64,14,0.55) 0%, rgba(217,119,6,0.30) 100%)',
    isLive: true,
  },
  {
    id: 'rug-game',
    route: 'rug-game',
    title: 'Rug Game',
    subtitle: 'Cash Out or Get Rugged',
    image: '/game-rug-game.png',
    category: ['pvp'],
    gradientOverlay: 'linear-gradient(135deg, rgba(127,29,29,0.55) 0%, rgba(220,38,38,0.30) 100%)',
    isLive: true,
  },
  {
    id: 'lottery',
    route: 'lottery',
    title: 'Lottery',
    subtitle: 'Jackpot Draws',
    image: '/game-lottery.png',
    category: ['jackpot'],
    gradientOverlay: 'linear-gradient(135deg, rgba(161,139,40,0.55) 0%, rgba(255,170,0,0.30) 100%)',
  },
];

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

  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const [rug, candle, trading] = await Promise.all([
          api.getRugGameRecent(3).catch(() => ({ games: [] })),
          api.getCandleflipRecent(3).catch(() => ({ results: [] })),
          api.getTradingSimRooms().catch(() => ({ rooms: [] })),
        ]);
        setRugRecent(rug.games || []);
        setCandleRecent(candle.results || []);
        setTradingRooms(trading.rooms || []);
      } catch {}
    };
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Merge and sort recent results for Live Action section
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
      if (!isAuthenticated) {
        go('auth');
      } else {
        go('wallet');
      }
    } else if (banner.action === 'referrals' || banner.action === 'rewards') {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
      } else {
        go('rewards');
      }
    }
  };

  // Filter games by category
  const filteredGames = GAME_DEFS.filter(g =>
    activeCategory === 'all' || g.category.includes(activeCategory as GameCategory)
  );

  // Determine live state per game
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
            <span
              key={i}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: r.result === 'bullish' ? theme.accent.green : theme.accent.red,
                display: 'inline-block',
              }}
            />
          ))}
        </span>
      );
    }
    if (id === 'rug-game' && rugRecent.length > 0) {
      const last = rugRecent[0];
      const won = last.status === 'cashed_out';
      return (
        <span style={{ ...s.liveDataRow, marginTop: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: won ? theme.accent.green : theme.accent.red }} className="mono">
            {won ? 'CASHED' : 'RUGGED'}{last.multiplier ? ` ${Number(last.multiplier).toFixed(2)}x` : ''}
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

  const statsRow = (
    <div style={s.statsRow}>
      <StatCard
        label="Players Online"
        value={liveStats.active}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
        color={theme.accent.lavender}
      />
      <StatCard
        label="24h Volume"
        value={`${liveStats.volume} SOL`}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
        }
        color={theme.accent.blue}
      />
      <StatCard
        label="Top Win"
        value={liveStats.topWin}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        }
        color={theme.accent.amber}
      />
      {isAuthenticated && (
        <StatCard
          label="Your Balance"
          value={`${formatSol(profile.balance)} SOL`}
          color={theme.accent.purple}
        />
      )}
    </div>
  );

  const gameGrid = (columns: string) => (
    <div style={{ ...s.gameGrid, gridTemplateColumns: columns }}>
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
              border: hovered
                ? `1px solid rgba(139, 92, 246, 0.45)`
                : `1px solid ${theme.border.subtle}`,
              transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: hovered
                ? `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.15)`
                : `0 2px 8px rgba(0,0,0,0.3)`,
            }}
          >
            {/* Image fill */}
            <img
              src={game.image}
              alt={game.title}
              draggable={false}
              style={s.gameCardImg}
            />
            {/* Gradient overlay top half */}
            <div style={{ ...s.gameCardGradTop, background: game.gradientOverlay }} />
            {/* Bottom fade for text legibility */}
            <div style={s.gameCardGradBottom} />

            {/* LIVE / NEW badge */}
            {live && (
              <div style={s.liveBadge}>
                <LiveDot size={5} color={theme.accent.green} />
                <span style={s.liveBadgeText}>LIVE</span>
              </div>
            )}

            {/* Content */}
            <div style={s.gameCardContent}>
              <span style={s.gameCardTitle}>{game.title}</span>
              <span style={s.gameCardSub}>{game.subtitle}</span>
              {getLiveExtra(game.id)}
            </div>
          </div>
        );
      })}
    </div>
  );

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
              ? `${item.status === 'cashed_out' ? 'Cashed' : 'Rugged'}${item.multiplier ? ` at ${Number(item.multiplier).toFixed(2)}x` : ''}`
              : `${item.result === 'bullish' ? 'Bull' : 'Bear'} flip${item.betAmount ? ` — ${(Number(item.betAmount) / 1e9).toFixed(3)} SOL` : ''}`
            }
          </span>
          {item.time && <span style={s.liveRowTime}>{timeAgo(item.time)}</span>}
        </div>
      ))}
    </div>
  );

  const bonusCard = isAuthenticated && (
    <div
      style={s.bonusCard}
      className="card-enter card-enter-1"
      onClick={() => go('wallet')}
    >
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
        <button style={s.authBtn} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>
          Sign in / Register
        </button>
        <button style={s.authDismiss} onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
      </div>
    </div>
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div style={{ ...s.container, padding: '10px', gap: '12px' }}>
        <BannerCarousel isMobile={isMobile} onBannerClick={handleBannerClick} />

        {/* Quick Stats — 2x2 compact on mobile */}
        <div style={{ ...s.statsRow, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <StatCard label="Players" value={liveStats.active} color={theme.accent.lavender} />
          <StatCard label="24h Volume" value={`${liveStats.volume} SOL`} color={theme.accent.blue} />
          <StatCard label="Top Win" value={liveStats.topWin} color={theme.accent.amber} />
          {isAuthenticated
            ? <StatCard label="Balance" value={`${formatSol(profile.balance)} SOL`} color={theme.accent.purple} />
            : <StatCard label="Games" value={GAME_DEFS.length} color={theme.accent.purple} />
          }
        </div>

        {/* Category Filter */}
        <div style={s.tabBarWrap}>
          <TabBar tabs={CATEGORY_TABS} active={activeCategory} onChange={setActiveCategory} />
        </div>

        {/* Game Cards — 2 column */}
        {gameGrid('repeat(2, 1fr)')}

        {/* Live Activity */}
        {liveActivitySection}

        <LiveWinsTicker />
        <TopPlayers />

        {/* Mobile Profile Stats */}
        <div style={s.mobileStatsRow}>
          <div style={s.mobileStatBox}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '14px', height: '14px' }} />
            <span style={s.mobileStatVal} className="mono">{formatSol(profile.balance)}</span>
          </div>
          <div style={s.mobileStatBox}>
            <span style={s.mobileStatLabel}>LVL</span>
            <span style={s.mobileStatVal} className="mono">{profile.level}</span>
          </div>
          <div style={{
            ...s.mobileStatBox,
            background: `${(theme.vip as any)[profile.vipTier] || theme.accent.purple}12`,
          }}>
            <span style={{
              ...s.mobileStatVal,
              color: (theme.vip as any)[profile.vipTier] || theme.text.secondary,
              fontSize: '12px',
            }}>{profile.vipTier}</span>
          </div>
          <div style={s.mobileStatBox}>
            <span style={s.mobileStatLabel}>Best</span>
            <span style={{ ...s.mobileStatVal, color: theme.game.multiplier }} className="mono">
              {profile.bestMultiplier.toFixed(1)}x
            </span>
          </div>
        </div>

        {bonusCard}
        <ActivityFeed />
        {authModal}
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <div style={s.container}>
      <BannerCarousel isMobile={false} onBannerClick={handleBannerClick} />

      {/* Quick Stats Row */}
      {statsRow}

      <div style={s.columns}>
        {/* Left column */}
        <div style={s.leftCol}>
          {/* Section header + category tabs */}
          <div style={s.sectionHeaderRow}>
            <span style={s.sectionTitle}>Games</span>
          </div>

          <div style={s.tabBarWrap}>
            <TabBar tabs={CATEGORY_TABS} active={activeCategory} onChange={setActiveCategory} />
          </div>

          {/* Game Cards — 3 columns desktop */}
          {gameGrid('repeat(3, 1fr)')}

          {/* Live Activity */}
          {liveActivitySection}

          <LiveWinsTicker />
          <TopPlayers />
        </div>

        {/* Right column */}
        <div style={s.rightCol}>
          {/* Profile Stats Panel */}
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

// --- Sub Components ---

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statValue, color: color || theme.text.primary }} className="mono">
        {value}
      </span>
    </div>
  );
}

function TopPlayers() {
  const [players, setPlayers] = useState<Array<{ username: string; score: number }>>([]);
  const go = useAppNavigate();

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
    <div style={{
      background: theme.bg.card,
      border: `1px solid ${theme.border.subtle}`,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px',
        borderBottom: `1px solid ${theme.border.subtle}`,
        background: theme.bg.secondary,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.accent.purple} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>
          Top Players
        </span>
      </div>
      {players.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px',
          borderBottom: i < players.length - 1 ? `1px solid ${theme.border.subtle}` : 'none',
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: i < 3 ? `${medals[i]}20` : theme.bg.tertiary,
            color: i < 3 ? medals[i] : theme.text.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 700,
          }}>{i + 1}</span>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            background: getAvatarGradient(null, p.username),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '8px', fontWeight: 700, color: '#fff',
          }}>{getInitials(p.username)}</div>
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {p.username}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accent.purple }} className="mono">
            {(p.score / 1e9).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface WinEntry {
  id: number;
  username: string;
  feedType: string;
  multiplier: number;
  profit: number;
}

function LiveWinsTicker() {
  const [wins, setWins] = useState<WinEntry[]>([]);

  useEffect(() => {
    const fetchWins = async () => {
      try {
        const res = await api.getActivityFeed(20);
        const items = (res.data || []) as any[];
        const filtered = items
          .filter((i: any) => i.payload.payout > i.payload.betAmount)
          .map((i: any) => ({
            id: i.id,
            username: i.payload.username,
            feedType: i.feedType === 'prediction_result' ? 'PRED' : 'SOLO',
            multiplier: i.payload.multiplier ?? 0,
            profit: i.payload.payout - i.payload.betAmount,
          }));
        setWins(filtered);
      } catch { /* ignore */ }
    };
    fetchWins();
    const interval = setInterval(fetchWins, 8000);
    return () => clearInterval(interval);
  }, []);

  if (wins.length === 0) return null;

  const doubled = [...wins, ...wins];

  return (
    <div style={tickerStyles.container}>
      <div style={tickerStyles.header}>
        <span style={tickerStyles.dot} />
        <span style={tickerStyles.title}>Recent Wins</span>
      </div>
      <div style={tickerStyles.track} className="ticker-track">
        {doubled.map((w, i) => {
          const badgeColor = w.feedType === 'PRED' ? theme.accent.purple : theme.accent.blue;
          return (
            <div key={`${w.id}-${i}`} style={tickerStyles.entry}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: getAvatarGradient(null, w.username),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: 700, color: '#fff',
              }}>
                {getInitials(w.username)}
              </div>
              <span style={tickerStyles.user}>{w.username}</span>
              <span style={{ ...tickerStyles.badge, background: `${badgeColor}20`, color: badgeColor }}>{w.feedType}</span>
              <span style={tickerStyles.mult} className="mono">{w.multiplier.toFixed(2)}x</span>
              <span style={tickerStyles.amount} className="mono">+{(w.profit / 1e9).toFixed(3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const tickerStyles: Record<string, React.CSSProperties> = {
  container: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%',
    background: theme.success,
    display: 'inline-block',
    boxShadow: `0 0 6px ${theme.success}80`,
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  track: {
    display: 'flex',
    gap: '16px',
    padding: '10px 14px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  },
  entry: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    padding: '0 4px',
  },
  user: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    maxWidth: '70px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badge: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
  },
  mult: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.game.multiplier,
  },
  amount: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.game.multiplier,
  },
};

function BannerCarousel({ isMobile, onBannerClick }: { isMobile: boolean; onBannerClick: (b: BannerData) => void }) {
  const visible = isMobile ? 1 : 3;
  const total = BANNERS.length;
  const extendedBanners = [...BANNERS, ...BANNERS.slice(0, visible)];
  const extendedCount = extendedBanners.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
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

  const goTo = (idx: number) => {
    setActiveIndex(idx);
    setIsTransitioning(true);
    startAutoSlide();
  };

  const goNext = () => {
    setActiveIndex((prev) => prev + 1);
    setIsTransitioning(true);
    startAutoSlide();
  };

  const goPrev = () => {
    setActiveIndex((prev) => {
      if (prev <= 0) return total - 1;
      return prev - 1;
    });
    setIsTransitioning(true);
    startAutoSlide();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  const gap = isMobile ? 0 : 10;
  const slideWidth = 100 / extendedCount;
  const gapPx = isMobile ? 0 : gap;
  const trackOffset = -(activeIndex * slideWidth);
  const dotIndex = activeIndex % total;

  return (
    <div
      style={s.bannerRow}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          gap: `${gap}px`,
          transition: isTransitioning ? 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          transform: `translateX(calc(${trackOffset}% - ${activeIndex * (gapPx / visible)}px))`,
          width: isMobile ? `${extendedCount * 100}%` : `${(extendedCount / visible) * 100}%`,
        }}
      >
        {extendedBanners.map((banner, i) => (
          <div
            key={`${banner.id}-${i}`}
            onClick={() => onBannerClick(banner)}
            className="banner-card"
            style={{
              ...s.bannerCard,
              flex: `0 0 calc(${100 / extendedCount}% - ${gap * (extendedCount - 1) / extendedCount}px)`,
            }}
          >
            <img
              src={banner.image}
              alt={banner.id}
              draggable={false}
              style={{
                width: 'calc(100% + 8px)',
                height: 'calc(100% + 8px)',
                margin: '-4px',
                objectFit: 'cover' as const,
                display: 'block',
              }}
            />
          </div>
        ))}
      </div>
      {/* Dot indicators */}
      <div style={s.dotsRow}>
        {BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: dotIndex === i ? '22px' : '7px',
              height: '7px',
              borderRadius: '4px',
              border: 'none',
              background: dotIndex === i ? theme.accent.purple : 'rgba(255,255,255,0.15)',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.3s ease',
              boxShadow: dotIndex === i ? `0 0 8px ${theme.accent.purple}80` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// --- Styles ---

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '16px',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minWidth: 0,
    overflow: 'hidden',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  // Banner
  bannerRow: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    background: 'transparent',
  },
  bannerCard: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    aspectRatio: '16 / 7',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    lineHeight: 0,
  },
  dotsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    position: 'absolute' as const,
    bottom: '12px',
    left: 0,
    right: 0,
  },

  // Quick Stats
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  },

  // Category Tab wrapper
  tabBarWrap: {
    marginBottom: '-4px',
  },

  // Section header
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: theme.text.primary,
    letterSpacing: '0.3px',
  },

  // Game Cards Grid
  gameGrid: {
    display: 'grid',
    gap: '12px',
  },
  gameCard: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    cursor: 'pointer',
    aspectRatio: '4 / 3',
    minWidth: 0,
    background: theme.bg.card,
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
  },
  gameCardImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  // Top half colored gradient
  gameCardGradTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 1,
  },
  // Bottom fade for text
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
    padding: '14px 12px',
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  gameCardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.3px',
    textShadow: '0 2px 8px rgba(0,0,0,0.7)',
  },
  gameCardSub: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
  },

  // Live badge
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

  // Live Activity Section
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

  // Panels (right col)
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

  // Stats body
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

  // Bonus card
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

  // Auth modal
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

  // Mobile profile stats
  mobileStatsRow: {
    display: 'flex',
    gap: '6px',
  },
  mobileStatBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '9px 6px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
  },
  mobileStatLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
  },
  mobileStatVal: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
  },
};
