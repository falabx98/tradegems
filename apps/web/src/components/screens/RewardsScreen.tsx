import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';

interface Mission {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: number;
  completed: boolean;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string | null;
}

export function RewardsScreen() {
  const profile = useGameStore((s) => s.profile);
  const [tab, setTab] = useState<'missions' | 'achievements' | 'rakeback'>('missions');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [rakebackInfo, setRakebackInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      if (tab === 'missions') {
        const res = await api.getLeaderboard('profit') as any;
        setMissions([
          { id: '1', title: 'First Blood', description: 'Complete your first round', progress: Math.min(profile.roundsPlayed, 1), target: 1, reward: 50_000_000, completed: profile.roundsPlayed >= 1 },
          { id: '2', title: 'Getting Started', description: 'Play 5 rounds', progress: Math.min(profile.roundsPlayed, 5), target: 5, reward: 100_000_000, completed: profile.roundsPlayed >= 5 },
          { id: '3', title: 'High Roller', description: 'Wager 5 SOL total', progress: Math.min(profile.totalWagered, 5_000_000_000), target: 5_000_000_000, reward: 250_000_000, completed: profile.totalWagered >= 5_000_000_000 },
          { id: '4', title: 'Multiplier Hunter', description: 'Hit a 5x multiplier', progress: profile.bestMultiplier >= 5 ? 1 : 0, target: 1, reward: 500_000_000, completed: profile.bestMultiplier >= 5 },
          { id: '5', title: 'Marathon', description: 'Play 50 rounds', progress: Math.min(profile.roundsPlayed, 50), target: 50, reward: 1_000_000_000, completed: profile.roundsPlayed >= 50 },
        ]);
      } else if (tab === 'achievements') {
        setAchievements([
          { id: '1', title: 'Arena Entrant', description: 'Enter the trading arena', unlockedAt: profile.roundsPlayed > 0 ? new Date().toISOString() : null },
          { id: '2', title: 'Risk Taker', description: 'Play a round on aggressive', unlockedAt: null },
          { id: '3', title: 'Diamond Hands', description: 'Hold through a 0.5x dip and recover', unlockedAt: null },
          { id: '4', title: 'Moon Shot', description: 'Hit a 10x+ multiplier', unlockedAt: profile.bestMultiplier >= 10 ? new Date().toISOString() : null },
          { id: '5', title: 'Veteran', description: 'Reach level 10', unlockedAt: profile.level >= 10 ? new Date().toISOString() : null },
        ]);
      } else {
        setRakebackInfo({
          rate: profile.rakebackRate,
          tier: profile.vipTier,
          pending: 0,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function formatReward(lamports: number): string {
    return `${(lamports / 1_000_000_000).toFixed(2)} SOL`;
  }

  return (
    <div style={styles.container}>
      {/* Tabs */}
      <div style={styles.tabBar}>
        {(['missions', 'achievements', 'rakeback'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.panel}>
        {tab === 'missions' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Daily missions</span>
            </div>
            <div style={styles.list}>
              {missions.map((m) => (
                <div key={m.id} style={{
                  ...styles.missionRow,
                  opacity: m.completed ? 0.6 : 1,
                }}>
                  <div style={styles.missionLeft}>
                    <div style={styles.missionTitle}>
                      {m.completed && <span style={styles.checkMark}>✓</span>}
                      {m.title}
                    </div>
                    <div style={styles.missionDesc}>{m.description}</div>
                    <div style={styles.progressTrack}>
                      <div style={{
                        ...styles.progressFill,
                        width: `${Math.min((m.progress / m.target) * 100, 100)}%`,
                        background: m.completed ? theme.success : theme.accent.cyan,
                      }} />
                    </div>
                    <div style={styles.progressLabel} className="mono">
                      {m.progress}/{m.target}
                    </div>
                  </div>
                  <div style={styles.missionReward}>
                    <span style={styles.rewardLabel}>Reward</span>
                    <span style={styles.rewardValue} className="mono">
                      <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', marginRight: '4px', verticalAlign: 'middle' }} />
                      {formatReward(m.reward)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'achievements' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Achievements</span>
            </div>
            <div style={styles.list}>
              {achievements.map((a) => (
                <div key={a.id} style={{
                  ...styles.achievementRow,
                  opacity: a.unlockedAt ? 1 : 0.4,
                }}>
                  <div style={styles.achieveIcon}>
                    {a.unlockedAt ? '★' : '☆'}
                  </div>
                  <div style={styles.achieveInfo}>
                    <div style={styles.achieveTitle}>{a.title}</div>
                    <div style={styles.achieveDesc}>{a.description}</div>
                  </div>
                  <div style={styles.achieveStatus}>
                    {a.unlockedAt ? (
                      <span style={{ color: theme.success, fontSize: '10px', fontWeight: 600 }}>Unlocked</span>
                    ) : (
                      <span style={{ color: theme.text.muted, fontSize: '10px', fontWeight: 600 }}>Locked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'rakeback' && rakebackInfo && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Rakeback</span>
            </div>
            <div style={styles.rakebackBody}>
              <div style={styles.rakebackCard}>
                <div style={styles.rakebackLabel}>Your rakeback rate</div>
                <div style={styles.rakebackRate} className="mono">
                  {(rakebackInfo.rate * 100).toFixed(1)}%
                </div>
                <div style={styles.rakebackTier}>
                  VIP {rakebackInfo.tier}
                </div>
              </div>
              <div style={styles.rakebackInfo}>
                <p style={styles.rakebackText}>
                  Earn back a percentage of platform fees on every round you play.
                  Higher VIP tiers unlock better rakeback rates.
                </p>
                <div style={styles.rakebackTiers}>
                  {[
                    { tier: 'Bronze', rate: '1%' },
                    { tier: 'Silver', rate: '2%' },
                    { tier: 'Gold', rate: '3%' },
                    { tier: 'Platinum', rate: '5%' },
                    { tier: 'Titan', rate: '8%' },
                  ].map((t) => (
                    <div key={t.tier} style={{
                      ...styles.tierRow,
                      color: t.tier.toLowerCase() === rakebackInfo.tier ? theme.accent.cyan : theme.text.muted,
                    }}>
                      <span>{t.tier}</span>
                      <span className="mono">{t.rate}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    height: '100%',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
  },
  tab: {
    padding: '6px 14px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.muted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  tabActive: {
    background: 'rgba(108, 156, 255, 0.08)',
    border: '1px solid rgba(108, 156, 255, 0.15)',
    color: theme.accent.cyan,
  },
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  },
  list: {
    flex: 1,
    overflow: 'auto',
  },
  // Missions
  missionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    gap: '16px',
  },
  missionLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  missionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  checkMark: {
    color: theme.success,
    fontSize: '13px',
  },
  missionDesc: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  progressTrack: {
    height: '3px',
    background: theme.bg.primary,
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '10px',
    color: theme.text.muted,
  },
  missionReward: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '2px',
  },
  rewardLabel: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  rewardValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.accent.cyan,
    display: 'flex',
    alignItems: 'center',
  },
  // Achievements
  achievementRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  achieveIcon: {
    fontSize: '18px',
    color: theme.warning,
    width: '28px',
    textAlign: 'center',
  },
  achieveInfo: {
    flex: 1,
  },
  achieveTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  achieveDesc: {
    fontSize: '11px',
    color: theme.text.muted,
    marginTop: '2px',
  },
  achieveStatus: {},
  // Rakeback
  rakebackBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  rakebackCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '24px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  rakebackLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  rakebackRate: {
    fontSize: '36px',
    fontWeight: 900,
    color: theme.accent.cyan,
    lineHeight: 1,
  },
  rakebackTier: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    marginTop: '4px',
  },
  rakebackInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rakebackText: {
    fontSize: '12px',
    color: theme.text.muted,
    lineHeight: 1.5,
    margin: 0,
  },
  rakebackTiers: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  tierRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: 600,
    padding: '6px 12px',
    background: theme.bg.tertiary,
    borderRadius: '4px',
  },
};
