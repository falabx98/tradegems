import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { api } from '../../utils/api';
import { PageHeader } from '../ui/PageHeader';
import { StatCard } from '../ui/StatCard';

// ─── Season Data ────────────────────────────────────────────────────────────

const SEASON_NUMBER = 1;
const SEASON_MAX_LEVEL = 30;
const SEASON_END_DATE = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 days from now

interface SeasonReward {
  level: number;
  amountLamports: number;
  label: string;
  type: 'sol' | 'mystery';
}

const FREE_REWARDS: SeasonReward[] = [
  { level: 1, amountLamports: 1_000_000, label: '0.001 SOL', type: 'sol' },
  { level: 3, amountLamports: 5_000_000, label: '0.005 SOL', type: 'sol' },
  { level: 5, amountLamports: 10_000_000, label: '0.01 SOL', type: 'sol' },
  { level: 8, amountLamports: 20_000_000, label: '0.02 SOL', type: 'sol' },
  { level: 10, amountLamports: 50_000_000, label: '0.05 SOL', type: 'sol' },
  { level: 13, amountLamports: 20_000_000, label: '0.02 SOL', type: 'sol' },
  { level: 15, amountLamports: 100_000_000, label: '0.1 SOL', type: 'sol' },
  { level: 18, amountLamports: 50_000_000, label: '0.05 SOL', type: 'sol' },
  { level: 20, amountLamports: 200_000_000, label: '0.2 SOL', type: 'sol' },
  { level: 25, amountLamports: 500_000_000, label: '0.5 SOL', type: 'sol' },
  { level: 30, amountLamports: 1_000_000_000, label: '1.0 SOL', type: 'sol' },
];

const PREMIUM_REWARDS: SeasonReward[] = [
  { level: 2, amountLamports: 5_000_000, label: '0.005 SOL', type: 'sol' },
  { level: 5, amountLamports: 20_000_000, label: '0.02 SOL', type: 'sol' },
  { level: 10, amountLamports: 100_000_000, label: '0.1 SOL', type: 'sol' },
  { level: 15, amountLamports: 250_000_000, label: '0.25 SOL', type: 'sol' },
  { level: 20, amountLamports: 500_000_000, label: '0.5 SOL', type: 'sol' },
  { level: 25, amountLamports: 1_000_000_000, label: '1.0 SOL', type: 'sol' },
  { level: 30, amountLamports: 2_000_000_000, label: '2.0 SOL', type: 'sol' },
];

function getTimeRemaining() {
  const diff = SEASON_END_DATE.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return { days, hours, minutes };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SeasonScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();
  const profile = useGameStore((s) => s.profile);

  const seasonLevel = Math.min(profile.level, SEASON_MAX_LEVEL);
  const xpProgress = profile.xpToNext > 0 ? (profile.xp / profile.xpToNext) * 100 : 0;

  const [timeLeft, setTimeLeft] = useState(getTimeRemaining());
  const [claimedFree, setClaimedFree] = useState<Set<number>>(new Set());
  const [claimedPremium, setClaimedPremium] = useState<Set<number>>(new Set());
  const [hasPremium] = useState(false);
  const [claimLoading, setClaimLoading] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeRemaining()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch claimed rewards from server
  useEffect(() => {
    (async () => {
      try {
        const status = await api.getSeasonStatus();
        setClaimedFree(new Set(status.claimedFree));
        setClaimedPremium(new Set(status.claimedPremium));
      } catch { /* Non-critical */ }
    })();
  }, []);

  async function handleClaimFree(level: number) {
    if (claimLoading !== null) return;
    setClaimLoading(level);
    try {
      await api.claimSeasonReward(level, 'free');
      setClaimedFree((prev) => new Set(prev).add(level));
    } catch (err: any) {
      console.error('Claim failed:', err?.message);
    } finally {
      setClaimLoading(null);
    }
  }

  async function handleClaimPremium(level: number) {
    if (!hasPremium || claimLoading !== null) return;
    setClaimLoading(level);
    try {
      await api.claimSeasonReward(level, 'premium');
      setClaimedPremium((prev) => new Set(prev).add(level));
    } catch (err: any) {
      console.error('Premium claim failed:', err?.message);
    } finally {
      setClaimLoading(null);
    }
  }

  // Calculate total free SOL earned
  const totalFreeEarned = FREE_REWARDS
    .filter((r) => r.level <= seasonLevel && claimedFree.has(r.level))
    .reduce((sum, r) => sum + r.amountLamports, 0);

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      <PageHeader
        title={`Season ${SEASON_NUMBER}`}
        subtitle="Battle Pass — earn XP and claim tier rewards"
        action={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ends in</span>
            <span className="mono" style={{ fontSize: '15px', fontWeight: 700, color: theme.warning }}>
              {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
            </span>
          </div>
        }
      />

      {/* Progress Card */}
      <div style={styles.headerCard} className="card-enter card-enter-1">
        <div style={styles.headerTop}>
          <div style={styles.headerLeft}>
            <span style={styles.seasonTitle}>Season {SEASON_NUMBER}</span>
            <span style={styles.seasonSubtitle}>Battle Pass</span>
          </div>
        </div>

        {/* Season Level Progress */}
        <div style={styles.progressSection}>
          <div style={styles.levelRow}>
            <span style={styles.levelLabel}>Level {seasonLevel}</span>
            <span style={styles.xpLabel} className="mono">
              {profile.xp} / {profile.xpToNext} XP
            </span>
          </div>
          <div style={styles.progressBarOuter}>
            <div style={{
              ...styles.progressBarInner,
              width: `${(seasonLevel / SEASON_MAX_LEVEL) * 100}%`,
            }} />
            {/* Level markers */}
            {[5, 10, 15, 20, 25, 30].map((m) => (
              <div
                key={m}
                style={{
                  ...styles.levelMarker,
                  left: `${(m / SEASON_MAX_LEVEL) * 100}%`,
                  opacity: seasonLevel >= m ? 1 : 0.3,
                }}
              >
                <span style={styles.levelMarkerText}>{m}</span>
              </div>
            ))}
          </div>
          <div style={styles.xpSubBar}>
            <div style={{
              ...styles.xpSubBarFill,
              width: `${xpProgress}%`,
            }} />
          </div>
          <span style={styles.xpSubLabel}>XP to next level</span>
        </div>
      </div>

      {/* Premium Upsell (if not premium) */}
      {!hasPremium && (
        <div style={styles.premiumCard} className="card-enter card-enter-2">
          <div style={styles.premiumContent}>
            <div style={styles.premiumTextWrap}>
              <span style={styles.premiumTitle}>Upgrade to Premium</span>
              <span style={styles.premiumDesc}>
                Unlock exclusive rewards worth up to 3.875 SOL total
              </span>
            </div>
            <button style={styles.premiumBtn} className="btn-3d btn-3d-primary">
              Coming Soon
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={styles.statsRow} className="card-enter card-enter-3">
        <StatCard
          label="Season Rank"
          value={`#${seasonLevel > 0 ? Math.max(1, 100 - seasonLevel * 3) : '--'}`}
          color={theme.accent.purple}
        />
        <StatCard
          label="Total XP"
          value={profile.xp}
        />
        <StatCard
          label="Claimed"
          value={`${formatSol(totalFreeEarned)} SOL`}
          trend="up"
        />
        <StatCard
          label="Days Left"
          value={timeLeft.days}
          color={theme.warning}
        />
      </div>

      {/* Reward Track */}
      <div style={styles.trackCard} className="card-enter card-enter-4">
        <div style={styles.trackHeader}>
          <span style={styles.trackTitle}>Reward Track</span>
          <div style={styles.trackLegend}>
            <span style={styles.legendFree}>Free</span>
            <span style={styles.legendPremium}>Premium</span>
          </div>
        </div>

        <div style={styles.trackScroll}>
          {Array.from({ length: SEASON_MAX_LEVEL }, (_, i) => i + 1).map((lvl) => {
            const freeReward = FREE_REWARDS.find((r) => r.level === lvl);
            const premiumReward = PREMIUM_REWARDS.find((r) => r.level === lvl);
            const isUnlocked = seasonLevel >= lvl;
            const isCurrent = seasonLevel === lvl;

            return (
              <div
                key={lvl}
                style={{
                  ...styles.tierRow,
                  ...(isCurrent ? styles.tierRowCurrent : {}),
                  ...(isUnlocked && !isCurrent ? styles.tierRowUnlocked : {}),
                }}
              >
                {/* Level Number */}
                <div style={{
                  ...styles.tierLevel,
                  ...(isUnlocked ? styles.tierLevelUnlocked : {}),
                  ...(isCurrent ? styles.tierLevelCurrent : {}),
                }}>
                  <span style={styles.tierLevelText}>{lvl}</span>
                </div>

                {/* Free Track */}
                <div style={styles.tierRewardSlot}>
                  {freeReward ? (
                    <div style={{
                      ...styles.rewardBox,
                      ...(isUnlocked ? styles.rewardBoxUnlocked : {}),
                      ...(claimedFree.has(lvl) ? styles.rewardBoxClaimed : {}),
                    }}>
                      <div style={styles.rewardIconWrap}>
                        <img src="/sol-coin.png" alt="SOL" style={styles.rewardIcon} />
                      </div>
                      <span style={styles.rewardAmount} className="mono">{freeReward.label}</span>
                      {isUnlocked && !claimedFree.has(lvl) ? (
                        <button
                          style={styles.claimBtn}
                          onClick={() => handleClaimFree(lvl)}
                        >
                          Claim
                        </button>
                      ) : claimedFree.has(lvl) ? (
                        <span style={styles.claimedBadge}>Claimed</span>
                      ) : (
                        <span style={styles.lockedBadge}>Lv {lvl}</span>
                      )}
                    </div>
                  ) : (
                    <div style={styles.emptySlot}>--</div>
                  )}
                </div>

                {/* Premium Track */}
                <div style={styles.tierRewardSlot}>
                  {premiumReward ? (
                    <div style={{
                      ...styles.rewardBox,
                      ...styles.rewardBoxPremium,
                      ...(isUnlocked && hasPremium ? styles.rewardBoxUnlocked : {}),
                      ...(claimedPremium.has(lvl) ? styles.rewardBoxClaimed : {}),
                    }}>
                      {!hasPremium && <div style={styles.premiumLockOverlay} />}
                      <div style={styles.rewardIconWrap}>
                        <img src="/sol-coin.png" alt="SOL" style={styles.rewardIcon} />
                      </div>
                      <span style={{ ...styles.rewardAmount, color: '#3b82f6' }} className="mono">
                        {premiumReward.label}
                      </span>
                      {!hasPremium ? (
                        <span style={styles.premiumLockBadge}>Premium</span>
                      ) : isUnlocked && !claimedPremium.has(lvl) ? (
                        <button
                          style={{ ...styles.claimBtn, background: 'rgba(139, 92, 246, 0.3)', borderColor: 'rgba(139, 92, 246, 0.5)' }}
                          onClick={() => handleClaimPremium(lvl)}
                        >
                          Claim
                        </button>
                      ) : claimedPremium.has(lvl) ? (
                        <span style={styles.claimedBadge}>Claimed</span>
                      ) : (
                        <span style={styles.lockedBadge}>Lv {lvl}</span>
                      )}
                    </div>
                  ) : (
                    <div style={styles.emptySlot}>--</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    minHeight: '100%',
    boxSizing: 'border-box',
  },

  // Header Card
  headerCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    padding: '20px',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  seasonTitle: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  seasonSubtitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  timerWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  timerLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  timerValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: theme.warning,
    textShadow: '0 0 10px rgba(251, 191, 36, 0.3)',
  },

  // Progress Section
  progressSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  levelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelLabel: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  xpLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#3b82f6',
  },
  progressBarOuter: {
    position: 'relative',
    height: '10px',
    background: 'rgba(22, 29, 45, 0.9)',
    borderRadius: '5px',
    overflow: 'visible',
    border: '1px solid rgba(139, 92, 246, 0.15)',
  },
  progressBarInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: 'linear-gradient(90deg, #8b5cf6, #3b82f6, #a78bfa)',
    borderRadius: '5px',
    transition: 'width 0.5s ease',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.4)',
  },
  levelMarker: {
    position: 'absolute',
    top: '14px',
    transform: 'translateX(-50%)',
  },
  levelMarkerText: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  xpSubBar: {
    height: '3px',
    background: 'rgba(22, 29, 45, 0.6)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '14px',
  },
  xpSubBarFill: {
    height: '100%',
    background: '#8b5cf6',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  xpSubLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
    textAlign: 'right' as const,
  },

  // Premium Card
  premiumCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.accent}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  premiumContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
  },
  premiumTextWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  premiumTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#3b82f6',
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  premiumDesc: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.3,
  },
  premiumBtn: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    opacity: 0.6,
    cursor: 'default',
  },

  // Stats Row
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },

  // Track Card
  trackCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  trackHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  trackTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.secondary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  trackLegend: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  legendFree: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.success,
    padding: '2px 8px',
    background: 'rgba(46, 204, 113, 0.1)',
    borderRadius: '4px',
    border: '1px solid rgba(46, 204, 113, 0.2)',
  },
  legendPremium: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#3b82f6',
    padding: '2px 8px',
    background: 'rgba(139, 92, 246, 0.1)',
    borderRadius: '4px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },

  // Track Scroll
  trackScroll: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },

  // Tier Row
  tierRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    transition: 'background-color 0.15s ease',
    minHeight: '56px',
  },
  tierRowCurrent: {
    background: 'rgba(139, 92, 246, 0.08)',
    borderLeft: '3px solid #8b5cf6',
  },
  tierRowUnlocked: {
    background: 'rgba(46, 204, 113, 0.03)',
  },

  // Level Badge
  tierLevel: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.bg.elevated,
    border: `2px solid ${theme.border.medium}`,
    flexShrink: 0,
  },
  tierLevelUnlocked: {
    border: '2px solid rgba(46, 204, 113, 0.3)',
    background: 'rgba(46, 204, 113, 0.06)',
  },
  tierLevelCurrent: {
    border: '2px solid #8b5cf6',
    background: 'rgba(139, 92, 246, 0.15)',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
  },
  tierLevelText: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.secondary,
  },

  // Reward Slot
  tierRewardSlot: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },

  // Reward Box
  rewardBox: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    width: '100%',
    maxWidth: '200px',
    transition: 'all 0.15s ease',
  },
  rewardBoxUnlocked: {
    border: '1px solid rgba(46, 204, 113, 0.2)',
    background: 'rgba(46, 204, 113, 0.04)',
  },
  rewardBoxClaimed: {
    opacity: 0.5,
    border: '1px solid rgba(139, 92, 246, 0.06)',
  },
  rewardBoxPremium: {
    border: '1px solid rgba(139, 92, 246, 0.15)',
    background: 'rgba(139, 92, 246, 0.04)',
  },
  premiumLockOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(14, 10, 22, 0.5)',
    borderRadius: '7px',
    zIndex: 1,
  },
  rewardIconWrap: {
    flexShrink: 0,
    position: 'relative' as const,
    zIndex: 2,
  },
  rewardIcon: {
    width: '22px',
    height: '22px',
  },
  rewardAmount: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.success,
    flex: 1,
    position: 'relative' as const,
    zIndex: 2,
  },
  claimBtn: {
    padding: '4px 10px',
    background: 'rgba(46, 204, 113, 0.15)',
    border: '1px solid rgba(46, 204, 113, 0.35)',
    borderRadius: '6px',
    color: '#2ecc71',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
    position: 'relative' as const,
    zIndex: 2,
  },
  claimedBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '4px',
    position: 'relative' as const,
    zIndex: 2,
  },
  lockedBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    opacity: 0.5,
    position: 'relative' as const,
    zIndex: 2,
  },
  premiumLockBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#3b82f6',
    opacity: 0.7,
    position: 'relative' as const,
    zIndex: 2,
  },
  emptySlot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '200px',
    padding: '6px 10px',
    fontSize: '13px',
    color: 'rgba(74, 75, 106, 0.3)',
    fontWeight: 600,
  },
};
