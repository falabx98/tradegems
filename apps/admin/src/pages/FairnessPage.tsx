import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { adminApi } from '../utils/api';

interface FairnessMetrics {
  actualHouseEdge: number;
  targetHouseEdge: { min: number; max: number };
  totalRoundsAnalyzed: number;
  totalBetsAnalyzed: number;
  overallWinRate: number;
  byRiskTier: {
    tier: string;
    winRate: number;
    avgMultiplier: number;
    betCount: number;
  }[];
  nodeStats: {
    avgMultipliersPerRound: number;
    avgDividersPerRound: number;
    hitRate: number;
  };
}

interface FairnessRoundData {
  seed: string;
  seedCommitment: string;
  nodes: { nodeType: string; nodeValue: string; rarity: string; spawnTimeMs: number }[];
  results: { userId: string; finalMultiplier: string; resultType: string; payoutAmount: number }[];
}

export function FairnessPage() {
  const [metrics, setMetrics] = useState<FairnessMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [roundLookup, setRoundLookup] = useState('');
  const [roundData, setRoundData] = useState<FairnessRoundData | null>(null);
  const [roundError, setRoundError] = useState('');

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    setLoading(true);
    try {
      const res = await adminApi.getFairnessMetrics();
      setMetrics(res as FairnessMetrics);
    } catch {
      setMetrics(null);
    }
    setLoading(false);
  }

  async function lookupRound() {
    if (!roundLookup.trim()) return;
    setRoundError('');
    try {
      const res = await adminApi.getFairnessRound(roundLookup.trim());
      setRoundData(res as FairnessRoundData);
    } catch {
      setRoundError('Round not found');
      setRoundData(null);
    }
  }

  if (loading) return <div style={styles.loading}>Loading fairness metrics...</div>;

  return (
    <div style={styles.page}>
      {/* Aggregate Metrics */}
      <div style={styles.kpiGrid}>
        <StatCard
          label="House Edge (Actual)"
          value={metrics ? `${(metrics.actualHouseEdge * 100).toFixed(2)}%` : '—'}
          icon="🎯"
          color={theme.accent.cyan}
          sub={metrics ? `Target: ${(metrics.targetHouseEdge.min * 100).toFixed(0)}-${(metrics.targetHouseEdge.max * 100).toFixed(0)}%` : ''}
        />
        <StatCard
          label="Overall Win Rate"
          value={metrics ? `${(metrics.overallWinRate * 100).toFixed(1)}%` : '—'}
          icon="🏆"
          color={theme.success}
        />
        <StatCard
          label="Rounds Analyzed"
          value={metrics?.totalRoundsAnalyzed ?? 0}
          icon="🎮"
          color={theme.accent.purple}
        />
        <StatCard
          label="Bets Analyzed"
          value={metrics?.totalBetsAnalyzed ?? 0}
          icon="🎲"
          color={theme.info}
        />
      </div>

      {/* Win Rate by Risk Tier */}
      {metrics?.byRiskTier && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Win Rate by Risk Tier</h3>
          <div style={styles.tierGrid}>
            {metrics.byRiskTier.map((t) => (
              <div key={t.tier} style={styles.tierCard}>
                <div style={styles.tierName}>{t.tier}</div>
                <div style={styles.tierStat}>
                  <span style={{ color: theme.text.secondary }}>Win Rate</span>
                  <span style={{ color: theme.success, fontWeight: 600 }}>{(t.winRate * 100).toFixed(1)}%</span>
                </div>
                <div style={styles.tierStat}>
                  <span style={{ color: theme.text.secondary }}>Avg Multiplier</span>
                  <span style={{ color: theme.accent.cyan, fontWeight: 600 }}>{Number(t.avgMultiplier).toFixed(3)}x</span>
                </div>
                <div style={styles.tierStat}>
                  <span style={{ color: theme.text.secondary }}>Bets</span>
                  <span style={{ color: theme.text.primary }}>{t.betCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node Stats */}
      {metrics?.nodeStats && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Node Statistics</h3>
          <div style={styles.kpiGrid}>
            <StatCard label="Avg Multipliers/Round" value={metrics.nodeStats.avgMultipliersPerRound.toFixed(1)} icon="🟢" color={theme.success} />
            <StatCard label="Avg Dividers/Round" value={metrics.nodeStats.avgDividersPerRound.toFixed(1)} icon="🔴" color={theme.danger} />
            <StatCard label="Node Hit Rate" value={`${(metrics.nodeStats.hitRate * 100).toFixed(1)}%`} icon="🎯" color={theme.accent.cyan} />
          </div>
        </div>
      )}

      {/* Provably Fair Lookup */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Provably Fair Verification</h3>
        <div style={styles.lookupRow}>
          <input
            style={styles.lookupInput}
            placeholder="Enter Round ID to verify..."
            value={roundLookup}
            onChange={(e) => setRoundLookup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupRound()}
          />
          <button style={styles.lookupBtn} onClick={lookupRound}>Verify</button>
        </div>
        {roundError && <div style={{ color: theme.danger, fontSize: theme.fontSize.sm }}>{roundError}</div>}

        {roundData && (
          <div style={styles.roundDetail}>
            <div style={styles.seedBox}>
              <div><strong>Seed:</strong> <code style={styles.code}>{roundData.seed || '—'}</code></div>
              <div><strong>Commitment:</strong> <code style={styles.code}>{roundData.seedCommitment || '—'}</code></div>
            </div>

            <h4 style={styles.subTitle}>Nodes</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {roundData.nodes?.map((n, i) => (
                <span key={i} style={{
                  padding: '3px 8px', borderRadius: theme.radius.sm, fontSize: theme.fontSize.xs, fontWeight: 600,
                  background: n.nodeType === 'multiplier' ? theme.success + '20' : n.nodeType === 'divider' ? theme.danger + '20' : theme.info + '20',
                  color: n.nodeType === 'multiplier' ? theme.success : n.nodeType === 'divider' ? theme.danger : theme.info,
                }}>
                  {n.nodeType} {n.nodeValue}x @ {n.spawnTimeMs}ms
                </span>
              ))}
            </div>

            {roundData.results && roundData.results.length > 0 && (
              <>
                <h4 style={styles.subTitle}>Results</h4>
                <div style={styles.resultsGrid}>
                  {roundData.results.map((r, i) => (
                    <div key={i} style={styles.resultRow}>
                      <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{r.userId.slice(0, 8)}</span>
                      <span style={{ color: r.resultType === 'win' ? theme.success : theme.danger, fontWeight: 600 }}>
                        {Number(r.finalMultiplier).toFixed(3)}x — {r.resultType}
                      </span>
                      <span style={{ color: theme.text.secondary }}>{(r.payoutAmount / 1e9).toFixed(4)} SOL</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '28px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionTitle: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  subTitle: { fontSize: theme.fontSize.base, fontWeight: 600, color: theme.text.primary, margin: '8px 0 4px' },
  tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' },
  tierCard: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
  },
  tierName: { fontSize: theme.fontSize.md, fontWeight: 700, color: theme.text.primary, textTransform: 'capitalize' as const },
  tierStat: { display: 'flex', justifyContent: 'space-between', fontSize: theme.fontSize.sm },
  lookupRow: { display: 'flex', gap: '8px' },
  lookupInput: {
    flex: 1, padding: '10px 14px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.base, outline: 'none', fontFamily: 'monospace',
  },
  lookupBtn: {
    padding: '10px 20px', background: theme.accent.cyan, border: 'none', borderRadius: theme.radius.md,
    color: theme.text.inverse, fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer',
  },
  roundDetail: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
  },
  seedBox: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: theme.fontSize.sm, color: theme.text.primary },
  code: { fontFamily: 'monospace', fontSize: theme.fontSize.xs, color: theme.accent.cyan, wordBreak: 'break-all' as const },
  resultsGrid: { display: 'flex', flexDirection: 'column', gap: '4px' },
  resultRow: { display: 'flex', justifyContent: 'space-between', fontSize: theme.fontSize.sm, padding: '4px 0', borderBottom: `1px solid ${theme.border.subtle}` },
};
