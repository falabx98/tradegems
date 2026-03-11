import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { useIsMobile } from '../../hooks/useIsMobile';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: string;
  roundsPlayed?: number;
}

const TABS = [
  { id: 'profit', label: 'Top Profit', icon: '💰' },
  { id: 'multiplier', label: 'Best Mult', icon: '💎' },
  { id: 'volume', label: 'Volume', icon: '📊' },
] as const;

const PERIODS = [
  { id: 'daily', label: '24h' },
  { id: 'weekly', label: '7d' },
  { id: 'all', label: 'All' },
] as const;

const RANK_META: Record<number, { medal: string; color: string; glow: string; bg: string; height: number }> = {
  1: { medal: '🥇', color: '#ffd700', glow: 'rgba(255, 215, 0, 0.35)', bg: 'rgba(255, 215, 0, 0.08)', height: 100 },
  2: { medal: '🥈', color: '#c0c0c0', glow: 'rgba(192, 192, 192, 0.25)', bg: 'rgba(192, 192, 192, 0.06)', height: 74 },
  3: { medal: '🥉', color: '#cd7f32', glow: 'rgba(205, 127, 50, 0.25)', bg: 'rgba(205, 127, 50, 0.06)', height: 56 },
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function LeaderboardScreen() {
  const profile = useGameStore((s) => s.profile);
  const isMobile = useIsMobile();
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

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const hasTop3 = top3.length >= 3 && !loading;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header} className="card-enter">
        <h1 style={styles.title}>Rankings</h1>
      </div>

      {/* Tab bar */}
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
            <span>{tab.icon}</span>
            {(!isMobile || activeTab === tab.id) && <span>{tab.label}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={styles.periodWrap}>
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
      </div>

      {/* Top 3 Podium */}
      {hasTop3 && (
        <div style={styles.podium} className="card-enter card-enter-2">
          {/* Order: 2nd, 1st, 3rd for visual podium layout */}
          {[top3[1], top3[0], top3[2]].map((entry, idx) => {
            const actualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
            const meta = RANK_META[actualRank];
            const isMe = entry.userId === profile.id;
            const avatarSize = actualRank === 1 ? 56 : 44;

            return (
              <div key={entry.userId} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '6px',
              }}>
                {/* Avatar + medal */}
                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${meta.color}30, ${meta.color}10)`,
                    border: `2px solid ${meta.color}`,
                    boxShadow: `0 0 16px ${meta.glow}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: actualRank === 1 ? '20px' : '16px',
                    fontWeight: 800,
                    color: meta.color,
                    fontFamily: "'Orbitron', sans-serif",
                  }}>
                    {getInitials(entry.username)}
                  </div>
                  <span style={{
                    position: 'absolute',
                    bottom: -6,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: actualRank === 1 ? '22px' : '18px',
                    lineHeight: 1,
                    filter: `drop-shadow(0 0 4px ${meta.glow})`,
                  }}>{meta.medal}</span>
                </div>

                {/* Name */}
                <span style={{
                  fontSize: actualRank === 1 ? '14px' : '13px',
                  fontWeight: 700,
                  color: isMe ? '#c084fc' : theme.text.primary,
                  maxWidth: isMobile ? '80px' : '110px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  marginTop: '4px',
                }}>
                  {entry.username || 'Anonymous'}
                  {isMe && <span style={{ color: '#c084fc', fontSize: '10px' }}> (you)</span>}
                </span>

                {/* Score */}
                <span style={{
                  fontSize: actualRank === 1 ? '15px' : '13px',
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: meta.color,
                  textShadow: `0 0 10px ${meta.glow}`,
                }}>
                  {formatScore(entry.score, activeTab)}
                </span>

                {/* Podium bar */}
                <div style={{
                  width: '100%',
                  height: meta.height,
                  borderRadius: '8px 8px 0 0',
                  background: `linear-gradient(180deg, ${meta.color}18, ${meta.color}08)`,
                  border: `1px solid ${meta.color}25`,
                  borderBottom: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingTop: '10px',
                }}>
                  <span style={{
                    fontSize: actualRank === 1 ? '28px' : '22px',
                    fontWeight: 800,
                    fontFamily: "'Orbitron', sans-serif",
                    color: `${meta.color}60`,
                  }}>
                    {actualRank}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div style={styles.panel} className="card-enter card-enter-3">
        <div style={styles.tableHeader}>
          <span style={{ ...styles.th, width: '44px' }}>#</span>
          <span style={{ ...styles.th, flex: 1 }}>Player</span>
          <span style={{ ...styles.th, width: '110px', textAlign: 'right' as const }}>Score</span>
        </div>
        <div style={styles.tableBody}>
          {loading ? (
            <>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={styles.row}>
                  <span style={{ ...styles.rankNum, width: '44px' }}>
                    <div style={{ width: 20, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
                  </span>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
                    <div style={{ width: 80 + i * 10, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
                  </span>
                  <span style={{ width: '110px' }}>
                    <div style={{ width: 60, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginLeft: 'auto' }} />
                  </span>
                </div>
              ))}
            </>
          ) : entries.length === 0 ? (
            <div style={styles.empty}>
              <span style={{ fontSize: '32px', marginBottom: '8px' }}>🏆</span>
              <span>No rankings yet. Play some rounds!</span>
            </div>
          ) : (
            (hasTop3 ? rest : entries).map((entry) => {
              const meta = RANK_META[entry.rank];
              const isMe = entry.userId === profile.id;
              const barWidth = entries.length > 0
                ? Math.max(8, (parseFloat(entry.score) / parseFloat(entries[0].score)) * 100)
                : 0;

              return (
                <div
                  key={entry.userId}
                  style={{
                    ...styles.row,
                    ...(isMe ? styles.rowMe : {}),
                  }}
                >
                  {/* Rank */}
                  <span style={{ ...styles.rankNum, width: '44px' }}>
                    {meta ? (
                      <span style={{ fontSize: '18px', filter: `drop-shadow(0 0 3px ${meta.glow})` }}>{meta.medal}</span>
                    ) : (
                      <span className="mono" style={{ color: theme.text.muted, fontSize: '13px' }}>
                        {entry.rank}
                      </span>
                    )}
                  </span>

                  {/* Player */}
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {/* Mini avatar */}
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: isMe
                        ? 'rgba(153, 69, 255, 0.15)'
                        : meta ? `${meta.color}12` : 'rgba(255, 255, 255, 0.04)',
                      border: isMe
                        ? '1.5px solid rgba(153, 69, 255, 0.4)'
                        : meta ? `1.5px solid ${meta.color}30` : '1.5px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      fontFamily: "'Orbitron', sans-serif",
                      color: isMe ? '#c084fc' : meta ? meta.color : theme.text.muted,
                      flexShrink: 0,
                    }}>
                      {getInitials(entry.username)}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: isMe ? '#c084fc' : theme.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {entry.username || 'Anonymous'}
                        {isMe && <span style={styles.meTag}>You</span>}
                      </span>
                      {/* Score bar */}
                      <div style={{
                        width: '100%',
                        height: '3px',
                        borderRadius: '2px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(100, barWidth)}%`,
                          height: '100%',
                          borderRadius: '2px',
                          background: isMe
                            ? 'rgba(153, 69, 255, 0.5)'
                            : meta ? `${meta.color}50` : 'rgba(153, 69, 255, 0.2)',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  </span>

                  {/* Score */}
                  <span style={{
                    width: '110px',
                    textAlign: 'right' as const,
                    fontSize: '14px',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: isMe ? '#c084fc' : meta ? meta.color : theme.text.primary,
                    textShadow: meta ? `0 0 8px ${meta.glow}` : 'none',
                  }}>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    fontFamily: "'Orbitron', sans-serif",
    color: theme.text.primary,
    margin: 0,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    textShadow: '0 0 20px rgba(153, 69, 255, 0.3)',
  },

  // Tabs
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
    padding: '4px',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: theme.text.muted,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    transition: 'all 0.15s',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tabActive: {
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
    boxShadow: '0 0 12px rgba(153, 69, 255, 0.25)',
  },
  periodWrap: {
    display: 'flex',
    gap: '2px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
    padding: '2px',
  },
  periodBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '5px',
    color: theme.text.muted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    transition: 'all 0.15s',
  },
  periodActive: {
    background: 'rgba(153, 69, 255, 0.2)',
    color: '#c084fc',
  },

  // Podium
  podium: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.15fr 1fr',
    gap: '6px',
    alignItems: 'flex-end',
    padding: '20px 8px 0',
  },

  // Table
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '14px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: 'rgba(32, 24, 48, 0.6)',
  },
  th: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tableBody: {
    flex: 1,
    overflow: 'auto',
  },
  row: {
    display: 'flex',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    alignItems: 'center',
    transition: 'background 0.15s',
  },
  rowMe: {
    background: 'rgba(153, 69, 255, 0.06)',
    borderLeft: '3px solid #9945FF',
  },
  rankNum: {
    fontSize: '14px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
  },
  meTag: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#c084fc',
    padding: '1px 5px',
    background: 'rgba(153, 69, 255, 0.15)',
    borderRadius: '4px',
    marginLeft: '6px',
    verticalAlign: 'middle',
  },
  empty: {
    padding: '48px 24px',
    textAlign: 'center',
    fontSize: '14px',
    color: theme.text.muted,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
};
