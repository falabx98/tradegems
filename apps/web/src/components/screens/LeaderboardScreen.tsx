import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: string;
  roundsPlayed?: number;
}

const TABS = [
  { id: 'profit', label: 'Top profit' },
  { id: 'multiplier', label: 'Best mult' },
  { id: 'volume', label: 'Volume' },
] as const;

const PERIODS = [
  { id: 'daily', label: '24h' },
  { id: 'weekly', label: '7d' },
  { id: 'all', label: 'All' },
] as const;

export function LeaderboardScreen() {
  const profile = useGameStore((s) => s.profile);
  const [activeTab, setActiveTab] = useState<string>('profit');
  const [activePeriod, setActivePeriod] = useState<string>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [activeTab, activePeriod]);

  async function loadLeaderboard() {
    setLoading(true);
    try {
      const res = await api.getLeaderboard(activeTab, activePeriod) as any;
      setEntries(res.data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function formatScore(score: string, tab: string) {
    const val = parseFloat(score || '0');
    if (tab === 'multiplier') return `${val.toFixed(2)}x`;
    return `${formatSol(val)} SOL`;
  }

  function rankBadge(rank: number) {
    if (rank === 1) return { bg: '#ffd70020', color: '#ffd700', label: '1st' };
    if (rank === 2) return { bg: '#c0c0c020', color: '#c0c0c0', label: '2nd' };
    if (rank === 3) return { bg: '#cd7f3220', color: '#cd7f32', label: '3rd' };
    return null;
  }

  return (
    <div style={styles.container}>
      {/* Tabs */}
      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={styles.tabSpacer} />
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePeriod(p.id)}
            style={{
              ...styles.periodBtn,
              ...(activePeriod === p.id ? styles.periodActive : {}),
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Table */}
      <div style={styles.panel}>
        <div style={styles.tableHeader}>
          <span style={{ ...styles.th, width: '50px' }}>Rank</span>
          <span style={{ ...styles.th, flex: 1 }}>Player</span>
          <span style={{ ...styles.th, width: '120px', textAlign: 'right' }}>Score</span>
        </div>
        <div style={styles.tableBody}>
          {loading ? (
            <div style={styles.empty}>Loading rankings...</div>
          ) : entries.length === 0 ? (
            <div style={styles.empty}>No rankings available yet. Play some rounds!</div>
          ) : (
            entries.map((entry) => {
              const badge = rankBadge(entry.rank);
              const isMe = entry.userId === profile.id;
              return (
                <div
                  key={entry.userId}
                  style={{
                    ...styles.row,
                    ...(isMe ? styles.rowMe : {}),
                  }}
                >
                  <span style={{ ...styles.rank, width: '50px' }}>
                    {badge ? (
                      <span style={{
                        ...styles.badge,
                        background: badge.bg,
                        color: badge.color,
                      }}>{badge.label}</span>
                    ) : (
                      <span className="mono" style={{ color: theme.text.muted }}>#{entry.rank}</span>
                    )}
                  </span>
                  <span style={{ ...styles.username, flex: 1 }}>
                    {entry.username || 'Anonymous'}
                    {isMe && <span style={styles.meTag}>You</span>}
                  </span>
                  <span style={{ ...styles.score, width: '120px', textAlign: 'right' }} className="mono">
                    {formatScore(entry.score, activeTab)}
                  </span>
                </div>
              );
            })
          )}
        </div>
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
    alignItems: 'center',
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
  tabSpacer: { flex: 1 },
  periodBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '4px',
    color: theme.text.muted,
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  periodActive: {
    background: 'rgba(139, 139, 245, 0.08)',
    border: '1px solid rgba(139, 139, 245, 0.15)',
    color: theme.accent.purple,
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
  tableHeader: {
    display: 'flex',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  th: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  tableBody: {
    flex: 1,
    overflow: 'auto',
  },
  row: {
    display: 'flex',
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    alignItems: 'center',
  },
  rowMe: {
    background: 'rgba(108, 156, 255, 0.05)',
    borderLeft: `2px solid ${theme.accent.cyan}`,
  },
  rank: {
    fontSize: '12px',
    fontWeight: 600,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '3px',
  },
  username: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  meTag: {
    fontSize: '9px',
    fontWeight: 700,
    color: theme.accent.cyan,
    padding: '1px 5px',
    background: 'rgba(108, 156, 255, 0.08)',
    borderRadius: '3px',
  },
  score: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.cyan,
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '12px',
    color: theme.text.muted,
  },
};
