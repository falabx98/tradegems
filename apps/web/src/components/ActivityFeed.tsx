import { useEffect, useState, useRef } from 'react';
import { api } from '../utils/api';
import { theme } from '../styles/theme';

interface ActivityItem {
  id: number;
  feedType: string;
  userId: string;
  payload: {
    username: string;
    level: number;
    vipTier?: string;
    betAmount: number;
    payout: number;
    multiplier: number;
    riskTier?: string;
    resultType?: string;
    result?: string;
    direction?: string;
  };
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function formatSolAmount(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(lamports >= 100_000_000 ? 2 : 3);
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = async (after?: string) => {
    try {
      const res = await api.getActivityFeed(15, after);
      const newItems = (res.data || []) as ActivityItem[];
      if (newItems.length > 0) {
        if (after) {
          // Append new items to the front, deduplicate by id
          setItems(prev => {
            const merged = [...newItems, ...prev];
            const seen = new Set<number>();
            const deduped = merged.filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });
            return deduped.slice(0, 15);
          });
        } else {
          setItems(newItems.slice(0, 15));
        }
        lastIdRef.current = String(newItems[0].id);
      }
    } catch {
      // Silently fail — keep existing items
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchFeed();

    // Poll every 5 seconds
    intervalRef.current = setInterval(() => {
      fetchFeed(lastIdRef.current);
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Recent Plays</span>
        {items.length > 0 && <span style={styles.liveBadge}>LIVE</span>}
      </div>
      <div style={styles.feedList}>
        {items.length === 0 ? (
          <div style={styles.emptyState}>
            No recent activity
          </div>
        ) : (
          items.map(item => {
            const isWin = item.payload.payout > item.payload.betAmount;
            const multiplier = item.payload.multiplier;
            const profit = item.payload.payout - item.payload.betAmount;
            const feedType = item.feedType === 'prediction_result' ? 'PRED' : 'SOLO';
            const badgeColor = feedType === 'PRED' ? theme.accent.purple : theme.accent.blue;

            return (
              <div key={item.id} style={styles.feedRow}>
                <span style={{
                  ...styles.typeBadge,
                  background: `${badgeColor}20`,
                  color: badgeColor,
                }}>
                  {feedType}
                </span>
                <span style={styles.feedUser}>{item.payload.username}</span>
                <span
                  style={{
                    ...styles.feedMult,
                    color: isWin ? theme.game.multiplier : theme.game.divider,
                  }}
                  className="mono"
                >
                  {multiplier.toFixed(2)}x
                </span>
                <span
                  style={{
                    ...styles.feedAmount,
                    color: isWin ? theme.game.multiplier : theme.game.divider,
                  }}
                  className="mono"
                >
                  {isWin ? '+' : ''}{formatSolAmount(profit)} SOL
                </span>
                <span style={styles.feedTime}>{timeAgo(item.createdAt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
    flex: 1,
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
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    flex: 1,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  liveBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.success,
    padding: '2px 6px',
    background: `${theme.success}15`,
    borderRadius: '4px',
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '340px',
    overflowY: 'auto',
  },
  emptyState: {
    padding: '24px 16px',
    textAlign: 'center' as const,
    color: theme.text.muted,
    fontSize: '13px',
  },
  feedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    flexShrink: 0,
    fontFamily: "'Orbitron', sans-serif",
  },
  feedUser: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.secondary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  feedMult: {
    fontSize: '14px',
    fontWeight: 700,
    minWidth: '50px',
    textAlign: 'right',
  },
  feedAmount: {
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '80px',
    textAlign: 'right',
  },
  feedTime: {
    fontSize: '12px',
    color: theme.text.muted,
    minWidth: '28px',
    textAlign: 'right',
  },
};
