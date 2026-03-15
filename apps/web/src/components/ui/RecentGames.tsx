import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';

interface RecentGame {
  id: string;
  result: 'win' | 'loss' | 'pending';
  multiplier: number;
  amount: number;      // bet amount in lamports
  payout: number;      // payout in lamports
  time: string;        // createdAt ISO
}

interface RecentGamesProps {
  title?: string;
  fetchGames: () => Promise<RecentGame[]>;
  pollInterval?: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentGames({ title = 'Recent Games', fetchGames, pollInterval = 15000 }: RecentGamesProps) {
  const [games, setGames] = useState<RecentGame[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchGames();
        if (mounted) setGames(data);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, pollInterval);
    return () => { mounted = false; clearInterval(interval); };
  }, [fetchGames, pollInterval]);

  if (games.length === 0) return null;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>{title}</span>
        <span style={s.count}>{games.length} games</span>
      </div>
      <div style={s.list}>
        {games.map((g) => {
          const isWin = g.result === 'win';
          const profit = (g.payout - g.amount) / 1e9;
          return (
            <div key={g.id} style={s.row}>
              <div style={{ ...s.dot, background: isWin ? theme.success : theme.danger }} />
              <span style={{ ...s.result, color: isWin ? theme.success : theme.danger }}>
                {isWin ? 'WIN' : 'LOSS'}
              </span>
              <span style={s.mult} className="mono">{g.multiplier.toFixed(2)}x</span>
              <div style={s.amounts}>
                <span style={s.bet} className="mono">
                  <img src="/sol-coin.png" alt="SOL" style={s.solIcon} />
                  {(g.amount / 1e9).toFixed(4)}
                </span>
                <span style={{ ...s.profit, color: isWin ? theme.success : theme.danger }} className="mono">
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
  container: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  title: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  count: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  list: {
    maxHeight: '280px',
    overflowY: 'auto' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  result: {
    fontSize: '10px',
    fontWeight: 700,
    width: '32px',
    letterSpacing: '0.5px',
  },
  mult: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.primary,
    width: '50px',
  },
  amounts: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    flex: 1,
    alignItems: 'flex-end' as const,
  },
  bet: {
    fontSize: '11px',
    color: theme.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
  },
  profit: {
    fontSize: '11px',
    fontWeight: 600,
  },
  solIcon: {
    width: 12,
    height: 12,
  },
  time: {
    fontSize: '10px',
    color: theme.text.muted,
    width: '50px',
    textAlign: 'right' as const,
  },
};
