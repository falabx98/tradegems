import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { SolIcon } from './SolIcon';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { Icon } from '../primitives/Icon';

type Tab = 'latest' | 'mine' | 'highrollers' | 'race';

const TABS: { id: Tab; label: string }[] = [
  { id: 'latest', label: 'Latest Bets' },
  { id: 'mine', label: 'My Bets' },
  { id: 'highrollers', label: 'High Rollers' },
  { id: 'race', label: 'Weekly Race' },
];

const FEED_TYPE_TO_GAME: Record<string, string> = {
  prediction_result: 'Predictions',
  solo_result: 'Solo',
  rug_result: 'Rug Game',
  candleflip_result: 'Candleflip',
  mines_result: 'Mines',
  trading_sim_result: 'Trading Arena',
};

const GAME_COLORS: Record<string, string> = {
  'Rug Game': '#F59E0B',
  Predictions: '#3B82F6',
  Solo: '#8B5CF6',
  Candleflip: '#06B6D4',
  Mines: '#10B981',
  'Trading Arena': '#0D9488',
};

interface Bet {
  id: string;
  username: string;
  game: string;
  betAmount: number;
  payout: number;
  multiplier: number;
  isWin: boolean;
  createdAt?: string;
}

// ─── Live Activity Indicator ────────────────────────────────

function LiveIndicator() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: theme.radius.full,
      background: 'rgba(0, 230, 118, 0.08)',
      border: '1px solid rgba(0, 230, 118, 0.15)',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: theme.accent.green,
        boxShadow: `0 0 6px ${theme.accent.green}`,
        animation: 'pulse 1.5s ease infinite',
      }} />
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: theme.accent.green,
        letterSpacing: '0.02em',
      }}>
        Live
      </span>
    </div>
  );
}

// ─── Bet Row ─────────────────────────────────────────────────

function BetRow({ bet, showUser, isMobile, isEven }: { bet: Bet; showUser: boolean; isMobile: boolean; isEven: boolean }) {
  const gc = GAME_COLORS[bet.game] || theme.text.muted;
  const profit = bet.payout - bet.betAmount;

  if (isMobile) {
    // Mobile: Game + Multiplier + Payout
    return (
      <div style={{
        ...row,
        background: isEven ? theme.bg.base : theme.bg.surface,
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isEven ? theme.bg.base : theme.bg.surface; }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: gc,
          padding: '2px 6px',
          borderRadius: 4,
          background: `${gc}12`,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {bet.game}
        </span>
        <span className="mono" style={{
          fontSize: 13,
          fontWeight: 700,
          color: bet.multiplier >= 1 ? theme.accent.green : theme.accent.red,
          flex: 1,
          textAlign: 'right',
        }}>
          {bet.multiplier.toFixed(2)}x
        </span>
        <span className="mono" style={{
          fontSize: 13,
          fontWeight: 700,
          color: profit >= 0 ? theme.accent.green : theme.accent.red,
          textAlign: 'right',
          minWidth: 70,
          flexShrink: 0,
        }}>
          {profit >= 0 ? '+' : ''}{formatSol(profit)} <SolIcon size="0.8em" />
        </span>
      </div>
    );
  }

  return (
    <div style={{
      ...row,
      background: isEven ? theme.bg.base : theme.bg.surface,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isEven ? theme.bg.base : theme.bg.surface; }}
    >
      {/* Game */}
      <div style={{ ...cell, flex: '1 1 0' }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: gc,
          padding: '2px 6px',
          borderRadius: 4,
          background: `${gc}12`,
        }}>
          {bet.game}
        </span>
      </div>
      {/* Player */}
      {showUser && (
        <div style={{ ...cell, flex: '1.2 1 0' }}>
          <div style={{ ...avatarStyle, background: getAvatarGradient(null, bet.username) }}>
            {getInitials(bet.username)}
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.text.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {bet.username}
          </span>
        </div>
      )}
      {/* Bet Amount */}
      <div style={{ ...cell, flex: '1 1 0', justifyContent: 'flex-end' }}>
        <span className="mono" style={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.text.secondary,
        }}>
          {formatSol(bet.betAmount)} <SolIcon size="0.8em" />
        </span>
      </div>
      {/* Multiplier */}
      <div style={{ ...cell, flex: '0.8 1 0', justifyContent: 'flex-end' }}>
        <span className="mono" style={{
          fontSize: 13,
          fontWeight: 700,
          color: bet.multiplier >= 1 ? theme.accent.green : theme.accent.red,
        }}>
          {bet.multiplier.toFixed(2)}x
        </span>
      </div>
      {/* Payout */}
      <div style={{ ...cell, flex: '1 1 0', justifyContent: 'flex-end' }}>
        <span className="mono" style={{
          fontSize: 13,
          fontWeight: 700,
          color: profit >= 0 ? theme.accent.green : theme.accent.red,
        }}>
          {profit >= 0 ? '+' : ''}{formatSol(profit)} <SolIcon size="0.8em" />
        </span>
      </div>
    </div>
  );
}

// ─── Table Header ────────────────────────────────────────────

function TableHeader({ showUser, isMobile }: { showUser: boolean; isMobile: boolean }) {
  if (isMobile) {
    return (
      <div style={headerRow}>
        <span style={{ ...headerCell, flex: 1 }}>Game</span>
        <span style={{ ...headerCell, flex: 1, textAlign: 'right' }}>Multi</span>
        <span style={{ ...headerCell, textAlign: 'right', minWidth: 70 }}>Payout</span>
      </div>
    );
  }
  return (
    <div style={headerRow}>
      <span style={{ ...headerCell, flex: '1 1 0' }}>Game</span>
      {showUser && <span style={{ ...headerCell, flex: '1.2 1 0' }}>Player</span>}
      <span style={{ ...headerCell, flex: '1 1 0', textAlign: 'right' }}>Bet</span>
      <span style={{ ...headerCell, flex: '0.8 1 0', textAlign: 'right' }}>Multiplier</span>
      <span style={{ ...headerCell, flex: '1 1 0', textAlign: 'right' }}>Payout</span>
    </div>
  );
}

// ─── Weekly Race Tab ────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0d 0h 0m 0s';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${d}d ${h}h ${m}m ${s}s`;
}

const RANK_COLORS = ['', '#FFD700', '#C0C0C0', '#CD7F32'];

function WeeklyRaceTab({ isMobile }: { isMobile: boolean }) {
  const { isAuthenticated } = useAuthStore();
  const [raceData, setRaceData] = useState<any>(null);
  const [myRank, setMyRank] = useState<any>(null);
  const [countdown, setCountdown] = useState('');
  const endTimeRef = useRef<number>(0);

  useEffect(() => {
    api.getWeeklyRace(50).then((res: any) => {
      const data = res.data;
      if (data) {
        setRaceData(data);
        endTimeRef.current = Date.now() + (data.timeRemainingMs || 0);
      }
    }).catch(() => {});

    if (isAuthenticated) {
      api.getWeeklyRaceMyRank().then((res: any) => setMyRank(res.data)).catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!endTimeRef.current) return;
    const tick = () => {
      const remaining = Math.max(0, endTimeRef.current - Date.now());
      setCountdown(formatCountdown(remaining));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [raceData]);

  if (!raceData) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: theme.text.muted }}>
        Next race starts Monday
      </div>
    );
  }

  const { prizePool, leaderboard } = raceData;

  return (
    <div style={{ padding: '0 0' }}>
      {/* Banner */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between',
        padding: isMobile ? '12px 16px' : '14px 16px', margin: '0',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.08) 100%)',
        borderBottom: `1px solid ${theme.border.subtle}`,
        flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="trophy" size={20} style={{ color: '#fbbf24' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Weekly Race</div>
            <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 1 }}>Compete for prizes by wagering volume</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 16 : 24, alignItems: 'center' }}>
          <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
            <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Prize Pool</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: theme.accent.green, marginTop: 2 }}>
              <SolIcon size="0.8em" /> {formatSol(prizePool)}
            </div>
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
            <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Time Left</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {countdown}
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard Header */}
      <div style={{ ...headerRow, padding: '8px 16px' }}>
        <span style={{ ...headerCell, width: 40, flexShrink: 0, textAlign: 'center' }}>#</span>
        <span style={{ ...headerCell, flex: 1 }}>User</span>
        {!isMobile && <span style={{ ...headerCell, flex: 1, textAlign: 'right' }}>Wagered</span>}
        <span style={{ ...headerCell, flex: isMobile ? undefined : 1, textAlign: 'right', minWidth: isMobile ? 70 : undefined }}>Prize</span>
      </div>

      {/* Leaderboard Rows */}
      {leaderboard.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: theme.text.muted }}>No participants yet this week</div>
      ) : (
        leaderboard.slice(0, 20).map((entry: any, i: number) => {
          const isMe = isAuthenticated && myRank?.rank === entry.rank && myRank?.wagered === entry.wagered;
          const rankColor = entry.rank <= 3 ? RANK_COLORS[entry.rank] : theme.text.muted;
          const prize = entry.prize || 0;

          return (
            <div key={entry.userId} style={{
              ...row,
              padding: '8px 16px',
              background: isMe ? 'rgba(139,92,246,0.08)' : i % 2 === 0 ? theme.bg.base : theme.bg.surface,
              borderLeft: isMe ? `3px solid ${theme.accent.primary}` : '3px solid transparent',
            }}>
              <span style={{
                width: 40, flexShrink: 0, fontSize: entry.rank <= 3 ? 14 : 12,
                fontWeight: 800, color: rankColor, textAlign: 'center',
              }}>
                {entry.rank <= 3 ? entry.rank : entry.rank}
              </span>
              <div style={{ ...cell, flex: 1 }}>
                <div style={{ ...avatarStyle, background: getAvatarGradient(entry.avatarUrl, entry.username) }}>
                  {getInitials(entry.username)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? '#fff' : theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.username}{isMe ? ' (You)' : ''}
                </span>
              </div>
              {!isMobile && (
                <div style={{ ...cell, flex: 1, justifyContent: 'flex-end' }}>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary }}>
                    {formatSol(entry.wagered)} <SolIcon size="0.8em" />
                  </span>
                </div>
              )}
              <div style={{ ...cell, flex: isMobile ? undefined : 1, justifyContent: 'flex-end', minWidth: isMobile ? 70 : undefined }}>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: prize > 0 ? theme.accent.green : theme.text.muted }}>
                  {prize > 0 ? <>{formatSol(prize)} <SolIcon size="0.8em" /></> : '—'}
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* My rank indicator (if not in top 20) */}
      {isAuthenticated && myRank?.rank && myRank.rank > 20 && (
        <div style={{
          padding: '10px 16px', margin: '0', borderTop: `1px solid ${theme.border.subtle}`,
          background: 'rgba(139,92,246,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: theme.text.muted }}>
            Your rank: <span style={{ fontWeight: 700, color: '#fff' }}>#{myRank.rank}</span>
          </span>
          <span className="mono" style={{ fontSize: 12, color: theme.text.secondary }}>
            Wagered: {formatSol(myRank.wagered)} <SolIcon size="0.8em" />
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────

export function BetsPanel({ publicBets }: { publicBets: Bet[] }) {
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuthStore();
  const [tab, setTab] = useState<Tab>('latest');
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [rowCount, setRowCount] = useState(10);

  useEffect(() => {
    if (tab === 'mine' && isAuthenticated) {
      api.getMyBets(30).then((res: any) => {
        const items = res.data || [];
        setMyBets(items.map((i: any) => ({
          id: i.id,
          username: 'You',
          game: FEED_TYPE_TO_GAME[i.feedType] || i.payload?.game || 'Game',
          betAmount: i.payload?.betAmount || 0,
          payout: i.payload?.payout || 0,
          multiplier: Number(i.payload?.multiplier) || 0,
          isWin: (i.payload?.payout || 0) > (i.payload?.betAmount || 0),
          createdAt: i.createdAt,
        })));
      }).catch(() => {});
    }
  }, [tab, isAuthenticated]);

  const highRollers = [...publicBets].sort((a, b) => b.betAmount - a.betAmount);
  const displayBets = tab === 'latest' ? publicBets : tab === 'mine' ? myBets : highRollers;
  const visibleBets = displayBets.slice(0, rowCount);
  const showBetsTable = tab !== 'race';
  const hasLiveActivity = tab === 'latest' && publicBets.length > 0;

  return (
    <div style={{
      background: theme.bg.surface,
      borderRadius: '12px',
      border: `1px solid ${theme.border.subtle}`,
      overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        background: theme.bg.elevated,
        borderBottom: `1px solid ${theme.border.subtle}`,
        overflowX: 'auto',
        scrollbarWidth: 'none' as any,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {TABS.map(t => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: theme.radius.md,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  background: isActive ? theme.bg.surface : 'transparent',
                  color: isActive ? '#fff' : theme.text.muted,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.id === 'race' && <Icon name="trophy" size={14} style={{ color: '#fbbf24', marginRight: 4, verticalAlign: 'middle' }} />}{t.label}
              </button>
            );
          })}
          {/* Live indicator */}
          {hasLiveActivity && <LiveIndicator />}
        </div>
        {showBetsTable && (
          <select
            value={rowCount}
            onChange={e => setRowCount(Number(e.target.value))}
            style={{
              background: theme.bg.base,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 13,
              color: theme.text.secondary,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        )}
      </div>

      {/* Content */}
      {tab === 'race' ? (
        <WeeklyRaceTab isMobile={isMobile} />
      ) : tab === 'mine' && !isAuthenticated ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: theme.text.muted }}>Log in to see your bets</div>
      ) : visibleBets.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <Icon name="dice" size={24} style={{ color: theme.text.disabled, marginBottom: 6, opacity: 0.6 }} />
          <div style={{ fontSize: 13, color: theme.text.muted }}>No bets yet</div>
        </div>
      ) : (
        <div>
          <TableHeader showUser={tab !== 'mine'} isMobile={isMobile} />
          {visibleBets.map((bet, i) => (
            <BetRow key={`${bet.id}-${i}`} bet={bet} showUser={tab !== 'mine'} isMobile={isMobile} isEven={i % 2 === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  minHeight: 44,
  transition: 'background 0.1s ease',
  cursor: 'default',
};

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  background: theme.bg.elevated,
  borderBottom: `1px solid ${theme.border.subtle}`,
  minHeight: 36,
};

const cell: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const headerCell: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: theme.text.muted,
  letterSpacing: '0.02em',
};

const avatarStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 8,
  fontWeight: 700,
  color: '#fff',
};
