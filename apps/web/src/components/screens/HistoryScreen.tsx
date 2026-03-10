import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';

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
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <span style={styles.panelTitle}>History</span>
          <span style={styles.panelCount} className="mono">{entries.length}</span>
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
            <div style={styles.empty}>Loading history...</div>
          ) : entries.length === 0 ? (
            <div style={styles.empty}>No rounds played yet. Enter the arena!</div>
          ) : (
            entries.map((r) => {
              const mult = parseFloat(r.finalMultiplier || '1');
              const payout = r.payoutAmount;
              const isWin = r.resultType === 'win';
              const resultColor = isWin ? theme.success : r.resultType === 'loss' ? theme.danger : theme.warning;
              return (
                <div key={r.id} style={styles.tableRow}>
                  <span style={{ ...styles.td, flex: 1 }} className="mono">
                    {r.roundId.slice(0, 8)}
                  </span>
                  <span style={{
                    ...styles.td, width: '80px', textAlign: 'center',
                    color: resultColor, fontWeight: 700,
                  }}>
                    {r.resultType === 'win' ? 'WIN' : r.resultType === 'loss' ? 'LOSS' : r.resultType.toUpperCase()}
                  </span>
                  <span style={{
                    ...styles.td, width: '80px', textAlign: 'right',
                    color: mult >= 1 ? theme.success : theme.danger,
                  }} className="mono">
                    {mult.toFixed(2)}x
                  </span>
                  <span style={{ ...styles.td, width: '80px', textAlign: 'right' }} className="mono">
                    {formatSol(payout)}
                  </span>
                  <span style={{ ...styles.td, width: '60px', textAlign: 'right' }} className="mono">
                    {r.nodesHit}/{r.nodesHit + r.nodesMissed}
                  </span>
                  <span style={{ ...styles.td, width: '50px', textAlign: 'right', color: theme.accent.purple }} className="mono">
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
    height: '100%',
    overflow: 'hidden',
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
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    flex: 1,
  },
  panelCount: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.secondary,
  },
  tableHeader: {
    display: 'flex',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
    minWidth: '580px',
  },
  th: {
    fontSize: '11px',
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
  },
  td: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.secondary,
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '12px',
    color: theme.text.muted,
  },
};
