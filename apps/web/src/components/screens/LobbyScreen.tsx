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
    accentColor: theme.accent.green,
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
    accentColor: '#fbbf24',
    action: 'rewards',
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

  const quickStatsBar = (
    <div style={styles.quickStats}>
      <div style={styles.quickStatItem}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={styles.quickStatLabel}>Players</span>
        <span style={styles.quickStatValue} className="mono">{liveStats.active}</span>
      </div>
      <div style={styles.quickStatItem}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
        </svg>
        <span style={styles.quickStatLabel}>24h vol</span>
        <span style={styles.quickStatValue} className="mono">
          <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '3px' }} />
          {liveStats.volume}
        </span>
      </div>
      <div style={styles.quickStatItem}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={styles.quickStatLabel}>Top win</span>
        <span style={styles.quickStatValue} className="mono">{liveStats.topWin}</span>
      </div>
    </div>
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div style={{ ...styles.container, padding: '10px' }}>
        <BannerCarousel isMobile={isMobile} onBannerClick={handleBannerClick} />

        {/* Game cards — 2x2 grid */}
        <div style={styles.sectionTitle}>Games</div>
        <div style={{ ...styles.gameCardsGrid, gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div onClick={() => go('setup')} style={styles.gameCard} className="game-card">
            <img src="/game-solo.png" alt="Solo" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Solo</span>
              <span style={styles.gameCardSub}>Trade vs. the chart</span>
            </div>
          </div>
          <div onClick={() => go('prediction')} style={styles.gameCard} className="game-card">
            <img src="/game-predictions.png" alt="Predictions" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Predictions</span>
              <span style={styles.gameCardSub}>Up or Down?</span>
            </div>
          </div>
          <div onClick={() => go('trading-sim')} style={styles.gameCard} className="game-card">
            <img src="/game-trading-sim.png" alt="Trading Sim" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            {activeRoomCount > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#0d9488" /></span>}
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Trading Sim</span>
              <span style={styles.gameCardSub}>PvP Trading Arena</span>
              {activeRoomCount > 0 && (
                <span style={styles.liveDataRow}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488' }} className="mono">{activeRoomCount} room{activeRoomCount !== 1 ? 's' : ''} live</span>
                </span>
              )}
            </div>
          </div>
          <div onClick={() => go('lottery')} style={styles.gameCard} className="game-card">
            <img src="/game-lottery.png" alt="Lottery" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Lottery</span>
              <span style={styles.gameCardSub}>Jackpot Draws</span>
            </div>
          </div>

          <div onClick={() => go('candleflip')} style={styles.gameCard} className="game-card">
            <img src="/game-candleflip.png" alt="Candleflip" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            {candleRecent.length > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#eab308" /></span>}
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Candleflip</span>
              <span style={styles.gameCardSub}>Over/Under 1.00x</span>
              {candleRecent.length > 0 && (
                <span style={styles.liveDataRow}>
                  {candleRecent.slice(0, 5).map((r: any, i: number) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: r.result === 'bullish' ? '#34d399' : '#f87171', display: 'inline-block' }} />
                  ))}
                </span>
              )}
            </div>
          </div>

          <div onClick={() => go('rug-game')} style={styles.gameCard} className="game-card">
            <img src="/game-rug-game.png" alt="Rug Game" draggable={false} style={styles.gameCardImg} />
            <div style={styles.gameCardOverlay} />
            {rugRecent.length > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#f87171" /></span>}
            <div style={styles.gameCardContent}>
              <span style={styles.gameCardTitle}>Rug Game</span>
              <span style={styles.gameCardSub}>Cash Out or Get Rugged</span>
              {rugRecent.length > 0 && (
                <span style={styles.liveDataRow}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: rugRecent[0].status === 'cashed_out' ? '#34d399' : '#f87171' }} className="mono">
                    {rugRecent[0].status === 'cashed_out' ? 'CASHED' : 'RUGGED'} {rugRecent[0].multiplier ? `${Number(rugRecent[0].multiplier).toFixed(2)}x` : ''}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {allRecent.length > 0 && (
          <div style={styles.liveActionSection}>
            <div style={styles.liveActionHeader}>
              <LiveDot size={6} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Live Action</span>
            </div>
            {allRecent.map((item, i) => (
              <div key={i} style={styles.liveActionRow}>
                <GameTypeBadge type={item.gameType === 'rug' ? 'rug' : 'candle'} />
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: theme.text.secondary }}>
                  {item.gameType === 'rug'
                    ? `${item.status === 'cashed_out' ? 'Cashed' : 'Rugged'}${item.multiplier ? ` at ${Number(item.multiplier).toFixed(2)}x` : ''}`
                    : `${item.result === 'bullish' ? 'Bull' : 'Bear'} flip${item.betAmount ? ` - ${(Number(item.betAmount) / 1e9).toFixed(3)} SOL` : ''}`
                  }
                </span>
                {item.time && <span style={{ fontSize: '10px', color: theme.text.muted }}>{timeAgo(item.time)}</span>}
              </div>
            ))}
          </div>
        )}

        <LiveWinsTicker />
        <TopPlayers />

        {/* Quick stats bar — compact */}
        {quickStatsBar}

        {/* Compact stats row */}
        <div style={styles.mobileStatsRow}>
          <div style={styles.mobileStatBox}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px' }} />
            <span style={styles.mobileStatVal} className="mono">{formatSol(profile.balance)}</span>
          </div>
          <div style={styles.mobileStatBox}>
            <span style={styles.mobileStatLabel}>LVL</span>
            <span style={styles.mobileStatVal} className="mono">{profile.level}</span>
          </div>
          <div style={{
            ...styles.mobileStatBox,
            background: `${(theme.vip as any)[profile.vipTier] || theme.accent.purple}12`,
          }}>
            <span style={{
              ...styles.mobileStatVal,
              color: (theme.vip as any)[profile.vipTier] || theme.text.secondary,
              fontSize: '12px',
            }}>{profile.vipTier}</span>
          </div>
          <div style={styles.mobileStatBox}>
            <span style={styles.mobileStatLabel}>Best</span>
            <span style={{ ...styles.mobileStatVal, color: theme.game.multiplier }} className="mono">{profile.bestMultiplier.toFixed(1)}x</span>
          </div>
        </div>

        {/* Deposit bonus promo */}
        {isAuthenticated && (
          <div style={styles.bonusCard} className="card-enter card-enter-1" onClick={() => go('wallet')}>
            <div style={styles.bonusContent}>
              <div style={styles.bonusIcon}><GiftIcon size={20} color={theme.accent.green} /></div>
              <div style={styles.bonusTextWrap}>
                <span style={styles.bonusTitle}>100% Deposit Bonus</span>
                <span style={styles.bonusDesc}>Double your first deposit!</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent.green, whiteSpace: 'nowrap' as const }}>Deposit →</span>
            </div>
          </div>
        )}

        <ActivityFeed />

        {showAuthPrompt && (
          <div style={styles.authOverlay} onClick={() => setShowAuthPrompt(false)}>
            <div style={styles.authModal} onClick={(e) => e.stopPropagation()}>
              <span style={styles.authTitle}>Sign in to play</span>
              <span style={styles.authDesc}>Create an account or sign in to start trading rounds.</span>
              <button style={styles.authBtn} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>Sign in / Register</button>
              <button style={styles.authDismiss} onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <div style={styles.container}>
      <BannerCarousel isMobile={false} onBannerClick={handleBannerClick} />

      <div style={styles.columns}>
        {/* Left column */}
        <div style={styles.leftCol}>
          <div style={styles.sectionTitle}>Games</div>

          <div style={styles.gameCardsGrid}>
            <div onClick={() => go('setup')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-solo.png" alt="Solo" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Solo</span>
                <span style={styles.gameCardSub}>Trade vs. the chart</span>
              </div>
            </div>
            <div onClick={() => go('prediction')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-predictions.png" alt="Predictions" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Predictions</span>
                <span style={styles.gameCardSub}>Up or Down?</span>
              </div>
            </div>
            <div onClick={() => go('trading-sim')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-trading-sim.png" alt="Trading Sim" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              {activeRoomCount > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#0d9488" /></span>}
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Trading Sim</span>
                <span style={styles.gameCardSub}>PvP Trading Arena</span>
                {activeRoomCount > 0 && (
                  <span style={styles.liveDataRow}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488' }} className="mono">{activeRoomCount} room{activeRoomCount !== 1 ? 's' : ''} live</span>
                  </span>
                )}
              </div>
            </div>
            <div onClick={() => go('lottery')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-lottery.png" alt="Lottery" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Lottery</span>
                <span style={styles.gameCardSub}>Jackpot Draws</span>
              </div>
            </div>
            <div onClick={() => go('candleflip')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-candleflip.png" alt="Candleflip" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              {candleRecent.length > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#eab308" /></span>}
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Candleflip</span>
                <span style={styles.gameCardSub}>Over/Under 1.00x</span>
                {candleRecent.length > 0 && (
                  <span style={styles.liveDataRow}>
                    {candleRecent.slice(0, 5).map((r: any, i: number) => (
                      <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: r.result === 'bullish' ? '#34d399' : '#f87171', display: 'inline-block' }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
            <div onClick={() => go('rug-game')} style={{ ...styles.gameCard, aspectRatio: '4 / 3' }} className="game-card">
              <img src="/game-rug-game.png" alt="Rug Game" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              {rugRecent.length > 0 && <span style={styles.liveCorner}><LiveDot size={6} color="#f87171" /></span>}
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Rug Game</span>
                <span style={styles.gameCardSub}>Cash Out or Get Rugged</span>
                {rugRecent.length > 0 && (
                  <span style={styles.liveDataRow}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: rugRecent[0].status === 'cashed_out' ? '#34d399' : '#f87171' }} className="mono">
                      {rugRecent[0].status === 'cashed_out' ? 'CASHED' : 'RUGGED'} {rugRecent[0].multiplier ? `${Number(rugRecent[0].multiplier).toFixed(2)}x` : ''}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {allRecent.length > 0 && (
            <div style={styles.liveActionSection}>
              <div style={styles.liveActionHeader}>
                <LiveDot size={6} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Live Action</span>
              </div>
              {allRecent.map((item, i) => (
                <div key={i} style={styles.liveActionRow}>
                  <GameTypeBadge type={item.gameType === 'rug' ? 'rug' : 'candle'} />
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: theme.text.secondary }}>
                    {item.gameType === 'rug'
                      ? `${item.status === 'cashed_out' ? 'Cashed' : 'Rugged'}${item.multiplier ? ` at ${Number(item.multiplier).toFixed(2)}x` : ''}`
                      : `${item.result === 'bullish' ? 'Bull' : 'Bear'} flip${item.betAmount ? ` - ${(Number(item.betAmount) / 1e9).toFixed(3)} SOL` : ''}`
                    }
                  </span>
                  {item.time && <span style={{ fontSize: '10px', color: theme.text.muted }}>{timeAgo(item.time)}</span>}
                </div>
              ))}
            </div>
          )}

          <LiveWinsTicker />
          <TopPlayers />
          {quickStatsBar}
        </div>

        {/* Right column */}
        <div style={styles.rightCol}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Stats</span>
            </div>
            <div style={styles.statsBody}>
              <div style={styles.balanceRow}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '22px', height: '22px', flexShrink: 0 }} />
                <span style={styles.balanceBig} className="mono">{formatSol(profile.balance)} SOL</span>
              </div>
              <div style={styles.statDivider} />
              <div style={styles.levelVipRow}>
                <div style={styles.statChip}>
                  <span style={styles.statChipLabel}>LVL</span>
                  <span style={styles.statChipValue} className="mono">{profile.level}</span>
                </div>
                <div style={{
                  ...styles.statChip,
                  background: `${(theme.vip as any)[profile.vipTier] || theme.accent.purple}15`,
                  border: `1px solid ${(theme.vip as any)[profile.vipTier] || theme.accent.purple}30`,
                }}>
                  <span style={{
                    ...styles.statChipValue,
                    color: (theme.vip as any)[profile.vipTier] || theme.text.secondary,
                    fontSize: '12px',
                    fontWeight: 700,
                  }}>{profile.vipTier}</span>
                </div>
              </div>
              <div style={styles.statDivider} />
              <StatRow label="Rounds" value={`${profile.roundsPlayed}`} />
              <StatRow label="Best" value={`${profile.bestMultiplier.toFixed(1)}x`} color={theme.game.multiplier} />
              <div style={styles.statDivider} />
              <StatRow label="XP" value={`${profile.xp}/${profile.xpToNext}`} color={theme.accent.purple} />
              <div style={styles.xpBarContainer}>
                <div style={{ ...styles.xpBar, width: `${(profile.xp / profile.xpToNext) * 100}%` }} />
              </div>
            </div>
          </div>

          {isAuthenticated && (
            <div style={styles.bonusCard} className="card-enter card-enter-1" onClick={() => go('wallet')}>
              <div style={styles.bonusContent}>
                <div style={styles.bonusIcon}><GiftIcon size={24} color={theme.accent.green} /></div>
                <div style={styles.bonusTextWrap}>
                  <span style={styles.bonusTitle}>100% Deposit Bonus</span>
                  <span style={styles.bonusDesc}>Double your first deposit — we match it 100%!</span>
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: theme.accent.green, whiteSpace: 'nowrap' as const, cursor: 'pointer' }}>Deposit →</span>
              </div>
            </div>
          )}

          <ActivityFeed />
        </div>
      </div>

      {showAuthPrompt && (
        <div style={styles.authOverlay} onClick={() => setShowAuthPrompt(false)}>
          <div style={styles.authModal} onClick={(e) => e.stopPropagation()}>
            <span style={styles.authTitle}>Sign in to play</span>
            <span style={styles.authDesc}>Create an account or sign in to start trading rounds.</span>
            <button style={styles.authBtn} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>Sign in / Register</button>
            <button style={styles.authDismiss} onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub Components ---

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color || theme.text.primary }} className="mono">
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

  const medals = ['#fbbf24', '#94a3b8', '#cd7f32'];

  return (
    <div style={{
      background: theme.bg.secondary,
      border: `1px solid ${theme.border.subtle}`,
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 10px',
        borderBottom: `1px solid ${theme.border.subtle}`,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.accent.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
          Top Players
        </span>
      </div>
      {players.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px',
          borderBottom: i < players.length - 1 ? `1px solid ${theme.border.subtle}` : 'none',
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: i < 3 ? `${medals[i]}20` : theme.bg.tertiary,
            color: i < 3 ? medals[i] : theme.text.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 700,
          }}>{i + 1}</span>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: getAvatarGradient(null, p.username),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '8px', fontWeight: 700, color: '#fff',
          }}>{getInitials(p.username)}</div>
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {p.username}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accent.green }} className="mono">
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
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
    background: theme.success,
    display: 'inline-block',
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  track: {
    display: 'flex',
    gap: '16px',
    padding: '8px 0',
    whiteSpace: 'nowrap' as const,
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
    padding: '1px 5px',
    borderRadius: '3px',
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
      style={styles.bannerRow}
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
              ...styles.bannerCard,
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
      <div style={styles.dotsRow}>
        {BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: dotIndex === i ? '20px' : '8px',
              height: '8px',
              borderRadius: '4px',
              border: 'none',
              background: dotIndex === i ? theme.accent.purple : 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
    gap: '12px',
    minWidth: 0,
    overflow: 'hidden',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Banner Row (Carousel)
  bannerRow: {
    position: 'relative',
    marginBottom: '12px',
    overflow: 'hidden',
    borderRadius: '8px',
    background: 'transparent',
  },
  bannerCard: {
    borderRadius: '8px',
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
    marginTop: '8px',
    position: 'absolute' as const,
    bottom: '10px',
    left: 0,
    right: 0,
  },

  // Panels
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    flex: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // Section Title
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.primary,
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },

  // Game Cards
  gameCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  gameCard: {
    position: 'relative',
    borderRadius: '10px',
    overflow: 'hidden',
    cursor: 'pointer',
    aspectRatio: '4 / 3',
    minWidth: 0,
    minHeight: 0,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    border: `1px solid ${theme.border.subtle}`,
  },
  gameCardImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  gameCardOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)',
    zIndex: 1,
  },
  gameCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '14px 12px',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  gameCardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.3px',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  },
  gameCardSub: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.65)',
    textShadow: '0 1px 4px rgba(0,0,0,0.5)',
  },
  liveCorner: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    zIndex: 3,
  },
  liveDataRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '4px',
  },
  liveActionSection: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  liveActionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  liveActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },

  // Stats
  statsBody: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
    color: theme.accent.violet,
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
    padding: '4px 10px',
    background: `${theme.accent.purple}12`,
    border: `1px solid ${theme.accent.purple}25`,
    borderRadius: '6px',
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
    height: '6px',
    background: theme.bg.tertiary,
    borderRadius: '3px',
    marginTop: '2px',
    overflow: 'hidden',
  },
  xpBar: {
    height: '100%',
    background: `linear-gradient(90deg, ${theme.accent.purple}, ${theme.accent.violet})`,
    borderRadius: '3px',
    transition: 'width 0.3s ease',
    boxShadow: `0 0 8px ${theme.accent.purple}60`,
  },

  // Quick Stats
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    background: theme.border.subtle,
    borderRadius: '8px',
    overflow: 'hidden',
    border: `1px solid ${theme.border.subtle}`,
  },
  quickStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    padding: '10px 6px',
    background: theme.bg.elevated,
  },
  quickStatLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  quickStatValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
  },

  // Auth prompt
  authOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  authModal: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '340px',
    width: '90%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    textAlign: 'center' as const,
  },
  authTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  authDesc: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.4,
  },
  authBtn: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    width: '100%',
    background: theme.accent.purple,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
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

  // Bonus card
  bonusCard: {
    position: 'relative',
    borderRadius: '8px',
    overflow: 'hidden',
    background: theme.bg.elevated,
    border: `1px solid rgba(0, 189, 113, 0.2)`,
  },
  bonusContent: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    zIndex: 1,
  },
  bonusIcon: {
    fontSize: '30px',
    flexShrink: 0,
  },
  bonusTextWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  bonusTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.accent.green,
  },
  bonusDesc: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.3,
  },
  bonusBtn: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    background: theme.accent.green,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // Bonus status (after claim)
  bonusStatusCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '10px 12px',
    background: 'rgba(251, 191, 36, 0.04)',
    border: '1px solid rgba(251, 191, 36, 0.12)',
    borderRadius: '8px',
  },
  bonusStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bonusStatusTextWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  },
  bonusStatusTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#fbbf24',
  },
  bonusStatusDesc: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  bonusStatusProgress: {
    fontSize: '13px',
    fontWeight: 700,
    flexShrink: 0,
  },
  bonusProgressBarSmall: {
    height: '3px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  bonusProgressFillSmall: {
    height: '100%',
    background: `linear-gradient(90deg, ${theme.accent.purple}, ${theme.accent.green})`,
    borderRadius: '2px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  bonusUnlockedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: 'rgba(52, 211, 153, 0.04)',
    border: '1px solid rgba(52, 211, 153, 0.12)',
    borderRadius: '8px',
  },
  bonusUnlockedText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#34d399',
  },

  // Mobile stats
  mobileStatsRow: {
    display: 'flex',
    gap: '6px',
  },
  mobileStatBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    padding: '8px 6px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
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
