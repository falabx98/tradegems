import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { SolIcon } from './SolIcon';
import { getAvatarGradient, getInitials } from '../../utils/avatars';

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
  lottery_result: 'Lottery',
  trading_sim_result: 'Trading Arena',
};

const GAME_COLORS: Record<string, string> = {
  'Rug Game': '#F59E0B',
  Predictions: '#3B82F6',
  Solo: '#8B5CF6',
  Candleflip: '#06B6D4',
  Mines: '#10B981',
  Lottery: '#EAB308',
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

// ─── Bet Row ─────────────────────────────────────────────────

function BetRow({ bet, showUser, isMobile }: { bet: Bet; showUser: boolean; isMobile: boolean }) {
  const gc = GAME_COLORS[bet.game] || theme.text.muted;
  const profit = bet.payout - bet.betAmount;

  if (isMobile) {
    return (
      <div style={row}>
        {showUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={{ ...avatar, background: getAvatarGradient(null, bet.username) }}>{getInitials(bet.username)}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bet.username}</span>
          </div>
        )}
        <span style={{ fontSize: 10, fontWeight: 600, color: gc, padding: '1px 5px', borderRadius: 4, background: `${gc}12`, whiteSpace: 'nowrap', flexShrink: 0 }}>{bet.game}</span>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: bet.isWin ? theme.accent.neonGreen : theme.accent.red, flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
          {bet.isWin ? '+' : '-'}{formatSol(Math.abs(profit))} <SolIcon size="0.8em" />
        </span>
      </div>
    );
  }

  return (
    <div style={row}>
      {showUser && (
        <div style={{ ...cell, flex: '1.5 1 0' }}>
          <div style={{ ...avatar, background: getAvatarGradient(null, bet.username) }}>{getInitials(bet.username)}</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bet.username}</span>
        </div>
      )}
      <div style={{ ...cell, flex: '1 1 0' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: gc, padding: '2px 6px', borderRadius: 4, background: `${gc}12` }}>{bet.game}</span>
      </div>
      <div style={{ ...cell, flex: '1 1 0', justifyContent: 'flex-end' }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary }}>{formatSol(bet.betAmount)} <SolIcon size="0.8em" /></span>
      </div>
      <div style={{ ...cell, flex: '0.8 1 0', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, marginRight: 4 }}>{bet.isWin ? '✓' : '✗'}</span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: bet.isWin ? theme.accent.neonGreen : theme.text.muted }}>{bet.multiplier.toFixed(2)}x</span>
      </div>
      <div style={{ ...cell, flex: '1 1 0', justifyContent: 'flex-end' }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: profit >= 0 ? theme.accent.neonGreen : theme.accent.red }}>
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
      <div style={{ ...row, borderBottom: `1px solid ${theme.border.subtle}`, minHeight: 32 }}>
        {showUser && <span style={{ ...headerCell, flex: 1 }}>User</span>}
        <span style={headerCell}>Game</span>
        <span style={{ ...headerCell, textAlign: 'right', minWidth: 60 }}>Payout</span>
      </div>
    );
  }
  return (
    <div style={{ ...row, borderBottom: `1px solid ${theme.border.subtle}`, minHeight: 32 }}>
      {showUser && <span style={{ ...headerCell, flex: '1.5 1 0' }}>User</span>}
      <span style={{ ...headerCell, flex: '1 1 0' }}>Game</span>
      <span style={{ ...headerCell, flex: '1 1 0', textAlign: 'right' }}>Bet Amount</span>
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

const RANK_MEDALS = ['', '1st', '2nd', '3rd'];
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

  // Countdown timer
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

  const { prizePool, leaderboard, prizeDistribution } = raceData;

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Banner */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between',
        padding: isMobile ? '10px 12px' : '12px 16px', margin: '8px 0',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.08) 100%)',
        borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)',
        flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Weekly Race</div>
            <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 1 }}>Compete for prizes by wagering volume</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 16 : 24, alignItems: 'center' }}>
          <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
            <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Prize Pool</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: theme.accent.neonGreen, marginTop: 2 }}>
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
      <div style={{ ...row, borderBottom: `1px solid ${theme.border.subtle}`, minHeight: 32 }}>
        <span style={{ ...headerCell, width: 40, flexShrink: 0, textAlign: 'center' }}>#</span>
        <span style={{ ...headerCell, flex: 1 }}>User</span>
        {!isMobile && <span style={{ ...headerCell, flex: 1, textAlign: 'right' }}>Wagered</span>}
        <span style={{ ...headerCell, flex: isMobile ? undefined : 1, textAlign: 'right', minWidth: isMobile ? 70 : undefined }}>Prize</span>
      </div>

      {/* Leaderboard Rows */}
      {leaderboard.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: theme.text.muted }}>No participants yet this week</div>
      ) : (
        leaderboard.slice(0, 20).map((entry: any) => {
          const isMe = isAuthenticated && myRank?.rank === entry.rank && myRank?.wagered === entry.wagered;
          const rankColor = entry.rank <= 3 ? RANK_COLORS[entry.rank] : theme.text.muted;
          const prize = entry.prize || 0;

          return (
            <div key={entry.userId} style={{
              ...row,
              background: isMe ? 'rgba(139,92,246,0.08)' : undefined,
              borderLeft: isMe ? '2px solid rgba(139,92,246,0.5)' : '2px solid transparent',
            }}>
              <span style={{
                width: 40, flexShrink: 0, fontSize: entry.rank <= 3 ? 14 : 12,
                fontWeight: 800, color: rankColor, textAlign: 'center',
              }}>
                {entry.rank <= 3 ? ['', '🥇', '🥈', '🥉'][entry.rank] : entry.rank}
              </span>
              <div style={{ ...cell, flex: 1 }}>
                <div style={{ ...avatar, background: getAvatarGradient(entry.avatarUrl, entry.username) }}>
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
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: prize > 0 ? theme.accent.neonGreen : theme.text.muted }}>
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
          padding: '10px 12px', margin: '4px 0 8px', borderRadius: 8,
          background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
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

  return (
    <div style={{ background: theme.bg.secondary, borderRadius: 16, border: `1px solid ${theme.border.subtle}`, overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${theme.border.subtle}`, overflowX: 'auto', scrollbarWidth: 'none' as any }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: tab === t.id ? '#fff' : theme.text.muted,
                transition: 'all 0.15s ease',
              }}
            >
              {t.id === 'race' ? '🏆 ' : ''}{t.label}
            </button>
          ))}
        </div>
        {showBetsTable && (
          <select
            value={rowCount}
            onChange={e => setRowCount(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${theme.border.subtle}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: theme.text.muted, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '4px 0' }}>
        {tab === 'race' ? (
          <WeeklyRaceTab isMobile={isMobile} />
        ) : tab === 'mine' && !isAuthenticated ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: theme.text.muted }}>Log in to see your bets</div>
        ) : visibleBets.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: theme.text.muted }}>No bets yet</div>
        ) : (
          <div style={{ padding: '0 12px' }}>
            <TableHeader showUser={tab !== 'mine'} isMobile={isMobile} />
            {visibleBets.map((bet, i) => (
              <BetRow key={`${bet.id}-${i}`} bet={bet} showUser={tab !== 'mine'} isMobile={isMobile} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 4px',
  minHeight: 44,
  borderBottom: '1px solid rgba(255,255,255,0.03)',
};

const cell: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const headerCell: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: theme.text.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const avatar: CSSProperties = {
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
