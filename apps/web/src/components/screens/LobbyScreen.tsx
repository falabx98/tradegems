import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { GiftIcon, LockIcon, PartyIcon } from '../ui/GameIcons';
import { ActivityFeed } from '../ActivityFeed';

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
    cta: 'Enter Tournament',
    accentColor: '#FFD700',
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

export function LobbyScreen() {
  const isMobile = useIsMobile();
  const { profile, syncProfile } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const go = useAppNavigate();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
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

  const handleBannerClick = (banner: BannerData) => {
    if (banner.action === 'bonus') {
      if (!isAuthenticated) {
        go('auth');
      } else if (bonusClaimed === false) {
        handleClaimBonus();
      }
    } else if (banner.action === 'battle') {
      go('battle');
    } else if (banner.action === 'referrals' || banner.action === 'rewards') {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
      } else {
        go('rewards');
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
        {/* Left column: Game cards */}
        <div style={styles.leftCol}>

          {/* Section Title */}
          <div style={styles.sectionTitle}>Games</div>

          {/* Game Cards Grid */}
          <div style={{
            ...styles.gameCardsGrid,
            ...(isMobile ? { gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } : {}),
          }}>
            {/* Solo */}
            <div
              onClick={() => {
                if (!isAuthenticated) { setShowAuthPrompt(true); return; }
                go('setup');
              }}
              style={styles.gameCard}
              className="game-card"
            >
              <img src="/game-solo.png" alt="Solo" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Solo</span>
                <span style={styles.gameCardSub}>Trade vs. the chart</span>
              </div>
            </div>

            {/* Tournament */}
            <div
              onClick={() => {
                if (!isAuthenticated) { setShowAuthPrompt(true); return; }
                go('battle');
              }}
              style={styles.gameCard}
              className="game-card"
            >
              <img src="/game-tournament.png" alt="Tournament" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Tournament</span>
                <span style={styles.gameCardSub}>Winner takes all</span>
              </div>
            </div>

            {/* Predictions */}
            <div
              onClick={() => {
                if (!isAuthenticated) { setShowAuthPrompt(true); return; }
                go('prediction');
              }}
              style={styles.gameCard}
              className="game-card"
            >
              <img src="/game-predictions.png" alt="Predictions" draggable={false} style={styles.gameCardImg} />
              <div style={styles.gameCardOverlay} />
              <div style={styles.gameCardContent}>
                <span style={styles.gameCardTitle}>Predictions</span>
                <span style={styles.gameCardSub}>Up or Down?</span>
              </div>
            </div>
          </div>

          {/* Auth prompt overlay */}
          {showAuthPrompt && (
            <div style={styles.authOverlay} onClick={() => setShowAuthPrompt(false)}>
              <div style={styles.authModal} onClick={(e) => e.stopPropagation()}>
                <span style={styles.authTitle}>Sign in to play</span>
                <span style={styles.authDesc}>Create an account or sign in to start trading rounds.</span>
                <button
                  className="btn-3d btn-3d-primary"
                  style={{ padding: '12px 24px', fontSize: '16px', width: '100%' }}
                  onClick={() => { setShowAuthPrompt(false); go('auth'); }}
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
          <ActivityFeed />

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
              width: '104%',
              marginLeft: '-2%',
              marginTop: '-2%',
              display: 'block',
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

  // Section Title
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '3px',
    marginBottom: '10px',
  },

  // Game Cards
  gameCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  gameCard: {
    position: 'relative',
    borderRadius: '14px',
    overflow: 'hidden',
    cursor: 'pointer',
    aspectRatio: '3 / 4',
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
    fontSize: '16px',
    fontWeight: 800,
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  },
  gameCardSub: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.65)',
    textShadow: '0 1px 4px rgba(0,0,0,0.5)',
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
