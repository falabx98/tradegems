import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';

export interface RecentGame {
  id: string;
  result: 'win' | 'loss' | 'pending';
  multiplier: number;
  amount: number;
  payout: number;
  time: string;
}

export interface RecentGamesProps {
  title?: string;
  fetchGames: () => Promise<RecentGame[]>;
  pollInterval?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function RecentGames({ title = 'Recent Games', fetchGames, pollInterval = 15000 }: RecentGamesProps) {
  const [games, setGames] = useState<RecentGame[]>([]);

  useEffect(() => {
    const load = () => fetchGames().then(setGames).catch(() => {});
    load();
    const interval = setInterval(load, pollInterval);
    return () => clearInterval(interval);
  }, [fetchGames, pollInterval]);

  if (games.length === 0) return null;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.title}>{title}</span>
        <span style={s.count}>{games.length}</span>
      </div>
      <div style={s.list}>
        {games.map((g) => {
          const isWin = g.result === 'win';
          const profit = (g.payout - g.amount) / 1e9;
          return (
            <div key={g.id} style={s.row}>
              <div style={{ ...s.dot, background: isWin ? theme.accent.neonGreen : theme.accent.red }} />
              <span style={{ ...s.result, color: isWin ? theme.accent.neonGreen : theme.accent.red }}>
                {isWin ? 'WIN' : 'LOSS'}
              </span>
              <span style={s.mult} className="mono">{Number(g.multiplier).toFixed(2)}x</span>
              <div style={s.amounts}>
                <span style={s.bet} className="mono">
                  <img src="/sol-coin.png" alt="SOL" style={s.solIcon} />
                  {(g.amount / 1e9).toFixed(4)}
                </span>
                <span style={{ ...s.profit, color: isWin ? theme.accent.neonGreen : theme.accent.red }} className="mono">
                  {isWin ? '+' : ''}{profit.toFixed(4)}
                </span>
              </div>
              <span style={s.time}>{timeAgo(g.time)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  count: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '280px',
    overflowY: 'auto',
    borderRadius: theme.radius.md,
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    transition: 'background 0.15s ease',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  result: {
    fontSize: '11px',
    fontWeight: 700,
    width: '32px',
    flexShrink: 0,
  },
  mult: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
    width: '52px',
    flexShrink: 0,
  },
  amounts: {
    display: 'flex',
    flex: 1,
    justifyContent: 'flex-end',
    gap: '12px',
    minWidth: 0,
  },
  bet: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  solIcon: {
    width: '12px',
    height: '12px',
  },
  profit: {
    fontSize: '12px',
    fontWeight: 600,
    width: '72px',
    textAlign: 'right' as const,
  },
  time: {
    fontSize: '11px',
    color: theme.text.muted,
    width: '28px',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
};
