import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { MiniBarChart } from '../components/MiniBarChart';
import { adminApi } from '../utils/api';

interface KpiData {
  roundsToday: number;
  betVolumeToday: number;
  activeUsers: number;
  revenue24h: number;
  houseEdge: number;
  totalUsers: number;
}

interface RecentRound {
  id: string;
  status: string;
  playerCount: number;
  mode: string;
  createdAt: string;
}

interface TimeseriesPoint {
  date: string;
  value: number;
}

interface QuickStats {
  treasuryState: string;
  killSwitchActive: boolean;
  unackedAlerts: number;
  pendingWithdrawalCount: number;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [volumeData, setVolumeData] = useState<TimeseriesPoint[]>([]);
  const [revenueData, setRevenueData] = useState<TimeseriesPoint[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [openRiskFlags, setOpenRiskFlags] = useState(0);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [statsRes, roundsRes, volRes, revRes, withRes, riskRes, healthRes, opsRes] = await Promise.all([
        adminApi.getDashboardStats().catch(() => ({
          roundsToday: 0, betVolumeToday: 0, activeUsers: 0,
          revenue24h: 0, houseEdge: 0, totalUsers: 0,
        })),
        adminApi.getRounds({ limit: 10 }).catch(() => ({ data: [] })),
        adminApi.getTimeseries('volume', '7d').catch(() => ({ data: [] })),
        adminApi.getTimeseries('revenue', '7d').catch(() => ({ data: [] })),
        adminApi.getWithdrawals({ status: 'pending_review', limit: 1 }).catch(() => ({ data: [], total: 0 })),
        adminApi.getRiskFlags({ resolved: false, limit: 1 }).catch(() => ({ data: [], total: 0 })),
        adminApi.getTreasuryHealth().catch(() => null),
        adminApi.getOpsHealth().catch(() => null),
      ]);
      setKpis(statsRes as KpiData);
      setRecentRounds((roundsRes as { data: RecentRound[] }).data);
      setVolumeData((volRes as { data: TimeseriesPoint[] }).data || []);
      setRevenueData((revRes as { data: TimeseriesPoint[] }).data || []);
      const withData = withRes as { data: unknown[]; total?: number };
      setPendingWithdrawals(withData.total ?? withData.data.length);
      const riskData = riskRes as { data: unknown[]; total?: number };
      setOpenRiskFlags(riskData.total ?? riskData.data.length);

      // Quick stats
      const hs = healthRes as any;
      const os = opsRes as any;
      setQuickStats({
        treasuryState: hs?.health?.circuitBreakerState || 'unknown',
        killSwitchActive: hs?.health?.killSwitchActive || false,
        unackedAlerts: os?.alerts?.unacknowledged ?? 0,
        pendingWithdrawalCount: hs?.health?.pendingWithdrawalCount ?? 0,
      });
    } catch {
      // silent
    }
    setLoading(false);
  }

  const roundColumns: Column<RecentRound>[] = [
    {
      key: 'id', label: 'Round ID', width: '120px',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{r.id.slice(0, 8)}</span>,
    },
    { key: 'mode', label: 'Mode' },
    {
      key: 'status', label: 'Status',
      render: (r) => {
        const colorMap: Record<string, string> = {
          scheduled: theme.info, entry_open: theme.warning,
          in_progress: theme.accent.purple, resolving: theme.warning, resolved: theme.success,
        };
        return <Badge color={colorMap[r.status] || theme.text.muted}>{r.status}</Badge>;
      },
    },
    { key: 'playerCount', label: 'Players' },
    {
      key: 'createdAt', label: 'Created',
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
  ];

  const sol = (l: number) => (l / 1_000_000_000).toFixed(4);

  if (loading) {
    return <div style={styles.loading}>Loading dashboard...</div>;
  }

  const chartVolume = volumeData.slice(-7).map((d) => ({
    label: d.date.slice(5),
    value: d.value,
  }));
  const chartRevenue = revenueData.slice(-7).map((d) => ({
    label: d.date.slice(5),
    value: d.value,
  }));

  const stateColor = (s: string) =>
    s === 'healthy' ? theme.success : s === 'warning' ? theme.warning : s === 'critical' || s === 'maintenance' ? theme.danger : theme.text.muted;

  return (
    <div style={styles.page}>
      {/* Quick Stats */}
      {quickStats && (
        <div style={styles.quickRow}>
          <button style={{ ...styles.quickCard, borderColor: stateColor(quickStats.treasuryState) + '60' }} onClick={() => navigate('/treasury')}>
            <span style={{ fontSize: '1.1rem' }}>🏦</span>
            <span style={styles.quickLabel}>Treasury</span>
            <span style={{ ...styles.quickValue, color: stateColor(quickStats.treasuryState) }}>
              {quickStats.treasuryState.toUpperCase()}
            </span>
            {quickStats.killSwitchActive && <span style={styles.killBadge}>KILL</span>}
          </button>
          <button style={{ ...styles.quickCard, borderColor: quickStats.unackedAlerts > 0 ? theme.danger + '60' : theme.border.medium }} onClick={() => navigate('/ops-alerts')}>
            <span style={{ fontSize: '1.1rem' }}>🔔</span>
            <span style={styles.quickLabel}>Unacked Alerts</span>
            <span style={{ ...styles.quickValue, color: quickStats.unackedAlerts > 0 ? theme.danger : theme.success }}>
              {quickStats.unackedAlerts}
            </span>
          </button>
          <button style={{ ...styles.quickCard, borderColor: quickStats.pendingWithdrawalCount > 0 ? theme.warning + '60' : theme.border.medium }} onClick={() => navigate('/treasury')}>
            <span style={{ fontSize: '1.1rem' }}>⏳</span>
            <span style={styles.quickLabel}>Pending W/D</span>
            <span style={{ ...styles.quickValue, color: quickStats.pendingWithdrawalCount > 0 ? theme.warning : theme.success }}>
              {quickStats.pendingWithdrawalCount}
            </span>
          </button>
        </div>
      )}

      {/* KPIs */}
      <div style={styles.kpiGrid}>
        <StatCard label="Active Users" value={kpis?.activeUsers ?? 0} icon="👥" color={theme.accent.cyan} />
        <StatCard label="Rounds Today" value={kpis?.roundsToday ?? 0} icon="🎮" color={theme.accent.purple} />
        <StatCard label="Volume (24h)" value={`${sol(kpis?.betVolumeToday ?? 0)} SOL`} icon="💰" color={theme.accent.green} />
        <StatCard label="Revenue (24h)" value={`${sol(kpis?.revenue24h ?? 0)} SOL`} icon="📈" color={theme.success} />
        <StatCard label="Total Users" value={kpis?.totalUsers ?? 0} icon="🌐" color={theme.info} />
      </div>

      {/* Alerts */}
      {(pendingWithdrawals > 0 || openRiskFlags > 0) && (
        <div style={styles.alerts}>
          {pendingWithdrawals > 0 && (
            <button style={styles.alertCard} onClick={() => navigate('/treasury')}>
              <span style={{ ...styles.alertDot, background: theme.warning }} />
              <span style={styles.alertText}>
                <strong>{pendingWithdrawals}</strong> pending withdrawal{pendingWithdrawals > 1 ? 's' : ''} to review
              </span>
              <span style={styles.alertArrow}>→</span>
            </button>
          )}
          {openRiskFlags > 0 && (
            <button style={styles.alertCard} onClick={() => navigate('/risk')}>
              <span style={{ ...styles.alertDot, background: theme.danger }} />
              <span style={styles.alertText}>
                <strong>{openRiskFlags}</strong> unresolved risk flag{openRiskFlags > 1 ? 's' : ''}
              </span>
              <span style={styles.alertArrow}>→</span>
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div style={styles.chartsGrid}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Volume (7d)</h3>
          <MiniBarChart data={chartVolume} color={theme.accent.green} formatValue={(v) => `${sol(v)} SOL`} />
        </div>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Revenue (7d)</h3>
          <MiniBarChart data={chartRevenue} color={theme.success} formatValue={(v) => `${sol(v)} SOL`} />
        </div>
      </div>

      {/* Recent Rounds */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent Rounds</h3>
        <DataTable columns={roundColumns} data={recentRounds} />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '28px' },
  loading: { color: theme.text.secondary, fontSize: theme.fontSize.md, padding: '40px', textAlign: 'center' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  alerts: { display: 'flex', flexDirection: 'column', gap: '8px' },
  alertCard: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 16px', background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`, borderRadius: theme.radius.lg,
    cursor: 'pointer', width: '100%', textAlign: 'left' as const,
  },
  alertDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  alertText: { flex: 1, color: theme.text.primary, fontSize: theme.fontSize.sm },
  alertArrow: { color: theme.text.muted, fontSize: theme.fontSize.md },
  quickRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  quickCard: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px', background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`, borderRadius: theme.radius.lg,
    cursor: 'pointer', textAlign: 'left' as const,
  },
  quickLabel: { fontSize: theme.fontSize.xs, color: theme.text.muted, fontWeight: 500 },
  quickValue: { fontSize: theme.fontSize.md, fontWeight: 700, marginLeft: 'auto' },
  killBadge: {
    fontSize: '0.6rem', fontWeight: 800, color: '#fff', background: theme.danger,
    borderRadius: theme.radius.sm, padding: '1px 5px', letterSpacing: '1px',
  },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionTitle: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
};
