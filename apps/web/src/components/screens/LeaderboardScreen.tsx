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

  function rankInfo(rank: number) {
    if (rank === 1) return { trophy: '🏆', color: '#ffd700', border: 'rgba(255, 215, 0, 0.2)', shadow: 'rgba(255, 215, 0, 0.1)', label: '1st' };
    if (rank === 2) return { trophy: '🥈', color: '#c0c0c0', border: 'rgba(192, 192, 192, 0.2)', shadow: 'rgba(192, 192, 192, 0.1)', label: '2nd' };
    if (rank === 3) return { trophy: '🥉', color: '#cd7f32', border: 'rgba(205, 127, 50, 0.2)', shadow: 'rgba(205, 127, 50, 0.1)', label: '3rd' };
    return null;
  }

  const top3 = entries.slice(0, 3);
  const hasTop3 = top3.length >= 3 && !loading;

  return (
    <div style={styles.container}>
      {/* Tabs */}
      <div style={styles.tabBar} className="card-enter card-enter-1">
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

      {/* Top 3 Podium */}
      {hasTop3 && (
        <div style={styles.podium} className="card-enter card-enter-2">
          {/* 2nd place */}
          <div style={{ ...styles.podiumCard, border: `1px solid ${rankInfo(2)!.border}` }}>
            <span style={styles.podiumTrophy}>🥈</span>
            <span className="badge-metallic" style={{ ...styles.podiumRank, background: `${rankInfo(2)!.color}20`, color: rankInfo(2)!.color }}>2nd</span>
            <span style={styles.podiumName}>{top3[1].username || 'Anonymous'}</span>
            <span style={styles.podiumScore} className="mono">{formatScore(top3[1].score, activeTab)}</span>
          </div>
          {/* 1st place */}
          <div style={{ ...styles.podiumCard, ...styles.podiumFirst, border: `1px solid ${rankInfo(1)!.border}`, boxShadow: `0 0 20px ${rankInfo(1)!.shadow}` }}>
            <span style={{ ...styles.podiumTrophy, fontSize: '38px' }}>🏆</span>
            <span className="badge-metallic" style={{ ...styles.podiumRank, background: `${rankInfo(1)!.color}20`, color: rankInfo(1)!.color }}>1st</span>
            <span style={styles.podiumName}>{top3[0].username || 'Anonymous'}</span>
            <span style={styles.podiumScore} className="mono">{formatScore(top3[0].score, activeTab)}</span>
          </div>
          {/* 3rd place */}
          <div style={{ ...styles.podiumCard, border: `1px solid ${rankInfo(3)!.border}` }}>
            <span style={styles.podiumTrophy}>🥉</span>
            <span className="badge-metallic" style={{ ...styles.podiumRank, background: `${rankInfo(3)!.color}20`, color: rankInfo(3)!.color }}>3rd</span>
            <span style={styles.podiumName}>{top3[2].username || 'Anonymous'}</span>
            <span style={styles.podiumScore} className="mono">{formatScore(top3[2].score, activeTab)}</span>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div style={styles.panel} className="card-enter card-enter-3">
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
              const info = rankInfo(entry.rank);
              const isMe = entry.userId === profile.id;
              return (
                <div
                  key={entry.userId}
                  className="table-row-hover"
                  style={{
                    ...styles.row,
                    ...(isMe ? styles.rowMe : {}),
                  }}
                >
                  <span style={{ ...styles.rank, width: '50px' }}>
                    {info ? (
                      <span className="badge-metallic" style={{
                        ...styles.badge,
                        background: `${info.color}20`,
                        color: info.color,
                        boxShadow: `0 0 6px ${info.shadow}`,
                      }}>
                        {info.trophy} {info.label}
                      </span>
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
    overflow: 'auto',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '4px',
  },
  tab: {
    padding: '6px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: theme.text.muted,
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    transition: 'all 0.15s',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tabActive: {
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
    boxShadow: '0 0 12px rgba(153, 69, 255, 0.3)',
  },
  tabSpacer: { flex: 1 },
  periodBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: theme.text.muted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    transition: 'all 0.15s',
  },
  periodActive: {
    background: 'rgba(153, 69, 255, 0.18)',
    color: theme.accent.purple,
    boxShadow: '0 0 8px rgba(153, 69, 255, 0.2)',
  },

  // Podium
  podium: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  podiumCard: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  podiumFirst: {
    padding: '24px 16px',
  },
  podiumTrophy: {
    fontSize: '30px',
    lineHeight: 1,
  },
  podiumRank: {
    fontSize: '12px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '6px',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  podiumName: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  podiumScore: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#c084fc',
    textShadow: '0 0 8px rgba(192, 132, 252, 0.4)',
  },

  // Table
  panel: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(153, 69, 255, 0.18)',
    borderRadius: '14px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  tableHeader: {
    display: 'flex',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(153, 69, 255, 0.08)',
    background: 'rgba(32, 24, 48, 0.95)',
  },
  th: {
    fontSize: '13px',
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
    borderBottom: '1px solid rgba(153, 69, 255, 0.06)',
    alignItems: 'center',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
  rowMe: {
    background: 'rgba(153, 69, 255, 0.08)',
    boxShadow: 'inset 0 0 20px rgba(153, 69, 255, 0.08)',
    borderLeft: '3px solid #9945FF',
  },
  rank: {
    fontSize: '14px',
    fontWeight: 600,
  },
  badge: {
    fontSize: '12px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '6px',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  username: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  meTag: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#c084fc',
    padding: '2px 6px',
    background: 'rgba(153, 69, 255, 0.18)',
    borderRadius: '6px',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    boxShadow: '0 0 8px rgba(153, 69, 255, 0.2)',
  },
  score: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#c084fc',
    textShadow: '0 0 8px rgba(192, 132, 252, 0.4)',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '14px',
    color: theme.text.muted,
  },
};
