import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface UserDetail {
  id: string;
  username: string;
  email: string;
  status: string;
  role: string;
  vipTier: string;
  level: number;
  createdAt: string;
  availableAmount?: number;
  lockedAmount?: number;
  pendingAmount?: number;
  bonusAmount?: number;
  roundsPlayed?: number;
  totalWagered?: number;
  totalWon?: number;
  bestMultiplier?: number;
  winRate?: number;
  recentBets?: { id: string; amount: number; riskTier: string; status: string; createdAt: string }[];
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    if (id) loadUser(id);
  }, [id]);

  async function loadUser(userId: string) {
    setLoading(true);
    try {
      const res = await adminApi.getUserDetail(userId);
      setUser(res as UserDetail);
    } catch {
      addToast('Failed to load user', 'error');
    }
    setLoading(false);
  }

  async function handleStatusChange(status: string) {
    if (!user) return;
    try {
      await adminApi.updateUser(user.id, { status });
      addToast(`Status changed to ${status}`);
      loadUser(user.id);
    } catch {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleRoleChange(role: string) {
    if (!user) return;
    try {
      await adminApi.updateUser(user.id, { role });
      addToast(`Role changed to ${role}`);
      loadUser(user.id);
    } catch {
      addToast('Failed to update role', 'error');
    }
  }

  async function handleAdjustBalance() {
    if (!user || !adjustAmount) return;
    try {
      await adminApi.adjustBalance(user.id, {
        amount: Math.round(parseFloat(adjustAmount) * 1_000_000_000),
        reason: adjustReason || 'Admin adjustment',
      });
      addToast('Balance adjusted');
      setAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      loadUser(user.id);
    } catch {
      addToast('Failed to adjust balance', 'error');
    }
  }

  const sol = (l: number) => ((l || 0) / 1e9).toFixed(4);

  if (loading) return <div style={styles.loading}>Loading user...</div>;
  if (!user) return <div style={styles.loading}>User not found</div>;

  const vipColor = (theme.vip as Record<string, string>)[user.vipTier] || theme.text.muted;

  return (
    <div style={styles.page}>
      {/* Back button */}
      <button style={styles.backBtn} onClick={() => navigate('/users')}>
        ← Back to Users
      </button>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.username}>{user.username}</h2>
          <p style={styles.email}>{user.email}</p>
        </div>
        <div style={styles.badges}>
          <Badge color={user.status === 'active' ? theme.success : user.status === 'suspended' ? theme.warning : theme.danger}>
            {user.status}
          </Badge>
          <Badge color={user.role === 'admin' || user.role === 'superadmin' ? theme.accent.cyan : theme.text.secondary}>
            {user.role}
          </Badge>
          <Badge color={vipColor}>{user.vipTier}</Badge>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.kpiGrid}>
        <StatCard label="Balance" value={`${sol(user.availableAmount || 0)} SOL`} icon="💰" color={theme.accent.green} />
        <StatCard label="Locked" value={`${sol(user.lockedAmount || 0)} SOL`} icon="🔒" color={theme.warning} />
        <StatCard label="Level" value={user.level} icon="⭐" color={theme.accent.purple} />
        <StatCard label="Rounds" value={user.roundsPlayed ?? 0} icon="🎮" color={theme.accent.cyan} />
        <StatCard label="Wagered" value={`${sol(user.totalWagered || 0)} SOL`} icon="📊" color={theme.info} />
        <StatCard label="Won" value={`${sol(user.totalWon || 0)} SOL`} icon="🏆" color={theme.success} />
      </div>

      {/* Details */}
      <div style={styles.gridTwo}>
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Profile</h4>
          <DetailRow label="ID" value={user.id} mono />
          <DetailRow label="Best Multiplier" value={`${(user.bestMultiplier || 0).toFixed(1)}x`} />
          <DetailRow label="Win Rate" value={`${((user.winRate || 0) * 100).toFixed(1)}%`} />
          <DetailRow label="Bonus" value={`${sol(user.bonusAmount || 0)} SOL`} />
          <DetailRow label="Joined" value={new Date(user.createdAt).toLocaleString()} />
        </div>

        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Actions</h4>
          <div style={styles.actionGroup}>
            <label style={styles.actionLabel}>Status:</label>
            <div style={styles.actionRow}>
              {['active', 'suspended', 'banned'].map((s) => (
                <button
                  key={s}
                  style={{
                    ...styles.actionBtn,
                    background: user.status === s ? theme.accent.cyan + '22' : theme.bg.tertiary,
                    borderColor: user.status === s ? theme.accent.cyan : theme.border.medium,
                    color: user.status === s ? theme.accent.cyan : theme.text.secondary,
                  }}
                  onClick={() => handleStatusChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.actionGroup}>
            <label style={styles.actionLabel}>Role:</label>
            <div style={styles.actionRow}>
              {['player', 'admin', 'superadmin'].map((r) => (
                <button
                  key={r}
                  style={{
                    ...styles.actionBtn,
                    background: user.role === r ? theme.accent.purple + '22' : theme.bg.tertiary,
                    borderColor: user.role === r ? theme.accent.purple : theme.border.medium,
                    color: user.role === r ? theme.accent.purple : theme.text.secondary,
                  }}
                  onClick={() => handleRoleChange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button style={styles.adjustBtn} onClick={() => setAdjustModal(true)}>
            💰 Balance Adjustment
          </button>
        </div>
      </div>

      {/* Recent Bets */}
      {user.recentBets && user.recentBets.length > 0 && (
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Recent Bets</h4>
          <div style={styles.betList}>
            {user.recentBets.map((b) => (
              <div key={b.id} style={styles.betRow}>
                <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs, color: theme.text.muted }}>{b.id.slice(0, 8)}</span>
                <span style={{ color: theme.text.primary, fontWeight: 600 }}>{sol(b.amount)} SOL</span>
                <Badge color={b.riskTier === 'aggressive' ? theme.danger : b.riskTier === 'balanced' ? theme.warning : theme.info}>{b.riskTier}</Badge>
                <Badge color={b.status === 'settled' ? theme.success : theme.text.muted}>{b.status}</Badge>
                <span style={{ color: theme.text.muted, fontSize: theme.fontSize.xs }}>{new Date(b.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} title="Balance Adjustment" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={styles.formLabel}>
            Amount (SOL)
            <input style={styles.formInput} type="number" step="0.001" placeholder="e.g. 0.5 or -0.1" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
          </label>
          <label style={styles.formLabel}>
            Reason
            <input style={styles.formInput} placeholder="Reason for adjustment" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </label>
          <button style={styles.submitBtn} onClick={handleAdjustBalance}>Apply Adjustment</button>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}>{label}</span>
      <span style={{ color: theme.text.primary, fontSize: theme.fontSize.sm, fontFamily: mono ? 'monospace' : 'inherit', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '24px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  backBtn: {
    background: 'transparent', border: 'none', color: theme.accent.cyan,
    fontSize: theme.fontSize.sm, cursor: 'pointer', padding: 0, width: 'fit-content',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  username: { fontSize: theme.fontSize.xl, fontWeight: 700, color: theme.text.primary, margin: 0 },
  email: { color: theme.text.secondary, fontSize: theme.fontSize.sm, margin: '4px 0 0' },
  badges: { display: 'flex', gap: '8px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' },
  gridTwo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' },
  card: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg, padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  cardTitle: { fontSize: theme.fontSize.base, fontWeight: 600, color: theme.text.primary, margin: '0 0 8px' },
  actionGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' },
  actionLabel: { color: theme.text.secondary, fontSize: theme.fontSize.xs, fontWeight: 600, textTransform: 'uppercase' as const },
  actionRow: { display: 'flex', gap: '6px' },
  actionBtn: {
    padding: '5px 12px', border: '1px solid', borderRadius: theme.radius.sm,
    fontSize: theme.fontSize.xs, fontWeight: 600, textTransform: 'uppercase' as const, cursor: 'pointer',
  },
  adjustBtn: {
    padding: '8px 16px', background: theme.bg.tertiary, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.sm, cursor: 'pointer', textAlign: 'left' as const,
    marginTop: '8px',
  },
  betList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  betRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${theme.border.subtle}` },
  formLabel: { display: 'flex', flexDirection: 'column', gap: '4px', color: theme.text.secondary, fontSize: theme.fontSize.sm },
  formInput: {
    padding: '10px 12px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.base, outline: 'none',
  },
  submitBtn: {
    padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer', marginTop: '4px',
  },
};
