import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { adminApi } from '../utils/api';

interface TimeseriesPoint {
  date: string;
  value: number;
}

interface Distributions {
  vipTiers: { tier: string; count: number }[];
  riskTiers: { tier: string; count: number }[];
  topPlayers: { userId: string; username: string; totalWagered: number }[];
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [registrations, setRegistrations] = useState<TimeseriesPoint[]>([]);
  const [volume, setVolume] = useState<TimeseriesPoint[]>([]);
  const [revenue, setRevenue] = useState<TimeseriesPoint[]>([]);
  const [distributions, setDistributions] = useState<Distributions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [reg, vol, rev, dist] = await Promise.all([
        adminApi.getTimeseries('registrations', period).catch(() => ({ data: [] })),
        adminApi.getTimeseries('volume', period).catch(() => ({ data: [] })),
        adminApi.getTimeseries('revenue', period).catch(() => ({ data: [] })),
        adminApi.getDistributions().catch(() => null),
      ]);
      setRegistrations((reg as { data: TimeseriesPoint[] }).data || []);
      setVolume((vol as { data: TimeseriesPoint[] }).data || []);
      setRevenue((rev as { data: TimeseriesPoint[] }).data || []);
      setDistributions(dist as Distributions | null);
    } catch {
      // silent
    }
    setLoading(false);
  }

  const sol = (l: number) => (l / 1e9).toFixed(4);

  const totalRegistrations = registrations.reduce((s, p) => s + p.value, 0);
  const totalVolume = volume.reduce((s, p) => s + p.value, 0);
  const totalRevenue = revenue.reduce((s, p) => s + p.value, 0);

  if (loading) return <div style={styles.loading}>Loading analytics...</div>;

  return (
    <div style={styles.page}>
      {/* Period selector */}
      <div style={styles.periodSelector}>
        {['7d', '30d', '90d'].map((p) => (
          <button
            key={p}
            style={{
              ...styles.periodBtn,
              background: period === p ? theme.bg.tertiary : 'transparent',
              color: period === p ? theme.text.primary : theme.text.secondary,
            }}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Summary KPIs */}
      <div style={styles.kpiGrid}>
        <StatCard label={`Registrations (${period})`} value={totalRegistrations} icon="📝" color={theme.accent.cyan} />
        <StatCard label={`Volume (${period})`} value={`${sol(totalVolume)} SOL`} icon="💰" color={theme.accent.green} />
        <StatCard label={`Revenue (${period})`} value={`${sol(totalRevenue)} SOL`} icon="📈" color={theme.success} />
      </div>

      {/* Timeseries tables */}
      <div style={styles.gridTwo}>
        <TimeseriesTable title="Daily Registrations" data={registrations} format={(v) => String(v)} />
        <TimeseriesTable title="Daily Volume" data={volume} format={(v) => `${sol(v)} SOL`} />
      </div>

      {/* Distributions */}
      {distributions && (
        <div style={styles.gridTwo}>
          {/* VIP Tier Distribution */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>VIP Tier Distribution</h4>
            <div style={styles.barList}>
              {distributions.vipTiers?.map((t) => (
                <BarRow key={t.tier} label={t.tier} value={t.count} color={(theme.vip as Record<string, string>)[t.tier] || theme.text.muted} />
              ))}
            </div>
          </div>

          {/* Risk Tier Preference */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Risk Tier Preference</h4>
            <div style={styles.barList}>
              {distributions.riskTiers?.map((t) => {
                const colors: Record<string, string> = { conservative: theme.info, balanced: theme.warning, aggressive: theme.danger };
                return <BarRow key={t.tier} label={t.tier} value={t.count} color={colors[t.tier] || theme.text.muted} />;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top Players */}
      {distributions?.topPlayers && distributions.topPlayers.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Top 10 Players by Volume</h4>
          <div style={styles.topList}>
            {distributions.topPlayers.map((p, i) => (
              <div key={p.userId} style={styles.topRow}>
                <span style={styles.topRank}>#{i + 1}</span>
                <span style={styles.topName}>{p.username}</span>
                <span style={styles.topValue}>{sol(p.totalWagered)} SOL</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeseriesTable({ title, data, format }: { title: string; data: TimeseriesPoint[]; format: (v: number) => string }) {
  return (
    <div style={styles.section}>
      <h4 style={styles.sectionTitle}>{title}</h4>
      <div style={styles.tsTable}>
        {data.length === 0 ? (
          <div style={{ color: theme.text.muted, padding: '20px', textAlign: 'center' }}>No data</div>
        ) : (
          data.slice(-14).map((p) => (
            <div key={p.date} style={styles.tsRow}>
              <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.xs }}>{p.date}</span>
              <span style={{ color: theme.text.primary, fontSize: theme.fontSize.sm, fontWeight: 600 }}>{format(p.value)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BarRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
      <span style={{ width: '100px', color: theme.text.secondary, fontSize: theme.fontSize.sm, textTransform: 'capitalize' }}>{label}</span>
      <div style={{ flex: 1, height: '8px', background: theme.bg.tertiary, borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value * 2, 100)}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
      <span style={{ color: theme.text.primary, fontSize: theme.fontSize.sm, fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '28px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  periodSelector: { display: 'flex', gap: '4px', width: 'fit-content' },
  periodBtn: {
    padding: '6px 16px', border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.sm,
    fontSize: theme.fontSize.sm, fontWeight: 600, cursor: 'pointer',
  },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  gridTwo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { fontSize: theme.fontSize.base, fontWeight: 600, color: theme.text.primary, margin: 0 },
  tsTable: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '12px 16px', maxHeight: '300px', overflowY: 'auto',
  },
  tsRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${theme.border.subtle}` },
  barList: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '12px 16px',
  },
  topList: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '12px 16px',
  },
  topRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${theme.border.subtle}` },
  topRank: { color: theme.accent.cyan, fontWeight: 700, fontSize: theme.fontSize.sm, minWidth: '30px' },
  topName: { flex: 1, color: theme.text.primary, fontSize: theme.fontSize.sm },
  topValue: { color: theme.accent.green, fontWeight: 600, fontSize: theme.fontSize.sm },
};
