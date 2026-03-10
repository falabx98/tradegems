import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
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

export function DashboardPage() {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [statsRes, roundsRes] = await Promise.all([
        adminApi.getDashboardStats().catch(() => ({
          roundsToday: 0,
          betVolumeToday: 0,
          activeUsers: 0,
          revenue24h: 0,
          houseEdge: 0,
          totalUsers: 0,
        })),
        adminApi.getRounds({ limit: 10 }).catch(() => ({ data: [] })),
      ]);
      setKpis(statsRes as KpiData);
      setRecentRounds((roundsRes as { data: RecentRound[] }).data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  const roundColumns: Column<RecentRound>[] = [
    {
      key: 'id',
      label: 'Round ID',
      width: '280px',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{r.id}</span>,
    },
    { key: 'mode', label: 'Mode' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    { key: 'playerCount', label: 'Players' },
    {
      key: 'createdAt',
      label: 'Created',
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
  ];

  const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(4);

  if (loading) {
    return <div style={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.kpiGrid}>
        <StatCard
          label="Active Users"
          value={kpis?.activeUsers ?? 0}
          icon="👥"
          color={theme.accent.cyan}
        />
        <StatCard
          label="Rounds Today"
          value={kpis?.roundsToday ?? 0}
          icon="🎮"
          color={theme.accent.purple}
        />
        <StatCard
          label="Volume (24h)"
          value={`${lamportsToSol(kpis?.betVolumeToday ?? 0)} SOL`}
          icon="💰"
          color={theme.accent.green}
        />
        <StatCard
          label="Revenue (24h)"
          value={`${lamportsToSol(kpis?.revenue24h ?? 0)} SOL`}
          icon="📈"
          color={theme.success}
        />
        <StatCard
          label="Total Users"
          value={kpis?.totalUsers ?? 0}
          icon="🌐"
          color={theme.info}
        />
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent Rounds</h3>
        <DataTable columns={roundColumns} data={recentRounds} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    scheduled: theme.info,
    entry_open: theme.warning,
    in_progress: theme.accent.purple,
    resolving: theme.warning,
    resolved: theme.success,
  };
  const color = colorMap[status] || theme.text.muted;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: theme.radius.full,
        fontSize: theme.fontSize.xs,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
      }}
    >
      {status}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
  },
  loading: {
    color: theme.text.secondary,
    fontSize: theme.fontSize.md,
    padding: '40px',
    textAlign: 'center',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  },
};
