import { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminPagination } from './AdminPagination';
import { exportToCSV } from './csvExport';
import { s } from './adminStyles';

interface AdminUser { id: string; username: string; email: string | null; level: number; vipTier: string; status: string; role: string; createdAt: string; }

export function UsersTab() {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState({ amount: '', reason: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const searchUsers = async (q?: string, p = page, l = limit) => {
    try {
      const query = q ?? search;
      const res = await apiFetch<{ data: AdminUser[]; total: number }>(`/v1/admin/users?search=${encodeURIComponent(query)}&limit=${l}&offset=${p * l}`);
      setUsers(res.data); setTotal(res.total);
    } catch {}
  };

  useEffect(() => { searchUsers('', page, limit); }, [page, limit]);

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === users.length ? new Set() : new Set(users.map(u => u.id)));
  const bulkAction = async (status: string) => {
    if (!confirm(`${status} ${selected.size} users?`)) return;
    setBulkLoading(true);
    await Promise.all([...selected].map(id => apiFetch(`/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).catch(() => {})));
    toast.success(`${selected.size} users updated to ${status}`);
    setSelected(new Set()); searchUsers(); setBulkLoading(false);
  };

  const handleExport = () => {
    exportToCSV(
      ['Username', 'Email', 'Level', 'VIP', 'Status', 'Role', 'Created'],
      users.map(u => [u.username, u.email || '', u.level, u.vipTier, u.status, u.role, new Date(u.createdAt).toLocaleDateString()]),
      'tradegems_users',
    );
  };

  const changeStatus = async (userId: string, newStatus: string) => {
    setStatusLoading(userId);
    try {
      await apiFetch(`/v1/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      toast.success(`User ${newStatus}`);
    } catch { toast.error('Status change failed'); } finally { setStatusLoading(null); }
  };

  const loadDetail = async (userId: string) => {
    setSelectedLoading(true);
    try { const res = await apiFetch<any>(`/v1/admin/users/${userId}`); setSelectedUser(res); } catch {} finally { setSelectedLoading(false); }
  };

  const submitBalance = async (userId: string) => {
    try {
      const lamports = Math.round(parseFloat(balanceForm.amount) * 1e9);
      await apiFetch(`/v1/admin/users/${userId}/balance-adjustment`, { method: 'POST', body: JSON.stringify({ amount: lamports, reason: balanceForm.reason || 'Admin credit', asset: 'SOL' }) });
      setShowBalanceModal(null); setBalanceForm({ amount: '', reason: '' }); searchUsers();
      toast.success('Balance adjusted');
    } catch { toast.error('Adjustment failed'); }
  };

  return (
    <div>
      <AdminPageHeader title="Users" subtitle={`${total} users`} actions={
        <button onClick={handleExport} style={{ ...s.searchBtn, fontSize: 12, padding: '6px 14px' }}>Export CSV</button>
      } />

      {/* Search */}
      <div style={s.searchRow}>
        <input type="text" placeholder="Search by username or email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchUsers(); }} style={s.searchInput} />
        <button onClick={() => searchUsers()} style={s.searchBtn}>Search</button>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 8, marginTop: 8 }}>
          <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{selected.size} selected</span>
          <button onClick={() => bulkAction('active')} disabled={bulkLoading} style={s.actionBtnGreen}>Activate</button>
          <button onClick={() => bulkAction('suspended')} disabled={bulkLoading} style={s.actionBtnYellow}>Suspend</button>
          <button onClick={() => bulkAction('banned')} disabled={bulkLoading} style={s.actionBtnRed}>Ban</button>
          <button onClick={() => setSelected(new Set())} style={{ ...s.actionBtnPurple, marginLeft: 'auto' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ ...s.tableInfo, marginTop: 8 }}><span style={s.tableInfoText}>{total} users found</span></div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}><input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} /></th>
            <th style={s.th}>Username</th>{!isMobile && <th style={s.th}>Email</th>}<th style={s.th}>Lv</th><th style={s.th}>VIP</th><th style={s.th}>Status</th><th style={s.th}>Role</th>{!isMobile && <th style={s.th}>Created</th>}<th style={s.th}>Actions</th>
          </tr></thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ background: selected.has(user.id) ? 'rgba(139,92,246,0.04)' : undefined }}>
                <td style={s.td}><input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)} /></td>
                <td style={s.td}><span style={s.username}>{user.username}</span></td>
                {!isMobile && <td style={s.td}><span style={s.email}>{user.email || '--'}</span></td>}
                <td style={s.td}><span style={s.level}>{user.level}</span></td>
                <td style={s.td}><span style={{ ...s.vipBadge, color: (theme.vip as any)[user.vipTier] || theme.text.muted, borderColor: (theme.vip as any)[user.vipTier] || theme.border.subtle }}>{user.vipTier}</span></td>
                <td style={s.td}><span style={{ ...s.statusBadge, ...(user.status === 'active' ? s.statusActive : user.status === 'suspended' ? s.statusSuspended : user.status === 'banned' ? s.statusBanned : {}) }}>{user.status}</span></td>
                <td style={s.td}><span style={s.role}>{user.role}</span></td>
                {!isMobile && <td style={s.td}><span style={s.date}>{new Date(user.createdAt).toLocaleDateString()}</span></td>}
                <td style={s.td}>
                  <div style={s.actionBtns}>
                    {user.status !== 'active' && <button onClick={() => changeStatus(user.id, 'active')} disabled={statusLoading === user.id} style={s.actionBtnGreen}>Activate</button>}
                    {user.status !== 'suspended' && <button onClick={() => changeStatus(user.id, 'suspended')} disabled={statusLoading === user.id} style={s.actionBtnYellow}>Suspend</button>}
                    {user.status !== 'banned' && <button onClick={() => changeStatus(user.id, 'banned')} disabled={statusLoading === user.id} style={s.actionBtnRed}>Ban</button>}
                    <button onClick={() => setShowBalanceModal(user.id)} style={s.actionBtnPurple}>Credit</button>
                    <button onClick={() => loadDetail(user.id)} style={s.actionBtnBlue}>View</button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={isMobile ? 7 : 9} style={s.emptyTd}>No users found.</td></tr>}
          </tbody>
        </table>
        <AdminPagination total={total} page={page} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div style={s.modalOverlay} onClick={() => setSelectedUser(null)}>
          <div style={{ ...s.modalCard, maxWidth: 700, maxHeight: '85vh', overflow: 'auto', width: '95%' }} onClick={e => e.stopPropagation()}>
            {selectedLoading ? <div style={{ padding: 40, textAlign: 'center' as const, color: theme.text.muted }}>Loading...</div> : <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={s.modalTitle}>User Profile</div>
                <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: theme.text.muted, cursor: 'pointer', fontSize: 22 }}>X</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, background: theme.bg.tertiary, padding: 12, borderRadius: 8 }}>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Username</span><br /><span style={{ color: theme.text.primary, fontWeight: 700 }}>{selectedUser.username}</span></div>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Email</span><br /><span style={{ color: theme.text.primary }}>{selectedUser.email || 'N/A'}</span></div>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Role</span><br /><span style={{ color: '#8b5cf6', fontWeight: 600 }}>{selectedUser.role}</span></div>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Status</span><br /><span style={{ color: selectedUser.status === 'active' ? theme.success : theme.danger, fontWeight: 600 }}>{selectedUser.status}</span></div>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Level / VIP</span><br /><span style={{ color: theme.text.primary }}>Lv.{selectedUser.level} / {selectedUser.vipTier}</span></div>
                <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Registered</span><br /><span style={{ color: theme.text.primary }}>{new Date(selectedUser.createdAt).toLocaleString()}</span></div>
              </div>
              <div style={{ marginBottom: 16, background: theme.bg.tertiary, padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: theme.text.primary, marginBottom: 8, fontSize: 13 }}>BALANCE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Available</span><br /><span className="mono" style={{ color: theme.success, fontWeight: 700 }}>{formatSol(Number(selectedUser.availableAmount))} SOL</span></div>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Locked</span><br /><span className="mono" style={{ color: '#f59e0b', fontWeight: 700 }}>{formatSol(Number(selectedUser.lockedAmount))} SOL</span></div>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Pending</span><br /><span className="mono" style={{ color: theme.text.secondary }}>{formatSol(Number(selectedUser.pendingAmount))} SOL</span></div>
                </div>
              </div>
              <div style={{ marginBottom: 16, background: theme.bg.tertiary, padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: theme.text.primary, marginBottom: 8, fontSize: 13 }}>STATS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Rounds</span><br /><span className="mono" style={{ color: theme.text.primary }}>{selectedUser.roundsPlayed}</span></div>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Wagered</span><br /><span className="mono" style={{ color: theme.text.primary }}>{formatSol(Number(selectedUser.totalWagered))} SOL</span></div>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Won</span><br /><span className="mono" style={{ color: theme.success }}>{formatSol(Number(selectedUser.totalWon))} SOL</span></div>
                  <div><span style={{ color: theme.text.muted, fontSize: 12 }}>Best Multi</span><br /><span className="mono" style={{ color: '#8b5cf6' }}>{Number(selectedUser.bestMultiplier).toFixed(2)}x</span></div>
                </div>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      {showBalanceModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <div style={s.modalTitle}>Credit SOL to User</div>
            <input type="number" step="0.001" placeholder="Amount in SOL" value={balanceForm.amount} onChange={e => setBalanceForm(p => ({ ...p, amount: e.target.value }))} style={s.formInput} className="mono" />
            <input type="text" placeholder="Reason (optional)" value={balanceForm.reason} onChange={e => setBalanceForm(p => ({ ...p, reason: e.target.value }))} style={s.formInput} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => submitBalance(showBalanceModal)} style={s.actionBtnGreen}>Credit</button>
              <button onClick={() => setShowBalanceModal(null)} style={s.actionBtnRed}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
