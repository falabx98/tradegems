import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface TreasuryOverview {
  address: string;
  balanceSol: number;
  totalDeposits: number;
  totalDepositAmount: number;
  totalWithdrawals: number;
  totalWithdrawalAmount: number;
  pendingWithdrawals: number;
}

interface TreasuryHealth {
  onChainBalanceLamports: number;
  totalPendingWithdrawals: number;
  pendingWithdrawalCount: number;
  reserveRatio: number;
  availableLiquidity: number;
  circuitBreakerState: string;
  circuitBreakerEnabled: boolean;
  killSwitchActive: boolean;
  lastCheckedAt: string;
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
  const [health, setHealth] = useState<TreasuryHealth | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tab, setTab] = useState<'deposits' | 'withdrawals'>('withdrawals');
  const [loading, setLoading] = useState(true);
  const [killSwitchModal, setKillSwitchModal] = useState(false);
  const [killSwitchToggling, setKillSwitchToggling] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ id: string; amount: number } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadTreasury();
  }, []);

  async function loadTreasury() {
    setLoading(true);
    try {
      const [ov, healthRes, deps, withs] = await Promise.all([
        adminApi.getTreasuryOverview().catch(() => null),
        adminApi.getTreasuryHealth().catch(() => null),
        adminApi.getDeposits({ limit: 50 }).catch(() => ({ data: [] })),
        adminApi.getWithdrawals({ limit: 50 }).catch(() => ({ data: [] })),
      ]);
      setOverview(ov as TreasuryOverview | null);
      if (healthRes) setHealth((healthRes as any).health as TreasuryHealth);
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
      addToast(`Withdrawal ${status}`);
      loadTreasury();
    } catch {
      addToast(`Failed to ${status} withdrawal`, 'error');
    }
  }

  async function handleForceProcess(id: string) {
    setActionLoading(id);
    try {
      const res = await adminApi.forceProcessWithdrawal(id);
      addToast(`Withdrawal force-processed. Tx: ${(res as any).txHash?.slice(0, 16) || 'sent'}`);
      loadTreasury();
    } catch (err: any) {
      addToast(err.message || 'Force-process failed', 'error');
    }
    setActionLoading(null);
  }

  async function handleCancelWithdrawal() {
    if (!cancelModal) return;
    setActionLoading(cancelModal.id);
    try {
      await adminApi.cancelWithdrawal(cancelModal.id, cancelReason || undefined);
      addToast('Withdrawal cancelled, funds released');
      setCancelModal(null);
      setCancelReason('');
      loadTreasury();
    } catch (err: any) {
      addToast(err.message || 'Cancel failed', 'error');
    }
    setActionLoading(null);
  }

  async function handleToggleKillSwitch() {
    setKillSwitchToggling(true);
    try {
      const newState = !health?.killSwitchActive;
      const res = await adminApi.toggleCircuitBreaker(newState);
      addToast((res as any).message || `Kill switch ${newState ? 'activated' : 'deactivated'}`);
      setKillSwitchModal(false);
      loadTreasury();
    } catch (err: any) {
      addToast(err.message || 'Toggle failed', 'error');
    }
    setKillSwitchToggling(false);
  }

  const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

  const stateColor = (state: string) => {
    switch (state) {
      case 'healthy': return theme.success;
      case 'warning': return theme.warning;
      case 'critical': return theme.danger;
      case 'maintenance': return '#ff4444';
      default: return theme.text.muted;
    }
  };

  const depositColumns: Column<Deposit>[] = [
    { key: 'id', label: 'ID', width: '100px', render: (d) => <Mono>{d.id.slice(0, 8)}</Mono> },
    { key: 'userId', label: 'User', width: '100px', render: (d) => <Mono>{d.userId.slice(0, 8)}</Mono> },
    { key: 'amount', label: 'Amount', render: (d) => `${sol(d.amount)} SOL` },
    { key: 'txHash', label: 'Tx Hash', render: (d) => <Mono>{d.txHash?.slice(0, 16) || '—'}</Mono> },
    {
      key: 'status', label: 'Status', render: (d) => {
        const c = d.status === 'confirmed' ? theme.success : d.status === 'failed' ? theme.danger : theme.warning;
        return <StatusBadge color={c}>{d.status}</StatusBadge>;
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
          pending: theme.warning,
          pending_review: theme.warning,
          delayed: '#ff9944',
          processing: theme.info,
          approved: theme.info,
          completed: theme.success,
          rejected: theme.danger,
          cancelled: theme.text.muted,
          failed: theme.danger,
        };
        return <StatusBadge color={colorMap[w.status] || theme.text.muted}>{w.status}</StatusBadge>;
      },
    },
    {
      key: 'actions', label: 'Actions', width: '220px', render: (w) => {
        const isProcessable = ['pending', 'delayed', 'pending_review'].includes(w.status);
        const isLoading = actionLoading === w.id;

        if (!isProcessable) return <span style={{ color: theme.text.muted }}>—</span>;
        return (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {w.status === 'pending_review' && (
              <>
                <button style={{ ...styles.miniBtn, color: theme.success, borderColor: theme.success }}
                  onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, 'approved'); }}>
                  Approve
                </button>
                <button style={{ ...styles.miniBtn, color: theme.danger, borderColor: theme.danger }}
                  onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, 'rejected'); }}>
                  Reject
                </button>
              </>
            )}
            <button
              style={{ ...styles.miniBtn, color: theme.accent.cyan, borderColor: theme.accent.cyan, opacity: isLoading ? 0.5 : 1 }}
              disabled={isLoading}
              onClick={(e) => { e.stopPropagation(); handleForceProcess(w.id); }}>
              {isLoading ? '...' : 'Force'}
            </button>
            <button
              style={{ ...styles.miniBtn, color: theme.danger, borderColor: theme.danger, opacity: isLoading ? 0.5 : 1 }}
              disabled={isLoading}
              onClick={(e) => { e.stopPropagation(); setCancelModal({ id: w.id, amount: w.amount }); }}>
              Cancel
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

      {/* Treasury Health + Circuit Breaker */}
      {health && (
        <div style={styles.healthRow}>
          {/* Health Card */}
          <div style={styles.healthCard}>
            <h3 style={styles.cardTitle}>Treasury Health</h3>
            <div style={styles.healthGrid}>
              <div style={styles.healthItem}>
                <span style={styles.healthLabel}>State</span>
                <span style={{ ...styles.healthValue, color: stateColor(health.circuitBreakerState) }}>
                  {health.circuitBreakerState.toUpperCase()}
                </span>
              </div>
              <div style={styles.healthItem}>
                <span style={styles.healthLabel}>Reserve Ratio</span>
                <span style={{ ...styles.healthValue, color: health.reserveRatio < 0 ? theme.success : health.reserveRatio < 1 ? theme.danger : health.reserveRatio < 2 ? theme.warning : theme.success }}>
                  {health.reserveRatio < 0 ? 'No pending' : `${health.reserveRatio.toFixed(2)}x`}
                </span>
              </div>
              <div style={styles.healthItem}>
                <span style={styles.healthLabel}>Pending Withdrawals</span>
                <span style={styles.healthValue}>{health.pendingWithdrawalCount} ({sol(health.totalPendingWithdrawals)} SOL)</span>
              </div>
              <div style={styles.healthItem}>
                <span style={styles.healthLabel}>Available Liquidity</span>
                <span style={{ ...styles.healthValue, color: health.availableLiquidity < 0 ? theme.danger : theme.success }}>
                  {sol(health.availableLiquidity)} SOL
                </span>
              </div>
              <div style={styles.healthItem}>
                <span style={styles.healthLabel}>Last Check</span>
                <span style={styles.healthValue}>{health.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleTimeString() : '—'}</span>
              </div>
            </div>
          </div>

          {/* Circuit Breaker Card */}
          <div style={{ ...styles.healthCard, borderColor: health.killSwitchActive ? theme.danger : theme.border.medium }}>
            <h3 style={styles.cardTitle}>Circuit Breaker</h3>
            <div style={styles.cbContent}>
              <div style={styles.cbRow}>
                <span style={styles.healthLabel}>Auto Circuit Breaker</span>
                <StatusBadge color={health.circuitBreakerEnabled ? theme.success : theme.text.muted}>
                  {health.circuitBreakerEnabled ? 'ENABLED' : 'DISABLED'}
                </StatusBadge>
              </div>
              <div style={styles.cbRow}>
                <span style={styles.healthLabel}>Kill Switch</span>
                <StatusBadge color={health.killSwitchActive ? theme.danger : theme.success}>
                  {health.killSwitchActive ? 'ACTIVE (Games Paused)' : 'INACTIVE'}
                </StatusBadge>
              </div>
              <div style={styles.cbRow}>
                <span style={styles.healthLabel}>Effective State</span>
                <StatusBadge color={stateColor(health.circuitBreakerState)}>
                  {health.circuitBreakerState.toUpperCase()}
                </StatusBadge>
              </div>
              <button
                style={{
                  ...styles.killSwitchBtn,
                  background: health.killSwitchActive ? theme.success : theme.danger,
                  opacity: killSwitchToggling ? 0.5 : 1,
                }}
                disabled={killSwitchToggling}
                onClick={() => setKillSwitchModal(true)}
              >
                {health.killSwitchActive ? 'DEACTIVATE Kill Switch' : 'ACTIVATE Kill Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Kill Switch Confirmation Modal */}
      <Modal open={killSwitchModal} onClose={() => setKillSwitchModal(false)} title="Confirm Kill Switch Toggle" width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: theme.text.secondary, margin: 0, fontSize: theme.fontSize.sm }}>
            {health?.killSwitchActive
              ? 'This will DEACTIVATE the kill switch and resume all house games.'
              : 'This will ACTIVATE the kill switch and PAUSE ALL house games immediately. Players will not be able to place bets.'}
          </p>
          {!health?.killSwitchActive && (
            <div style={{ padding: '12px', background: `${theme.danger}15`, border: `1px solid ${theme.danger}40`, borderRadius: theme.radius.md }}>
              <strong style={{ color: theme.danger }}>WARNING:</strong>
              <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}> All active games will be paused. This affects all players.</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button style={{ ...styles.modalBtn, color: theme.text.secondary, borderColor: theme.border.medium }} onClick={() => setKillSwitchModal(false)}>
              Cancel
            </button>
            <button
              style={{ ...styles.modalBtn, background: health?.killSwitchActive ? theme.success : theme.danger, color: '#fff', borderColor: 'transparent' }}
              onClick={handleToggleKillSwitch}
              disabled={killSwitchToggling}
            >
              {killSwitchToggling ? 'Processing...' : health?.killSwitchActive ? 'Deactivate' : 'Activate Kill Switch'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancel Withdrawal Modal */}
      <Modal open={!!cancelModal} onClose={() => { setCancelModal(null); setCancelReason(''); }} title="Cancel Withdrawal" width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: theme.text.secondary, margin: 0, fontSize: theme.fontSize.sm }}>
            Cancel withdrawal <Mono>{cancelModal?.id.slice(0, 8)}</Mono> for {sol(cancelModal?.amount ?? 0)} SOL? Funds will be returned to user.
          </p>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            style={styles.input}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button style={{ ...styles.modalBtn, color: theme.text.secondary, borderColor: theme.border.medium }} onClick={() => { setCancelModal(null); setCancelReason(''); }}>
              Back
            </button>
            <button
              style={{ ...styles.modalBtn, background: theme.danger, color: '#fff', borderColor: 'transparent' }}
              onClick={handleCancelWithdrawal}
              disabled={actionLoading === cancelModal?.id}
            >
              {actionLoading === cancelModal?.id ? 'Cancelling...' : 'Cancel Withdrawal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{children}</span>;
}

function StatusBadge({ children, color }: { children: React.ReactNode; color: string }) {
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
    padding: '3px 8px', border: '1px solid', borderRadius: theme.radius.sm,
    background: 'transparent', fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer',
  },
  healthRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  healthCard: {
    background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.lg, padding: '20px',
  },
  cardTitle: { margin: '0 0 16px 0', fontSize: theme.fontSize.md, fontWeight: 600, color: theme.text.primary },
  healthGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  healthItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  healthLabel: { fontSize: theme.fontSize.xs, color: theme.text.muted, fontWeight: 500 },
  healthValue: { fontSize: theme.fontSize.sm, color: theme.text.primary, fontWeight: 600 },
  cbContent: { display: 'flex', flexDirection: 'column', gap: '12px' },
  cbRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  killSwitchBtn: {
    marginTop: '8px', padding: '10px 16px', border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontSize: theme.fontSize.sm, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.5px',
  },
  modalBtn: {
    padding: '8px 16px', border: '1px solid', borderRadius: theme.radius.md,
    fontSize: theme.fontSize.sm, fontWeight: 600, cursor: 'pointer', background: 'transparent',
  },
  input: {
    padding: '10px 12px', background: theme.bg.tertiary, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.sm,
    outline: 'none',
  },
};
