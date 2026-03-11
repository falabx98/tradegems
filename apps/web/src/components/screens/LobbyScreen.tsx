import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { RiskTier } from '../../types/game';
import { api } from '../../utils/api';
import { formatSol, lamportsToSol, solToLamports } from '../../utils/sol';
import { playBetPlaced, hapticMedium } from '../../utils/sounds';
import { GiftIcon, HandshakeIcon, SwordsIcon, PackageIcon, LockIcon, PartyIcon } from '../ui/GameIcons';

const BET_OPTIONS = [
  { label: '0.01', lamports: 10_000_000 },
  { label: '0.05', lamports: 50_000_000 },
  { label: '0.1',  lamports: 100_000_000 },
  { label: '0.25', lamports: 250_000_000 },
  { label: '0.5',  lamports: 500_000_000 },
  { label: '1',    lamports: 1_000_000_000 },
  { label: '2',    lamports: 2_000_000_000 },
  { label: '5',    lamports: 5_000_000_000 },
];

const GAME_MODE_OPTIONS: {
  tier: RiskTier;
  label: string;
  desc: string;
  color: string;
  multipliers: string[];
  gainTag: string;
  lossTag: string;
}[] = [
  {
    tier: 'conservative',
    label: 'Safe',
    desc: 'Reduced gains & losses. Best for beginners.',
    color: theme.success,
    multipliers: ['x1.04-1.20', 'x1.20-1.48', 'x1.48-1.96', 'x1.96-3.00', 'x3.00-5.00', 'x5.00-8.20'],
    gainTag: '0.80x',
    lossTag: '0.85x',
  },
  {
    tier: 'balanced',
    label: 'Standard',
    desc: 'Normal gains & losses. The default experience.',
    color: theme.warning,
    multipliers: ['x1.05-1.25', 'x1.25-1.60', 'x1.60-2.20', 'x2.20-3.50', 'x3.50-6.00', 'x6.00-10.0'],
    gainTag: '1.00x',
    lossTag: '1.00x',
  },
  {
    tier: 'aggressive',
    label: 'Degen',
    desc: 'Boosted gains but amplified losses. High risk.',
    color: theme.danger,
    multipliers: ['x1.06-1.31', 'x1.31-1.75', 'x1.75-2.50', 'x2.50-4.13', 'x4.13-7.25', 'x7.25-10.0'],
    gainTag: '1.25x',
    lossTag: '1.40x',
  },
];

interface BannerData {
  id: string;
  image: string;
  cta: string;
  accentColor: string;
  action: 'bonus' | 'referrals' | 'battle' | 'rewards';
}

const BANNERS: BannerData[] = [
  {
    id: 'welcome-bonus',
    image: '/Welcome-Bonus.jpg',
    cta: 'Claim Now',
    accentColor: '#14F195',
    action: 'bonus',
  },
  {
    id: 'referral',
    image: '/Referral-Program.jpg',
    cta: 'View Referrals',
    accentColor: '#9945FF',
    action: 'referrals',
  },
  {
    id: 'battle-arena',
    image: '/PvP-Battle-Arena.jpg',
    cta: 'Enter Arena',
    accentColor: '#f87171',
    action: 'battle',
  },
  {
    id: 'daily-rewards',
    image: '/Daily-Rewards.jpg',
    cta: 'Claim',
    accentColor: '#fbbf24',
    action: 'rewards',
  },
];

interface FeedItem {
  user: string;
  mult: string;
  amount: string;
  win: boolean;
  time: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function LobbyScreen() {
  const isMobile = useIsMobile();
  const { mode, setMode, betAmount, setBetAmount, riskTier, setRiskTier, startRound, profile, syncProfile, setScreen, enterBattle } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [customBet, setCustomBet] = useState('');
  const [activityFeed, setActivityFeed] = useState<FeedItem[]>([]);
  const [liveStats, setLiveStats] = useState({ active: 0, volume: '0', topWin: '1.0x' });
  const [bonusClaimed, setBonusClaimed] = useState<boolean | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [bonusUnlocked, setBonusUnlocked] = useState(false);
  const [bonusProfit, setBonusProfit] = useState(0);
  const [bonusProfitRequired, setBonusProfitRequired] = useState(1_000_000_000);

  // Check bonus status for authenticated users
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const status = await api.getBonusStatus();
        setBonusClaimed(status.claimed);
        setBonusUnlocked(status.withdrawalUnlocked);
        setBonusProfit(status.currentProfit);
        setBonusProfitRequired(status.profitRequired);
      } catch {
        // Ignore — might not be logged in yet
      }
    })();
  }, [isAuthenticated]);

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    try {
      const res = await api.claimBonus();
      if (res.success) {
        setBonusClaimed(true);
        await syncProfile();
      }
    } catch (err) {
      console.error('Failed to claim bonus:', err);
    }
    setClaimingBonus(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getLeaderboard('profit', 'daily') as any;
        const data = res.data || [];
        const feed: FeedItem[] = data.slice(0, 7).map((entry: any) => {
          const score = Number(entry.score || 0);
          const isWin = score > 0;
          return {
            user: entry.username || 'anon',
            mult: `${(score / 10000).toFixed(1)}x`,
            amount: `${isWin ? '+' : ''}${formatSol(score)} SOL`,
            win: isWin,
            time: 'today',
          };
        });
        if (feed.length > 0) setActivityFeed(feed);

        const topScore = data.reduce((max: number, e: any) => Math.max(max, Number(e.score || 0)), 0);
        const totalVol = data.reduce((sum: number, e: any) => sum + Number(e.score || 0), 0);
        setLiveStats({
          active: data.length,
          volume: `${formatSol(totalVol)}`,
          topWin: `${(topScore / 10000).toFixed(1)}x`,
        });
      } catch {
        // Keep defaults
      }
    })();
  }, []);

  const handleCustomBet = () => {
    const val = parseFloat(customBet);
    if (isNaN(val) || val <= 0) return;
    const lamports = solToLamports(val);
    if (lamports > profile.balance) return;
    setBetAmount(lamports);
    setCustomBet('');
  };

  // Check if current bet is a preset
  const isCustomBetActive = betAmount > 0 && !BET_OPTIONS.some(o => o.lamports === betAmount);

  const handleBannerClick = (banner: BannerData) => {
    if (banner.action === 'bonus') {
      if (!isAuthenticated) {
        setScreen('auth');
      } else if (bonusClaimed === false) {
        handleClaimBonus();
      }
    } else if (banner.action === 'battle') {
      setMode('battle');
    } else if (banner.action === 'referrals' || banner.action === 'rewards') {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
      } else {
        setScreen('rewards');
      }
    }
  };

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      {/* Full-width Banner Carousel */}
      <BannerCarousel isMobile={isMobile} onBannerClick={handleBannerClick} />

      <div style={{
        ...styles.columns,
        ...(isMobile ? { gridTemplateColumns: '1fr', gap: '10px' } : {}),
      }}>
        {/* Left column: Configuration */}
        <div style={styles.leftCol}>

          {/* Mode */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Mode</span>
            </div>
            <div style={styles.modeRow}>
              <button
                onClick={() => setMode('solo')}
                style={{
                  ...styles.modeBtn,
                  ...(mode === 'solo' ? styles.modeBtnActive : {}),
                }}
              >
                Solo
              </button>
              <button
                onClick={() => setMode('battle')}
                style={{
                  ...styles.modeBtn,
                  ...(mode === 'battle' ? styles.modeBtnActive : {}),
                }}
              >
                Battle
              </button>
            </div>
          </div>

          {/* Position size */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Position size</span>
              <span style={styles.panelValue} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '26px', height: '26px', marginRight: '5px', verticalAlign: 'middle' }} />
                {formatSol(betAmount)}
              </span>
            </div>
            <div style={styles.betGrid}>
              {BET_OPTIONS.map((opt) => (
                <button
                  key={opt.lamports}
                  onClick={() => { setBetAmount(opt.lamports); setCustomBet(''); }}
                  disabled={opt.lamports > profile.balance}
                  style={{
                    ...styles.betChip,
                    ...(betAmount === opt.lamports ? styles.betChipActive : {}),
                    opacity: opt.lamports > profile.balance ? 0.25 : 1,
                  }}
                  className="mono"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={styles.customBetRow}>
              <span style={styles.customBetLabel}>Custom</span>
              <div style={styles.customBetInputWrap}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <input
                  type="number"
                  placeholder="0.00"
                  value={customBet}
                  onChange={(e) => setCustomBet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomBet(); }}
                  style={{
                    ...styles.customBetInput,
                    ...(isCustomBetActive ? { color: '#c084fc' } : {}),
                  }}
                  className="mono"
                  step="0.01"
                  min="0"
                />
                <button
                  onClick={handleCustomBet}
                  disabled={!customBet || parseFloat(customBet) <= 0}
                  style={{
                    ...styles.customBetBtn,
                    opacity: !customBet || parseFloat(customBet) <= 0 ? 0.35 : 1,
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* Game Mode */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Game Mode</span>
            </div>
            <div style={styles.riskGrid}>
              {GAME_MODE_OPTIONS.map(({ tier, label, desc, color, multipliers, gainTag, lossTag }) => {
                const isActive = riskTier === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => setRiskTier(tier)}
                    style={{
                      ...styles.riskCard,
                      ...(isActive ? {
                        border: `1px solid ${color}40`,
                        background: `${color}08`,
                      } : {}),
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <div style={{
                        ...styles.riskIndicator,
                        background: isActive ? color : theme.text.muted,
                      }} />
                      <div style={{ ...styles.riskInfo, flex: 1 }}>
                        <span style={{
                          ...styles.riskLabel,
                          color: isActive ? color : theme.text.secondary,
                          fontSize: '15px',
                        }}>{label}</span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: theme.text.muted,
                          lineHeight: 1.3,
                        }}>{desc}</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column' as const,
                        alignItems: 'flex-end',
                        gap: '2px',
                        flexShrink: 0,
                      }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.game.multiplier,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>gain {gainTag}</span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.game.divider,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>loss {lossTag}</span>
                      </div>
                    </div>
                    {isActive && (
                      <div style={styles.modeMultipliersWrap}>
                        {multipliers.map((m, i) => {
                          const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'legendary'];
                          const rarityColors: Record<string, string> = {
                            common: 'rgba(148, 163, 184, 0.6)',
                            uncommon: 'rgba(52, 211, 153, 0.8)',
                            rare: 'rgba(96, 165, 250, 0.9)',
                            legendary: 'rgba(251, 191, 36, 1)',
                          };
                          const rarity = rarities[i] || 'common';
                          return (
                            <span
                              key={i}
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                fontFamily: '"JetBrains Mono", monospace',
                                color: rarityColors[rarity],
                                padding: '2px 5px',
                                borderRadius: '3px',
                                background: `${rarityColors[rarity]}10`,
                                border: `1px solid ${rarityColors[rarity]}20`,
                              }}
                            >
                              {m}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Round Button — Duolingo 3D style */}
          <button
            onClick={() => {
              if (!isAuthenticated) {
                setShowAuthPrompt(true);
                return;
              }
              if (mode === 'battle') {
                enterBattle();
                return;
              }
              playBetPlaced();
              hapticMedium();
              startRound();
            }}
            disabled={isAuthenticated && betAmount > profile.balance}
            className="btn-3d btn-3d-primary"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '14px 24px',
              fontSize: '16px',
              width: '100%',
              opacity: isAuthenticated && betAmount > profile.balance ? 0.4 : 1,
            }}
          >
            <span style={styles.executeBtnText}>
              {mode === 'solo' ? 'Start Round' : 'Find Battle'}
            </span>
            <span style={styles.executeBtnSub} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />
              {formatSol(betAmount)} · {GAME_MODE_OPTIONS.find(o => o.tier === riskTier)?.label || riskTier}
            </span>
          </button>

          {/* Auth prompt overlay */}
          {showAuthPrompt && (
            <div style={styles.authOverlay} onClick={() => setShowAuthPrompt(false)}>
              <div style={styles.authModal} onClick={(e) => e.stopPropagation()}>
                <span style={styles.authTitle}>Sign in to play</span>
                <span style={styles.authDesc}>Create an account or sign in to start trading rounds.</span>
                <button
                  className="btn-3d btn-3d-primary"
                  style={{ padding: '12px 24px', fontSize: '16px', width: '100%' }}
                  onClick={() => { setShowAuthPrompt(false); setScreen('auth'); }}
                >
                  Sign in / Register
                </button>
                <button
                  style={styles.authDismiss}
                  onClick={() => setShowAuthPrompt(false)}
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Activity & Stats */}
        <div style={styles.rightCol}>
          {/* Stats */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Stats</span>
            </div>
            <div style={styles.statsBody}>
              <StatRow label="Balance" value={`${formatSol(profile.balance)} SOL`} color="#c084fc" icon />
              <StatRow label="Level" value={`${profile.level}`} />
              <StatRow label="VIP" value={profile.vipTier} color={theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary} />
              <StatRow label="Rounds" value={`${profile.roundsPlayed}`} />
              <StatRow label="Best" value={`${profile.bestMultiplier.toFixed(1)}x`} color={theme.game.multiplier} />
              <StatRow label="XP" value={`${profile.xp}/${profile.xpToNext}`} color={theme.accent.purple} />
              <div style={styles.xpBarContainer}>
                <div style={{
                  ...styles.xpBar,
                  width: `${(profile.xp / profile.xpToNext) * 100}%`,
                }} />
              </div>
            </div>
          </div>

          {/* Bonus Card — Unclaimed */}
          {isAuthenticated && bonusClaimed === false && (
            <div style={styles.bonusCard} className="card-enter card-enter-1">
              <div style={styles.bonusGlow} />
              <div style={styles.bonusContent}>
                <div style={styles.bonusIcon}><GiftIcon size={24} color="#c084fc" /></div>
                <div style={styles.bonusTextWrap}>
                  <span style={styles.bonusTitle}>Welcome Bonus!</span>
                  <span style={styles.bonusDesc}>
                    Claim <strong style={{ color: '#14F195' }}>1 SOL</strong> free to start playing.
                    Withdrawable after 1 SOL profit.
                  </span>
                </div>
                <button
                  onClick={handleClaimBonus}
                  disabled={claimingBonus}
                  className="btn-3d btn-3d-primary"
                  style={styles.bonusBtn}
                >
                  {claimingBonus ? 'Claiming...' : 'Claim 1 SOL'}
                </button>
              </div>
            </div>
          )}

          {/* Bonus Status — Claimed but locked */}
          {isAuthenticated && bonusClaimed === true && !bonusUnlocked && (
            <div style={styles.bonusStatusCard}>
              <div style={styles.bonusStatusRow}>
                <LockIcon size={18} color="#f87171" />
                <div style={styles.bonusStatusTextWrap}>
                  <span style={styles.bonusStatusTitle}>Bonus: 1 SOL locked</span>
                  <span style={styles.bonusStatusDesc}>
                    Earn {(bonusProfitRequired / 1_000_000_000).toFixed(0)} SOL profit to unlock withdrawals
                  </span>
                </div>
                <span style={{
                  ...styles.bonusStatusProgress,
                  color: bonusProfit >= 0 ? '#34d399' : '#f87171',
                }} className="mono">
                  {(bonusProfit / 1_000_000_000).toFixed(2)}/{(bonusProfitRequired / 1_000_000_000).toFixed(0)}
                </span>
              </div>
              <div style={styles.bonusProgressBarSmall}>
                <div style={{
                  ...styles.bonusProgressFillSmall,
                  width: `${Math.max(0, Math.min(100, (bonusProfit / bonusProfitRequired) * 100))}%`,
                }} />
              </div>
            </div>
          )}

          {/* Bonus Status — Unlocked */}
          {isAuthenticated && bonusClaimed === true && bonusUnlocked && (
            <div style={styles.bonusUnlockedCard}>
              <PartyIcon size={18} color="#34d399" />
              <span style={styles.bonusUnlockedText}>Bonus unlocked! Full balance withdrawable.</span>
            </div>
          )}

          {/* Recent plays */}
          <div style={{ ...styles.panel, flex: 1 }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Recent plays</span>
              {activityFeed.length > 0 && <span style={styles.liveBadge}>LIVE</span>}
            </div>
            <div style={styles.feedList}>
              {activityFeed.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' as const, color: theme.text.muted, fontSize: '13px' }}>
                  No recent activity
                </div>
              ) : (
                activityFeed.map((item, i) => (
                  <div key={i} style={styles.feedRow}>
                    <span style={styles.feedUser}>{item.user}</span>
                    <span style={{
                      ...styles.feedMult,
                      color: item.win ? theme.game.multiplier : theme.game.divider,
                    }} className="mono">
                      {item.mult}
                    </span>
                    <span style={{
                      ...styles.feedAmount,
                      color: item.win ? theme.game.multiplier : theme.game.divider,
                    }} className="mono">
                      {item.amount}
                    </span>
                    <span style={styles.feedTime}>{item.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div style={styles.quickStats}>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>Players</span>
              <span style={styles.quickStatValue} className="mono">{liveStats.active}</span>
            </div>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>24h vol</span>
              <span style={styles.quickStatValue} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />
                {liveStats.volume}
              </span>
            </div>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>Top win</span>
              <span style={styles.quickStatValue} className="mono">{liveStats.topWin}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function StatRow({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: boolean }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color || theme.text.primary }} className="mono">
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />}
        {value}
      </span>
    </div>
  );
}

function BannerCarousel({ isMobile, onBannerClick }: { isMobile: boolean; onBannerClick: (b: BannerData) => void }) {
  const visible = isMobile ? 1 : 3;
  const gap = 10;
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoSlide = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % BANNERS.length);
    }, 4000);
  };

  useEffect(() => {
    startAutoSlide();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Build visible window: show `visible` items starting from activeIndex, wrapping around
  const visibleBanners: { banner: BannerData; idx: number }[] = [];
  for (let i = 0; i < visible; i++) {
    const idx = (activeIndex + i) % BANNERS.length;
    visibleBanners.push({ banner: BANNERS[idx], idx });
  }

  return (
    <div style={styles.bannerRow}>
      {visibleBanners.map(({ banner, idx }) => (
        <div
          key={`${banner.id}-${activeIndex}`}
          onClick={() => onBannerClick(banner)}
          className="banner-card"
          style={styles.bannerCard}
        >
          <img
            src={banner.image}
            alt={banner.id}
            draggable={false}
            style={{
              width: '100%',
              display: 'block',
              borderRadius: '12px',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '16px',
    flex: 1,
    minHeight: 0,
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Banner Row (Shuffle-style)
  bannerRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '12px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    paddingBottom: '2px',
  },
  bannerCard: {
    flex: '1 1 0',
    minWidth: '0',
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
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
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    flex: 1,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  panelValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },

  // Mode Toggle
  modeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1px',
    background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.25), rgba(20, 241, 149, 0.25))',
  },
  modeBtn: {
    padding: '12px',
    background: theme.bg.secondary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: theme.text.muted,
    transition: 'all 0.15s ease',
  },
  modeBtnActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.08)',
  },

  // Bet Grid
  betGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.25), rgba(20, 241, 149, 0.25))',
  },
  betChip: {
    padding: '10px 4px',
    background: theme.bg.secondary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'all 0.12s ease',
    textAlign: 'center',
  },
  betChipActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.08)',
  },

  // Custom Bet
  customBetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderTop: `1px solid ${theme.border.subtle}`,
  },
  customBetLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    flexShrink: 0,
  },
  customBetInputWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: theme.bg.tertiary,
    borderRadius: '6px',
    padding: '0 8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  customBetInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    padding: '7px 0',
    width: '60px',
    minWidth: 0,
  },
  customBetBtn: {
    padding: '5px 10px',
    background: 'rgba(153, 69, 255, 0.12)',
    border: `1px solid rgba(153, 69, 255, 0.2)`,
    borderRadius: '5px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '13px',
    fontWeight: 700,
    color: '#c084fc',
    transition: 'all 0.12s ease',
    flexShrink: 0,
  },

  // Risk Profile
  riskGrid: {
    display: 'flex',
    flexDirection: 'column',
  },
  riskCard: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '0px',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    transition: 'all 0.15s ease',
    textAlign: 'left',
  },
  riskIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
  riskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  riskLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
  },
  riskTag: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  modeMultipliersWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: `1px solid ${theme.border.subtle}`,
    width: '100%',
  },

  // Execute Button
  executeBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '14px 24px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  executeBtnText: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Rajdhani, sans-serif',
  },
  executeBtnSub: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
  },

  // Stats
  statsBody: {
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
  xpBarContainer: {
    height: '3px',
    background: theme.bg.tertiary,
    borderRadius: '2px',
    marginTop: '4px',
    overflow: 'hidden',
  },
  xpBar: {
    height: '100%',
    background: '#9945FF',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },

  // Live Feed
  liveBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.success,
    padding: '2px 6px',
    background: `${theme.success}15`,
    borderRadius: '4px',
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
  },
  feedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  feedUser: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.secondary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  feedMult: {
    fontSize: '14px',
    fontWeight: 700,
    minWidth: '38px',
    textAlign: 'right',
  },
  feedAmount: {
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '70px',
    textAlign: 'right',
  },
  feedTime: {
    fontSize: '12px',
    color: theme.text.muted,
    minWidth: '38px',
    textAlign: 'right',
  },

  // Quick Stats
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.25), rgba(20, 241, 149, 0.25))',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  quickStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '10px 8px',
    background: theme.bg.secondary,
  },
  quickStatLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
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
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease',
  },
  authModal: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
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
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  authDesc: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.4,
  },
  authDismiss: {
    padding: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },

  // Bonus card
  bonusCard: {
    position: 'relative',
    borderRadius: '14px',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.15), rgba(20, 241, 149, 0.1))',
    border: '1px solid rgba(20, 241, 149, 0.25)',
    boxShadow: '0 4px 24px rgba(20, 241, 149, 0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  bonusGlow: {
    position: 'absolute',
    top: '-50%',
    right: '-30%',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(20, 241, 149, 0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
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
    fontSize: '16px',
    fontWeight: 700,
    color: '#14F195',
  },
  bonusDesc: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.3,
  },
  bonusBtn: {
    padding: '8px 16px',
    fontSize: '15px',
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },

  // Bonus status (after claim)
  bonusStatusCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '10px 12px',
    background: 'rgba(251, 191, 36, 0.05)',
    border: '1px solid rgba(251, 191, 36, 0.15)',
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
    background: 'linear-gradient(90deg, #9945FF, #14F195)',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  bonusUnlockedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: 'rgba(52, 211, 153, 0.06)',
    border: '1px solid rgba(52, 211, 153, 0.15)',
    borderRadius: '8px',
  },
  bonusUnlockedText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#34d399',
  },
};
