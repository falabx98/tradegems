import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { ChartBarIcon } from '../ui/GameIcons';
import { PageHeader } from '../ui/PageHeader';

interface HistoryEntry {
  id: number;
  roundId: string;
  finalMultiplier: string;
  payoutAmount: number;
  resultType: string;
  nodesHit: number;
  nodesMissed: number;
  xpAwarded: number;
  createdAt: string;
}

export function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await api.getRoundHistory(50) as any;
      setEntries(res.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <PageHeader
        title="History"
        subtitle="Your round-by-round game history"
        icon={<ChartBarIcon size={20} color={theme.accent.purple} />}
        action={
          <span className="mono" style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.accent.purple,
            background: theme.bg.elevated,
            border: `1px solid ${theme.border.subtle}`,
            padding: '3px 12px',
            borderRadius: theme.radius.full,
          }}>
            {entries.length} rounds
          </span>
        }
      />
      <div style={styles.panel} className="card-enter card-enter-1">
        <div style={styles.panelHeader}>
          <span style={styles.panelTitle}>Rounds</span>
        </div>

        {/* Table Header */}
        <div style={styles.tableHeader}>
          <span style={{ ...styles.th, flex: 1 }}>Round</span>
          <span style={{ ...styles.th, width: '80px', textAlign: 'center' }}>Result</span>
          <span style={{ ...styles.th, width: '80px', textAlign: 'right' }}>Mult</span>
          <span style={{ ...styles.th, width: '80px', textAlign: 'right' }}>Payout</span>
          <span style={{ ...styles.th, width: '60px', textAlign: 'right' }}>Nodes</span>
          <span style={{ ...styles.th, width: '50px', textAlign: 'right' }}>XP</span>
          <span style={{ ...styles.th, width: '100px', textAlign: 'right' }}>Date</span>
        </div>

        <div style={styles.tableBody}>
          {loading ? (
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '12px', padding: '10px 0',
                  borderBottom: `1px solid ${theme.border.subtle}`,
                }}>
                  <div style={{ width: '60px', height: '14px', borderRadius: '4px', background: theme.bg.elevated, animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '50px', height: '14px', borderRadius: '4px', background: theme.bg.tertiary, animation: 'pulse 1.5s infinite', animationDelay: '0.2s' }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ width: '70px', height: '14px', borderRadius: '4px', background: theme.bg.tertiary, animation: 'pulse 1.5s infinite', animationDelay: '0.4s' }} />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div style={styles.empty}>
              <ChartBarIcon size={36} color="#555570" />
              <span style={{ fontSize: '16px', fontWeight: 700, color: theme.text.secondary }}>No Rounds Played Yet</span>
              <span style={{ fontSize: '13px', color: theme.text.muted, maxWidth: '280px', lineHeight: 1.5 }}>
                Your solo game results will appear here. Play a round to get started!
              </span>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {['Solo', 'Predictions'].map((t) => (
                  <span key={t} style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
                    color: theme.text.muted,
                  }}>{t}</span>
                ))}
              </div>
            </div>
          ) : (
            entries.map((r) => {
              const mult = parseFloat(r.finalMultiplier || '1');
              const payout = r.payoutAmount;
              const isWin = r.resultType === 'win';
              const resultColor = isWin ? theme.success : r.resultType === 'loss' ? theme.danger : theme.warning;
              const multColor = mult >= 1 ? theme.success : theme.danger;
              return (
                <div key={r.id} className="table-row-hover" style={styles.tableRow}>
                  <span style={{ ...styles.td, flex: 1 }} className="mono">
                    {r.roundId.slice(0, 8)}
                  </span>
                  <span style={{
                    ...styles.td, width: '80px', textAlign: 'center',
                  }}>
                    <span style={{
                      color: resultColor,
                      fontWeight: 700,
                      fontSize: '12px',
                      background: `${resultColor}15`,
                      border: `1px solid ${resultColor}30`,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      display: 'inline-block',
                      boxShadow: `0 0 8px ${resultColor}20`,
                    }}>
                      {r.resultType === 'win' ? 'WIN' : r.resultType === 'loss' ? 'LOSS' : r.resultType.toUpperCase()}
                    </span>
                  </span>
                  <span style={{
                    ...styles.td, width: '80px', textAlign: 'right',
                    color: multColor,
                    textShadow: mult >= 1
                      ? '0 0 8px rgba(46, 204, 113, 0.4)'
                      : '0 0 8px rgba(248, 113, 113, 0.4)',
                  }} className="mono">
                    {mult.toFixed(2)}x
                  </span>
                  <span style={{ ...styles.td, width: '80px', textAlign: 'right' }} className="mono">
                    {formatSol(payout)}
                  </span>
                  <span style={{ ...styles.td, width: '60px', textAlign: 'right' }} className="mono">
                    {r.nodesHit}/{r.nodesHit + r.nodesMissed}
                  </span>
                  <span style={{
                    ...styles.td, width: '50px', textAlign: 'right',
                    color: theme.accent.purple,
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.4)',
                  }} className="mono">
                    +{r.xpAwarded}
                  </span>
                  <span style={{ ...styles.td, width: '100px', textAlign: 'right', color: theme.text.muted }}>
                    {new Date(r.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
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
    gap: '16px',
    padding: '16px',
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  panel: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    flex: 1,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tableHeader: {
    display: 'flex',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
    minWidth: '580px',
  },
  th: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  tableBody: {
    flex: 1,
    overflow: 'auto',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  tableRow: {
    display: 'flex',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    alignItems: 'center',
    minWidth: '580px',
    transition: 'background-color 0.15s ease',
  },
  td: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.secondary,
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
