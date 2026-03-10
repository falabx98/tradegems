import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface User {
  id: string;
  username: string;
  email: string;
  status: string;
  role: string;
  vipTier: string;
  level: number;
  createdAt: string;
}

export function UsersPage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userDetail, setUserDetail] = useState<Record<string, unknown> | null>(null);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers(s?: string) {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({ limit: 50, search: s || search || undefined });
      setUsers((res as { data: User[] }).data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function openUserDetail(user: User) {
    setSelectedUser(user);
    try {
      const detail = await adminApi.getUserDetail(user.id);
      setUserDetail(detail as Record<string, unknown>);
    } catch {
      setUserDetail(null);
    }
  }

  async function handleStatusChange(userId: string, status: string) {
    try {
      await adminApi.updateUser(userId, { status });
      addToast(`Status changed to ${status}`);
      loadUsers();
      setSelectedUser(null);
    } catch {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await adminApi.updateUser(userId, { role });
      addToast(`Role changed to ${role}`);
      loadUsers();
      setSelectedUser(null);
    } catch {
      addToast('Failed to update role', 'error');
    }
  }

  async function handleAdjustBalance() {
    if (!selectedUser || !adjustAmount) return;
    try {
      await adminApi.adjustBalance(selectedUser.id, {
        amount: Math.round(parseFloat(adjustAmount) * 1_000_000_000),
        reason: adjustReason || 'Admin adjustment',
      });
      addToast('Balance adjusted');
      setAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      openUserDetail(selectedUser);
    } catch {
      addToast('Failed to adjust balance', 'error');
    }
  }

  function handleRowClick(user: User) {
    navigate(`/users/${user.id}`);
  }

  const vipColor = (tier: string) => {
    const map: Record<string, string> = theme.vip;
    return map[tier] || theme.text.muted;
  };

  const isBot = (u: User) => u.email.endsWith('@tradesol.bot');
  const realUsers = users.filter((u) => !isBot(u) && u.role === 'player');
  const botCount = users.filter(isBot).length;

  const columns: Column<User>[] = [
    {
      key: 'username',
      label: 'Username',
      render: (u) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: theme.text.primary }}>{u.username}</span>
          {isBot(u) && (
            <span style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              color: theme.accent.purple,
              border: `1px solid ${theme.accent.purple}`,
              borderRadius: theme.radius.sm,
              padding: '1px 5px',
              letterSpacing: '0.5px',
            }}>BOT</span>
          )}
        </span>
      ),
    },
    { key: 'email', label: 'Email' },
    {
      key: 'status',
      label: 'Status',
      render: (u) => {
        const c = u.status === 'active' ? theme.success : u.status === 'suspended' ? theme.warning : theme.danger;
        return (
          <span style={{ color: c, fontWeight: 600, fontSize: theme.fontSize.xs, textTransform: 'uppercase' }}>
            {u.status}
          </span>
        );
      },
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) => (
        <span style={{ fontSize: theme.fontSize.xs, color: u.role === 'admin' || u.role === 'superadmin' ? theme.accent.cyan : theme.text.secondary }}>
          {u.role}
        </span>
      ),
    },
    {
      key: 'vipTier',
      label: 'VIP',
      render: (u) => (
        <span style={{ color: vipColor(u.vipTier), fontWeight: 600, fontSize: theme.fontSize.xs, textTransform: 'uppercase' }}>
          {u.vipTier}
        </span>
      ),
    },
    { key: 'level', label: 'Lvl' },
    {
      key: 'createdAt',
      label: 'Joined',
      render: (u) => new Date(u.createdAt).toLocaleDateString(),
    },
  ];

  const detail = userDetail as Record<string, unknown> | null;

  return (
    <div style={styles.page}>
      {/* User counters */}
      <div style={styles.counters}>
        <span style={styles.counterBadge}>
          <span style={{ color: theme.text.secondary }}>Total:</span>{' '}
          <span style={{ color: theme.text.primary, fontWeight: 600 }}>{users.length}</span>
        </span>
        <span style={styles.counterBadge}>
          <span style={{ color: theme.text.secondary }}>Real Users:</span>{' '}
          <span style={{ color: theme.success, fontWeight: 600 }}>{realUsers.length}</span>
        </span>
        <span style={styles.counterBadge}>
          <span style={{ color: theme.text.secondary }}>Bots:</span>{' '}
          <span style={{ color: theme.accent.purple, fontWeight: 600 }}>{botCount}</span>
        </span>
      </div>

      {/* Search bar */}
      <div style={styles.searchBar}>
        <input
          style={styles.searchInput}
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadUsers(search)}
        />
        <button style={styles.searchBtn} onClick={() => loadUsers(search)}>
          Search
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading users...</div>
      ) : (
        <DataTable columns={columns} data={users} onRowClick={handleRowClick} />
      )}

      {/* User Detail Modal */}
      <Modal
        open={!!selectedUser}
        onClose={() => { setSelectedUser(null); setUserDetail(null); }}
        title={`User: ${selectedUser?.username || ''}`}
        width={560}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={styles.detailGrid}>
              <DetailRow label="ID" value={selectedUser.id} mono />
              <DetailRow label="Email" value={selectedUser.email} />
              <DetailRow label="Status" value={selectedUser.status} />
              <DetailRow label="Role" value={selectedUser.role} />
              <DetailRow label="VIP Tier" value={selectedUser.vipTier} />
              <DetailRow label="Level" value={String(selectedUser.level)} />
              {detail && (
                <>
                  <DetailRow label="Available" value={`${((detail.availableAmount as number) || 0) / 1e9} SOL`} />
                  <DetailRow label="Locked" value={`${((detail.lockedAmount as number) || 0) / 1e9} SOL`} />
                  <DetailRow label="Rounds Played" value={String((detail.roundsPlayed as number) ?? 0)} />
                  <DetailRow label="Total Wagered" value={`${((detail.totalWagered as number) || 0) / 1e9} SOL`} />
                  <DetailRow label="Total Won" value={`${((detail.totalWon as number) || 0) / 1e9} SOL`} />
                </>
              )}
            </div>

            <div style={styles.actions}>
              <h4 style={styles.actionsTitle}>Actions</h4>
              <div style={styles.actionRow}>
                <label style={styles.actionLabel}>Status:</label>
                {['active', 'suspended', 'banned'].map((s) => (
                  <button
                    key={s}
                    style={{
                      ...styles.actionBtn,
                      background: selectedUser.status === s ? theme.accent.cyan + '22' : theme.bg.tertiary,
                      borderColor: selectedUser.status === s ? theme.accent.cyan : theme.border.medium,
                      color: selectedUser.status === s ? theme.accent.cyan : theme.text.secondary,
                    }}
                    onClick={() => handleStatusChange(selectedUser.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div style={styles.actionRow}>
                <label style={styles.actionLabel}>Role:</label>
                {['player', 'admin', 'superadmin'].map((r) => (
                  <button
                    key={r}
                    style={{
                      ...styles.actionBtn,
                      background: selectedUser.role === r ? theme.accent.purple + '22' : theme.bg.tertiary,
                      borderColor: selectedUser.role === r ? theme.accent.purple : theme.border.medium,
                      color: selectedUser.role === r ? theme.accent.purple : theme.text.secondary,
                    }}
                    onClick={() => handleRoleChange(selectedUser.id, r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                style={styles.adjustBtn}
                onClick={() => setAdjustModal(true)}
              >
                💰 Balance Adjustment
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Balance Adjustment Modal */}
      <Modal
        open={adjustModal}
        onClose={() => setAdjustModal(false)}
        title="Balance Adjustment"
        width={400}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={styles.formLabel}>
            Amount (SOL)
            <input
              style={styles.formInput}
              type="number"
              step="0.001"
              placeholder="e.g. 0.5 or -0.1"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
            />
          </label>
          <label style={styles.formLabel}>
            Reason
            <input
              style={styles.formInput}
              placeholder="Reason for adjustment"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </label>
          <button style={styles.submitBtn} onClick={handleAdjustBalance}>
            Apply Adjustment
          </button>
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
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  counters: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  counterBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    fontSize: theme.fontSize.sm,
  },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  searchBar: { display: 'flex', gap: '8px' },
  searchInput: {
    flex: 1,
    padding: '10px 14px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: theme.fontSize.base,
    outline: 'none',
  },
  searchBtn: {
    padding: '10px 20px',
    background: theme.accent.cyan,
    border: 'none',
    borderRadius: theme.radius.md,
    color: theme.text.inverse,
    fontWeight: 600,
    fontSize: theme.fontSize.base,
    cursor: 'pointer',
  },
  detailGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    background: theme.bg.card,
    padding: '12px 16px',
    borderRadius: theme.radius.md,
  },
  actions: { display: 'flex', flexDirection: 'column', gap: '10px' },
  actionsTitle: { color: theme.text.primary, fontSize: theme.fontSize.base, fontWeight: 600, margin: 0 },
  actionRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  actionLabel: { color: theme.text.secondary, fontSize: theme.fontSize.sm, minWidth: '50px' },
  actionBtn: {
    padding: '5px 12px',
    border: '1px solid',
    borderRadius: theme.radius.sm,
    fontSize: theme.fontSize.xs,
    fontWeight: 600,
    textTransform: 'uppercase',
    cursor: 'pointer',
    background: theme.bg.tertiary,
  },
  adjustBtn: {
    padding: '8px 16px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: theme.fontSize.sm,
    cursor: 'pointer',
    textAlign: 'left',
  },
  formLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: theme.text.secondary,
    fontSize: theme.fontSize.sm,
  },
  formInput: {
    padding: '10px 12px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: theme.fontSize.base,
    outline: 'none',
  },
  submitBtn: {
    padding: '10px',
    background: theme.gradient.solana,
    border: 'none',
    borderRadius: theme.radius.md,
    color: '#fff',
    fontWeight: 600,
    fontSize: theme.fontSize.base,
    cursor: 'pointer',
    marginTop: '4px',
  },
};
