import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';

interface ReferralStats {
  totalCodes: number;
  totalReferrals: number;
  totalEarnings: number;
  totalClaimed: number;
}

interface ReferralCode {
  id: string;
  userId: string;
  username: string;
  code: string;
  referralCount: number;
  totalEarnings: number;
  createdAt: string;
}

export function ReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferrals();
  }, []);

  async function loadReferrals() {
    setLoading(true);
    try {
      const [statsRes, codesRes] = await Promise.all([
        adminApi.getReferralStats().catch(() => null),
        adminApi.getReferrals({ limit: 50 }).catch(() => ({ data: [] })),
      ]);
      setStats(statsRes as ReferralStats | null);
      setCodes((codesRes as { data: ReferralCode[] }).data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }

  const sol = (l: number) => (l / 1e9).toFixed(4);

  const columns: Column<ReferralCode>[] = [
    {
      key: 'username',
      label: 'User',
      render: (r) => <span style={{ fontWeight: 600, color: theme.text.primary }}>{r.username}</span>,
    },
    {
      key: 'code',
      label: 'Code',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.sm, color: theme.accent.cyan }}>{r.code}</span>,
    },
    { key: 'referralCount', label: 'Referrals' },
    {
      key: 'totalEarnings',
      label: 'Earnings',
      render: (r) => `${sol(r.totalEarnings)} SOL`,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (r) => new Date(r.createdAt).toLocaleDateString(),
    },
  ];

  if (loading) return <div style={styles.loading}>Loading referrals...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.kpiGrid}>
        <StatCard label="Total Codes" value={stats?.totalCodes ?? 0} icon="🔗" color={theme.accent.cyan} />
        <StatCard label="Total Referrals" value={stats?.totalReferrals ?? 0} icon="👥" color={theme.accent.purple} />
        <StatCard label="Total Earnings" value={`${sol(stats?.totalEarnings ?? 0)} SOL`} icon="💰" color={theme.accent.green} />
        <StatCard label="Total Claimed" value={`${sol(stats?.totalClaimed ?? 0)} SOL`} icon="✓" color={theme.success} />
      </div>

      <DataTable columns={columns} data={codes} emptyMessage="No referral codes created yet" />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '24px' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
};
