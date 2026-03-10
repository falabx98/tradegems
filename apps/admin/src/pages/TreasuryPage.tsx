import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';

interface TreasuryOverview {
  address: string;
  balanceSol: number;
  totalDeposits: number;
  totalDepositAmount: number;
  totalWithdrawals: number;
  totalWithdrawalAmount: number;
  pendingWithdrawals: number;
}

interface Deposit {
  id: string;
  userId: string;
  amount: number;
  txHash: string;
  status: string;
  fromAddress: string;
  createdAt: string;
}

interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  destination: string;
  status: string;
  txHash: string;
  createdAt: string;
}

export function TreasuryPage() {
  const [overview, setOverview] = useState<TreasuryOverview | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tab, setTab] = useState<'deposits' | 'withdrawals'>('withdrawals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTreasury();
  }, []);

  async function loadTreasury() {
    setLoading(true);
    try {
      const [ov, deps, withs] = await Promise.all([
        adminApi.getTreasuryOverview().catch(() => null),
        adminApi.getDeposits({ limit: 50 }).catch(() => ({ data: [] })),
        adminApi.getWithdrawals({ limit: 50 }).catch(() => ({ data: [] })),
      ]);
      setOverview(ov as TreasuryOverview | null);
      setDeposits((deps as { data: Deposit[] }).data);
      setWithdrawals((withs as { data: Withdrawal[] }).data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function handleWithdrawalAction(id: string, status: 'approved' | 'rejected') {
    try {
      await adminApi.updateWithdrawal(id, { status });
      loadTreasury();
    } catch {
      // silent
    }
  }

  const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

  const depositColumns: Column<Deposit>[] = [
    { key: 'id', label: 'ID', width: '100px', render: (d) => <Mono>{d.id.slice(0, 8)}</Mono> },
    { key: 'userId', label: 'User', width: '100px', render: (d) => <Mono>{d.userId.slice(0, 8)}</Mono> },
    { key: 'amount', label: 'Amount', render: (d) => `${sol(d.amount)} SOL` },
    { key: 'txHash', label: 'Tx Hash', render: (d) => <Mono>{d.txHash?.slice(0, 16) || '—'}</Mono> },
    {
      key: 'status', label: 'Status', render: (d) => {
        const c = d.status === 'confirmed' ? theme.success : d.status === 'failed' ? theme.danger : theme.warning;
        return <Badge color={c}>{d.status}</Badge>;
      },
    },
    { key: 'createdAt', label: 'Date', render: (d) => new Date(d.createdAt).toLocaleString() },
  ];

  const withdrawalColumns: Column<Withdrawal>[] = [
    { key: 'id', label: 'ID', width: '100px', render: (w) => <Mono>{w.id.slice(0, 8)}</Mono> },
    { key: 'userId', label: 'User', width: '100px', render: (w) => <Mono>{w.userId.slice(0, 8)}</Mono> },
    { key: 'amount', label: 'Amount', render: (w) => `${sol(w.amount)} SOL` },
    { key: 'destination', label: 'Destination', render: (w) => <Mono>{w.destination.slice(0, 12)}...</Mono> },
    {
      key: 'status', label: 'Status', render: (w) => {
        const colorMap: Record<string, string> = {
          pending_review: theme.warning,
          approved: theme.info,
          completed: theme.success,
          rejected: theme.danger,
        };
        return <Badge color={colorMap[w.status] || theme.text.muted}>{w.status}</Badge>;
      },
    },
    {
      key: 'actions', label: 'Actions', render: (w) => {
        if (w.status !== 'pending_review') return <span style={{ color: theme.text.muted }}>—</span>;
        return (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={{ ...styles.miniBtn, color: theme.success, borderColor: theme.success }}
              onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, 'approved'); }}>
              Approve
            </button>
            <button style={{ ...styles.miniBtn, color: theme.danger, borderColor: theme.danger }}
              onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, 'rejected'); }}>
              Reject
            </button>
          </div>
        );
      },
    },
    { key: 'createdAt', label: 'Date', render: (w) => new Date(w.createdAt).toLocaleString() },
  ];

  if (loading) return <div style={styles.loading}>Loading treasury...</div>;

  return (
    <div style={styles.page}>
      {/* Overview cards */}
      <div style={styles.kpiGrid}>
        <StatCard label="Treasury Address" value={overview?.address?.slice(0, 12) + '...' || '—'} icon="🏦" color={theme.accent.purple} sub={overview?.address} />
        <StatCard label="On-Chain Balance" value={`${overview?.balanceSol?.toFixed(4) || '0'} SOL`} icon="💎" color={theme.accent.green} />
        <StatCard label="Total Deposits" value={overview?.totalDeposits ?? 0} icon="📥" color={theme.success} sub={`${sol(overview?.totalDepositAmount ?? 0)} SOL`} />
        <StatCard label="Total Withdrawals" value={overview?.totalWithdrawals ?? 0} icon="📤" color={theme.warning} sub={`${sol(overview?.totalWithdrawalAmount ?? 0)} SOL`} />
        <StatCard label="Pending Withdrawals" value={overview?.pendingWithdrawals ?? 0} icon="⏳" color={theme.danger} />
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'withdrawals' ? styles.tabActive : {}) }} onClick={() => setTab('withdrawals')}>
          Withdrawals
        </button>
        <button style={{ ...styles.tab, ...(tab === 'deposits' ? styles.tabActive : {}) }} onClick={() => setTab('deposits')}>
          Deposits
        </button>
      </div>

      {tab === 'deposits' ? (
        <DataTable columns={depositColumns} data={deposits} emptyMessage="No deposits found" />
      ) : (
        <DataTable columns={withdrawalColumns} data={withdrawals} emptyMessage="No withdrawals found" />
      )}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{children}</span>;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: theme.radius.full,
      fontSize: theme.fontSize.xs, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '24px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  tabs: { display: 'flex', gap: '4px', background: theme.bg.card, borderRadius: theme.radius.md, padding: '4px', width: 'fit-content' },
  tab: {
    padding: '8px 20px', border: 'none', borderRadius: theme.radius.sm,
    background: 'transparent', color: theme.text.secondary, fontSize: theme.fontSize.sm,
    fontWeight: 600, cursor: 'pointer',
  },
  tabActive: { background: theme.bg.tertiary, color: theme.text.primary },
  miniBtn: {
    padding: '3px 10px', border: '1px solid', borderRadius: theme.radius.sm,
    background: 'transparent', fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer',
  },
};
