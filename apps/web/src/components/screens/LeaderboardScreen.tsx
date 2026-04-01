import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MoneyIcon, GemIcon, ChartBarIcon, MedalIcon, TrophyIcon } from '../ui/GameIcons';
import { setProfileTarget } from './PlayerProfileScreen';
import { isPhotoAvatar, getAvatarGradient, getInitials as getAvatarInitials } from '../../utils/avatars';
import { PageHeader } from '../ui/PageHeader';
import { TabBar } from '../ui/TabBar';
import { ContentNarrow } from '../primitives/ContentContainer';
import { SolIcon } from '../ui/SolIcon';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  score: string;
  roundsPlayed?: number;
}

const TABS = [
  { id: 'profit', label: 'Top Profit', icon: <MoneyIcon size={16} /> },
  { id: 'multiplier', label: 'Best Mult', icon: <GemIcon size={16} /> },
  { id: 'volume', label: 'Volume', icon: <ChartBarIcon size={16} /> },
] as const;

const PERIODS = [
  { id: 'daily', label: '24h' },
  { id: 'weekly', label: '7d' },
  { id: 'all', label: 'All' },
] as const;

const RANK_META: Record<number, { rank: 1 | 2 | 3; color: string; glow: string; bg: string; height: number }> = {
  1: { rank: 1, color: '#ffd700', glow: 'rgba(255, 215, 0, 0.35)', bg: 'rgba(255, 215, 0, 0.08)', height: 100 },
  2: { rank: 2, color: '#c0c0c0', glow: 'rgba(192, 192, 192, 0.25)', bg: 'rgba(192, 192, 192, 0.06)', height: 74 },
  3: { rank: 3, color: '#cd7f32', glow: 'rgba(205, 127, 50, 0.25)', bg: 'rgba(205, 127, 50, 0.06)', height: 56 },
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function LeaderboardScreen() {
  const profile = useGameStore((s) => s.profile);
  const go = useAppNavigate();
  const isMobile = useIsMobile();

  function viewProfile(userId: string) {
    setProfileTarget(userId);
    go('profile');
  }
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

  function formatScore(score: string, tab: string): React.ReactNode {
    const val = parseFloat(score || '0');
    if (tab === 'multiplier') return `${val.toFixed(2)}x`;
    if (tab === 'volume') return `${Math.round(val)} rounds`;
    return <>{formatSol(val)} <SolIcon size="0.9em" /></>;
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const hasTop3 = top3.length >= 3 && !loading;

  return (
    <div style={styles.container}>
      <PageHeader title="Leaderboard" subtitle="Top players ranked by profit, multiplier, and volume" icon={<TrophyIcon size={20} color={theme.accent.purple} />} />

      {/* Category tabs */}
      <TabBar
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        active={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      {/* Period selector */}
      <div style={styles.periodWrap} className="card-enter card-enter-1">
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
                cursor: 'pointer',
              }} onClick={() => viewProfile(entry.userId)}>
                {/* Avatar + medal */}
                <div style={{ position: 'relative' }}>
                  {isPhotoAvatar(entry.avatarUrl) ? (
                    <img src={entry.avatarUrl!} alt={entry.username} style={{
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: '50%',
                      objectFit: 'cover' as const,
                      border: `2px solid ${meta.color}`,
                      boxShadow: `0 0 16px ${meta.glow}`,
                    }} />
                  ) : (
                    <div style={{
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: '50%',
                      background: getAvatarGradient(null, entry.username),
                      border: `2px solid ${meta.color}`,
                      boxShadow: `0 0 16px ${meta.glow}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: actualRank === 1 ? '20px' : '16px',
                      fontWeight: 700,
                      color: '#fff',
                      fontFamily: "inherit",
                    }}>
                      {getAvatarInitials(entry.username)}
                    </div>
                  )}
                  <span style={{
                    position: 'absolute',
                    bottom: -6,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: actualRank === 1 ? '22px' : '18px',
                    lineHeight: 1,
                    filter: `drop-shadow(0 0 4px ${meta.glow})`,
                  }}><MedalIcon rank={meta.rank} size={22} /></span>
                </div>

                {/* Name */}
                <span style={{
                  fontSize: actualRank === 1 ? '14px' : '13px',
                  fontWeight: 700,
                  color: isMe ? '#3b82f6' : theme.text.primary,
                  maxWidth: isMobile ? '80px' : '110px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  marginTop: '4px',
                }}>
                  {entry.username || 'Anonymous'}
                  {isMe && <span style={{ color: '#3b82f6', fontSize: '10px' }}> (you)</span>}
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
                    fontWeight: 700,
                    fontFamily: "inherit",
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
              <TrophyIcon size={44} color="#8b5cf6" />
              <span style={styles.emptyTitle}>No Rankings Yet</span>
              <span style={styles.emptyDesc}>Play rounds to climb the leaderboard and earn your spot!</span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {['profit', 'multiplier', 'volume'].map((t) => (
                  <div key={t} style={{
                    padding: '8px 14px', borderRadius: '8px',
                    background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
                    fontSize: '11px', color: theme.text.muted, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#8b5cf6' }}>
                      {t === 'profit' ? '—' : t === 'multiplier' ? '—' : '—'}
                    </div>
                    <div style={{ marginTop: '2px', textTransform: 'capitalize' }}>{t}</div>
                  </div>
                ))}
              </div>
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
                  onClick={() => viewProfile(entry.userId)}
                  style={{
                    ...styles.row,
                    ...(isMe ? styles.rowMe : {}),
                    cursor: 'pointer',
                  }}
                >
                  {/* Rank */}
                  <span style={{ ...styles.rankNum, width: '44px' }}>
                    {meta ? (
                      <span style={{ fontSize: '18px', filter: `drop-shadow(0 0 3px ${meta.glow})` }}><MedalIcon rank={meta.rank} size={22} /></span>
                    ) : (
                      <span className="mono" style={{ color: theme.text.muted, fontSize: '13px' }}>
                        {entry.rank}
                      </span>
                    )}
                  </span>

                  {/* Player */}
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {/* Mini avatar */}
                    {isPhotoAvatar(entry.avatarUrl) ? (
                      <img src={entry.avatarUrl!} alt={entry.username} style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        objectFit: 'cover' as const,
                        border: isMe
                          ? '1.5px solid rgba(139, 92, 246, 0.4)'
                          : meta ? `1.5px solid ${meta.color}30` : '1.5px solid rgba(255, 255, 255, 0.08)',
                        flexShrink: 0,
                      }} />
                    ) : (
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: isMe
                          ? 'rgba(139, 92, 246, 0.15)'
                          : getAvatarGradient(null, entry.username),
                        border: isMe
                          ? '1.5px solid rgba(139, 92, 246, 0.4)'
                          : meta ? `1.5px solid ${meta.color}30` : '1.5px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: "inherit",
                        color: isMe ? '#3b82f6' : meta ? meta.color : '#fff',
                        flexShrink: 0,
                      }}>
                        {getAvatarInitials(entry.username)}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: isMe ? '#3b82f6' : theme.text.primary,
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
                            ? 'rgba(139, 92, 246, 0.5)'
                            : meta ? `${meta.color}50` : 'rgba(139, 92, 246, 0.2)',
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
                    color: isMe ? '#3b82f6' : meta ? meta.color : theme.text.primary,
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
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  // Period selector
  periodWrap: {
    display: 'flex',
    gap: '4px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    padding: '3px',
    alignSelf: 'flex-start',
  },
  periodBtn: {
    padding: '5px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: theme.radius.sm,
    color: theme.text.muted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "inherit",
    transition: 'all 0.15s',
  },
  periodActive: {
    background: theme.gradient.primary,
    color: '#fff',
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
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
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
    background: 'rgba(139, 92, 246, 0.06)',
    borderLeft: '3px solid #8b5cf6',
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
    color: '#3b82f6',
    padding: '1px 5px',
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: '4px',
    marginLeft: '6px',
    verticalAlign: 'middle',
  },
  empty: {
    padding: '60px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.secondary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '4px',
  },
  emptyDesc: {
    fontSize: '14px',
    color: theme.text.muted,
    maxWidth: '260px',
    lineHeight: 1.4,
  },
};
