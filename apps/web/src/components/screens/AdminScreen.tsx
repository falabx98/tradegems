import { useState, useEffect } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { formatSol } from '../../utils/sol';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface DashboardStats {
  roundsToday: number;
  betVolumeToday: number;
  revenue24h: number;
  activeUsers: number;
  totalUsers: number;
  houseEdge: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  level: number;
  vipTier: string;
  status: string;
  role: string;
  createdAt: string;
}

interface TreasuryOverview {
  address: string;
  balanceSol: number;
  totalDeposits: number;
  totalDepositAmount: number;
  totalWithdrawals: number;
  totalWithdrawalAmount: number;
  pendingWithdrawals: number;
}

interface AuditLog {
  id: number;
  actorUsername: string;
  actionType: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userTotal, setUserTotal] = useState(0);
  const [treasury, setTreasury] = useState<TreasuryOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'treasury' | 'deposits' | 'withdrawals' | 'games' | 'bonuses' | 'logs'>('overview');
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  // Deposits
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [depositsFilter, setDepositsFilter] = useState('');
  // Withdrawals
  const [withdrawalsList, setWithdrawalsList] = useState<any[]>([]);
  const [withdrawalsFilter, setWithdrawalsFilter] = useState('');
  const [withdrawalLoading, setWithdrawalLoading] = useState<string | null>(null);
  // Games/Rounds
  const [roundsList, setRoundsList] = useState<any[]>([]);
  const [roundsFilter, setRoundsFilter] = useState('');
  const [selectedRound, setSelectedRound] = useState<any | null>(null);
  // Bonus Codes
  const [bonusCodesList, setBonusCodesList] = useState<any[]>([]);
  const [showCreateBonus, setShowCreateBonus] = useState(false);
  const [newBonusForm, setNewBonusForm] = useState({ code: '', amountSol: '', maxUses: '100', description: '', expiresAt: '' });
  // Balance adjustment modal
  const [showBalanceModal, setShowBalanceModal] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState({ amount: '', reason: '' });

  // Check admin access
  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ role: string }>('/v1/users/me');
        if (me.role === 'admin' || me.role === 'superadmin') {
          setIsAdmin(true);
          const [dashStats, treasuryData, logs] = await Promise.all([
            apiFetch<DashboardStats>('/v1/admin/dashboard/stats'),
            apiFetch<TreasuryOverview>('/v1/admin/treasury/overview'),
            apiFetch<{ data: AuditLog[] }>('/v1/admin/audit-logs?limit=20'),
          ]);
          setStats(dashStats);
          setTreasury(treasuryData);
          setAuditLogs(logs.data);
        }
      } catch {
        /* not admin */
      }
      setLoading(false);
    })();
  }, []);

  // Search users
  const searchUsers = async (query?: string) => {
    try {
      const q = query ?? userSearch;
      const res = await apiFetch<{ data: AdminUser[]; total: number }>(
        `/v1/admin/users?search=${encodeURIComponent(q)}&limit=25&offset=0`,
      );
      setUsers(res.data);
      setUserTotal(res.total);
    } catch (err) {
      console.error('User search failed:', err);
    }
  };

  // Load users when switching to users tab
  useEffect(() => {
    if (activeTab === 'users' && isAdmin && users.length === 0) {
      searchUsers('');
    }
  }, [activeTab, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeTab === 'deposits' && isAdmin) loadDeposits(depositsFilter || undefined); }, [activeTab, depositsFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'withdrawals' && isAdmin) loadWithdrawals(withdrawalsFilter || undefined); }, [activeTab, withdrawalsFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'games' && isAdmin) loadRounds(roundsFilter || undefined); }, [activeTab, roundsFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'bonuses' && isAdmin) loadBonusCodes(); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change user status
  const changeUserStatus = async (userId: string, newStatus: string) => {
    setStatusLoading(userId);
    try {
      await apiFetch(`/v1/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)),
      );
    } catch (err) {
      console.error('Status change failed:', err);
    } finally {
      setStatusLoading(null);
    }
  };

  const loadDeposits = async (status?: string) => {
    try {
      const q = status ? `?status=${status}` : '';
      const res = await apiFetch<{ data: any[] }>(`/v1/admin/treasury/deposits${q}`);
      setDepositsList(res.data || []);
    } catch {}
  };

  const loadWithdrawals = async (status?: string) => {
    try {
      const q = status ? `?status=${status}` : '';
      const res = await apiFetch<{ data: any[] }>(`/v1/admin/treasury/withdrawals${q}`);
      setWithdrawalsList(res.data || []);
    } catch {}
  };

  const handleWithdrawalAction = async (id: string, action: 'approved' | 'rejected') => {
    setWithdrawalLoading(id);
    try {
      await apiFetch(`/v1/admin/treasury/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: action }) });
      loadWithdrawals(withdrawalsFilter || undefined);
    } catch {} finally { setWithdrawalLoading(null); }
  };

  const loadRounds = async (status?: string) => {
    try {
      const q = status ? `?status=${status}&limit=50` : '?limit=50';
      const res = await apiFetch<{ data: any[] }>(`/v1/admin/rounds${q}`);
      setRoundsList(res.data || []);
    } catch {}
  };

  const loadRoundDetails = async (id: string) => {
    try {
      const res = await apiFetch<any>(`/v1/admin/rounds/${id}`);
      setSelectedRound(res);
    } catch {}
  };

  const loadBonusCodes = async () => {
    try {
      const res = await apiFetch<{ data: any[] }>('/v1/admin/bonus-codes');
      setBonusCodesList(res.data || []);
    } catch {}
  };

  const createBonusCode = async () => {
    try {
      const amountLamports = Math.round(parseFloat(newBonusForm.amountSol) * 1_000_000_000);
      await apiFetch('/v1/admin/bonus-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: newBonusForm.code,
          amountLamports,
          maxUses: parseInt(newBonusForm.maxUses) || 100,
          description: newBonusForm.description,
          expiresAt: newBonusForm.expiresAt || undefined,
        }),
      });
      setShowCreateBonus(false);
      setNewBonusForm({ code: '', amountSol: '', maxUses: '100', description: '', expiresAt: '' });
      loadBonusCodes();
    } catch {}
  };

  const toggleBonusCode = async (id: string, currentActive: boolean) => {
    try {
      await apiFetch(`/v1/admin/bonus-codes/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !currentActive }) });
      loadBonusCodes();
    } catch {}
  };

  const submitBalanceAdjustment = async (userId: string) => {
    try {
      const lamports = Math.round(parseFloat(balanceForm.amount) * 1_000_000_000);
      await apiFetch(`/v1/admin/users/${userId}/balance-adjustment`, {
        method: 'POST',
        body: JSON.stringify({ amount: lamports, reason: balanceForm.reason || 'Admin credit', asset: 'SOL' }),
      });
      setShowBalanceModal(null);
      setBalanceForm({ amount: '', reason: '' });
      searchUsers();
    } catch {}
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingWrap}>
          <span style={styles.loadingText}>Checking access...</span>
        </div>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.accessDenied}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.danger} strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span style={styles.accessDeniedTitle}>Access Denied</span>
          <span style={styles.accessDeniedDesc}>This page is restricted to admin users.</span>
          <button onClick={() => go('settings')} style={styles.backBtnLarge}>
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  const TABS: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users' },
    { key: 'treasury', label: 'Treasury' },
    { key: 'deposits', label: 'Deposits' },
    { key: 'withdrawals', label: 'Withdrawals' },
    { key: 'games', label: 'Games' },
    { key: 'bonuses', label: 'Bonuses' },
    { key: 'logs', label: 'Audit Logs' },
  ];

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => go('settings')} style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={styles.headerTitle}>Admin Dashboard</span>
        <div style={{ width: '36px' }} />
      </div>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* ─── Overview Tab ──────────────────────────────────────────── */}
        {activeTab === 'overview' && stats && (
          <>
            <div style={{
              ...styles.statsGrid,
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            }}>
              <StatCard label="Total Users" value={stats.totalUsers.toLocaleString()} />
              <StatCard label="Revenue 24h" value={`${formatSol(stats.revenue24h)} SOL`} color={theme.success} />
              <StatCard label="Bet Volume" value={`${formatSol(stats.betVolumeToday)} SOL`} color="#c084fc" />
              <StatCard label="Active Users" value={stats.activeUsers.toLocaleString()} color={theme.info} />
              <StatCard label="House Edge" value={`${(stats.houseEdge * 100).toFixed(2)}%`} color={theme.warning} />
              <StatCard label="Rounds Today" value={stats.roundsToday.toLocaleString()} />
            </div>
          </>
        )}

        {/* ─── Users Tab ────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <>
            <div style={styles.searchRow}>
              <input
                type="text"
                placeholder="Search users by username or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchUsers(); }}
                style={styles.searchInput}
              />
              <button onClick={() => searchUsers()} style={styles.searchBtn}>
                Search
              </button>
            </div>
            <div style={styles.tableInfo}>
              <span style={styles.tableInfoText}>{userTotal} users found</span>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Username</th>
                    {!isMobile && <th style={styles.th}>Email</th>}
                    <th style={styles.th}>Lv</th>
                    <th style={styles.th}>VIP</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Role</th>
                    {!isMobile && <th style={styles.th}>Created</th>}
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td style={styles.td}>
                        <span style={styles.username}>{user.username}</span>
                      </td>
                      {!isMobile && (
                        <td style={styles.td}>
                          <span style={styles.email}>{user.email || '--'}</span>
                        </td>
                      )}
                      <td style={styles.td}>
                        <span style={styles.level}>{user.level}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.vipBadge,
                          color: (theme.vip as any)[user.vipTier] || theme.text.muted,
                          borderColor: (theme.vip as any)[user.vipTier] || theme.border.subtle,
                        }}>
                          {user.vipTier}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          ...(user.status === 'active' ? styles.statusActive : {}),
                          ...(user.status === 'suspended' ? styles.statusSuspended : {}),
                          ...(user.status === 'banned' ? styles.statusBanned : {}),
                        }}>
                          {user.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.role}>{user.role}</span>
                      </td>
                      {!isMobile && (
                        <td style={styles.td}>
                          <span style={styles.date}>
                            {new Date(user.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                      )}
                      <td style={styles.td}>
                        <div style={styles.actionBtns}>
                          {user.status !== 'active' && (
                            <button
                              onClick={() => changeUserStatus(user.id, 'active')}
                              disabled={statusLoading === user.id}
                              style={styles.actionBtnGreen}
                            >
                              Activate
                            </button>
                          )}
                          {user.status !== 'suspended' && (
                            <button
                              onClick={() => changeUserStatus(user.id, 'suspended')}
                              disabled={statusLoading === user.id}
                              style={styles.actionBtnYellow}
                            >
                              Suspend
                            </button>
                          )}
                          {user.status !== 'banned' && (
                            <button
                              onClick={() => changeUserStatus(user.id, 'banned')}
                              disabled={statusLoading === user.id}
                              style={styles.actionBtnRed}
                            >
                              Ban
                            </button>
                          )}
                          <button
                            onClick={() => setShowBalanceModal(user.id)}
                            style={styles.actionBtnPurple}
                          >
                            Credit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={isMobile ? 6 : 8} style={styles.emptyTd}>
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {showBalanceModal && (
              <div style={styles.modalOverlay}>
                <div style={styles.modalCard}>
                  <div style={styles.modalTitle}>Credit SOL to User</div>
                  <input type="number" step="0.001" placeholder="Amount in SOL" value={balanceForm.amount} onChange={(e) => setBalanceForm(prev => ({ ...prev, amount: e.target.value }))} style={styles.formInput} className="mono" />
                  <input type="text" placeholder="Reason (optional)" value={balanceForm.reason} onChange={(e) => setBalanceForm(prev => ({ ...prev, reason: e.target.value }))} style={styles.formInput} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button onClick={() => submitBalanceAdjustment(showBalanceModal)} style={styles.actionBtnGreen}>Credit</button>
                    <button onClick={() => setShowBalanceModal(null)} style={styles.actionBtnRed}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── Treasury Tab ─────────────────────────────────────────── */}
        {activeTab === 'treasury' && treasury && (
          <div style={{
            ...styles.statsGrid,
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          }}>
            <StatCard label="Treasury Address" value={treasury.address.slice(0, 6) + '...' + treasury.address.slice(-4)} mono />
            <StatCard label="SOL Balance" value={`${treasury.balanceSol.toFixed(4)} SOL`} color={theme.success} />
            <StatCard label="Total Deposits" value={treasury.totalDeposits.toLocaleString()} />
            <StatCard label="Deposit Amount" value={`${formatSol(treasury.totalDepositAmount)} SOL`} color="#c084fc" />
            <StatCard label="Total Withdrawals" value={treasury.totalWithdrawals.toLocaleString()} />
            <StatCard label="Pending Withdrawals" value={treasury.pendingWithdrawals.toLocaleString()} color={theme.warning} />
          </div>
        )}

        {/* ─── Deposits Tab ────────────────────────────────────────── */}
        {activeTab === 'deposits' && (
          <div className="card-enter">
            <div style={styles.filterRow}>
              {['', 'pending', 'confirmed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setDepositsFilter(f)}
                  style={depositsFilter === f ? styles.filterBtnActive : styles.filterBtn}
                >
                  {f || 'All'}
                </button>
              ))}
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Username</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Tx Hash</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {depositsList.map((d: any) => (
                    <tr key={d.id}>
                      <td style={styles.td}>
                        <span style={styles.username}>{d.username || d.userId?.slice(0, 8)}</span>
                      </td>
                      <td style={styles.td}>
                        <span className="mono" style={{ color: theme.success, fontWeight: 700, fontSize: '13px' }}>
                          {(Number(d.amount) / 1e9).toFixed(4)} SOL
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.target}>{d.txHash ? d.txHash.slice(0, 12) + '...' : '--'}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          ...(d.status === 'confirmed' ? styles.statusActive : {}),
                          ...(d.status === 'pending' ? styles.statusSuspended : {}),
                        }}>
                          {d.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.date}>{new Date(d.createdAt).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                  {depositsList.length === 0 && (
                    <tr>
                      <td colSpan={5} style={styles.emptyTd}>No deposits found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Withdrawals Tab ────────────────────────────────────── */}
        {activeTab === 'withdrawals' && (
          <div className="card-enter">
            <div style={styles.filterRow}>
              {['', 'pending_review', 'approved', 'rejected', 'completed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setWithdrawalsFilter(f)}
                  style={withdrawalsFilter === f ? styles.filterBtnActive : styles.filterBtn}
                >
                  {f ? f.replace('_', ' ') : 'All'}
                </button>
              ))}
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Username</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Destination</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Risk Score</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalsList.map((w: any) => (
                    <tr key={w.id}>
                      <td style={styles.td}>
                        <span style={styles.username}>{w.username || w.userId?.slice(0, 8)}</span>
                      </td>
                      <td style={styles.td}>
                        <span className="mono" style={{ color: theme.danger, fontWeight: 700, fontSize: '13px' }}>
                          {(Number(w.amount) / 1e9).toFixed(4)} SOL
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.target}>{w.destination ? w.destination.slice(0, 12) + '...' : '--'}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          ...(w.status === 'completed' || w.status === 'approved' ? styles.statusActive : {}),
                          ...(w.status === 'pending_review' ? styles.statusSuspended : {}),
                          ...(w.status === 'rejected' ? styles.statusBanned : {}),
                        }}>
                          {w.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: (w.riskScore ?? 0) > 50 ? theme.danger : theme.text.muted, fontWeight: 700, fontSize: '13px' }}>
                          {w.riskScore ?? '--'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.date}>{new Date(w.createdAt).toLocaleString()}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionBtns}>
                          {w.status === 'pending_review' && (
                            <>
                              <button
                                onClick={() => handleWithdrawalAction(w.id, 'approved')}
                                disabled={withdrawalLoading === w.id}
                                style={styles.actionBtnGreen}
                              >
                                {withdrawalLoading === w.id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleWithdrawalAction(w.id, 'rejected')}
                                disabled={withdrawalLoading === w.id}
                                style={styles.actionBtnRed}
                              >
                                {withdrawalLoading === w.id ? '...' : 'Reject'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {withdrawalsList.length === 0 && (
                    <tr>
                      <td colSpan={7} style={styles.emptyTd}>No withdrawals found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Games Tab ──────────────────────────────────────────── */}
        {activeTab === 'games' && (
          <div className="card-enter">
            <div style={styles.filterRow}>
              {['', 'resolved', 'active', 'started'].map((f) => (
                <button
                  key={f}
                  onClick={() => setRoundsFilter(f)}
                  style={roundsFilter === f ? styles.filterBtnActive : styles.filterBtn}
                >
                  {f || 'All'}
                </button>
              ))}
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Mode</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Players</th>
                    <th style={styles.th}>Duration</th>
                    <th style={styles.th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {roundsList.map((r: any) => (
                    <>
                      <tr key={r.id} onClick={() => {
                        if (selectedRound?.id === r.id) {
                          setSelectedRound(null);
                        } else {
                          loadRoundDetails(r.id);
                        }
                      }} style={{ cursor: 'pointer' }}>
                        <td style={styles.td}>
                          <span style={styles.target}>{r.id.slice(0, 8)}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 700, color: '#c084fc', fontSize: '12px', textTransform: 'uppercase' as const }}>{r.mode || '--'}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            ...(r.status === 'resolved' ? styles.statusActive : {}),
                            ...(r.status === 'active' || r.status === 'started' ? styles.statusSuspended : {}),
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 700, color: theme.text.primary, fontSize: '13px' }}>{r.playerCount ?? r.players ?? '--'}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.date}>{r.durationSeconds ? `${r.durationSeconds}s` : '--'}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.date}>{new Date(r.createdAt).toLocaleString()}</span>
                        </td>
                      </tr>
                      {selectedRound?.id === r.id && (
                        <tr key={`${r.id}-details`}>
                          <td colSpan={6} style={{ ...styles.td, background: 'rgba(153, 69, 255, 0.04)', padding: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px', fontSize: '13px' }}>
                              <span style={{ color: theme.text.muted }}>
                                <strong style={{ color: '#c084fc' }}>Round ID:</strong> {selectedRound.id}
                              </span>
                              {selectedRound.bets && (
                                <span style={{ color: theme.text.muted }}>
                                  <strong style={{ color: '#c084fc' }}>Bets:</strong> {selectedRound.bets.length}
                                </span>
                              )}
                              {selectedRound.result && (
                                <span style={{ color: theme.text.muted }}>
                                  <strong style={{ color: '#c084fc' }}>Result:</strong> {JSON.stringify(selectedRound.result)}
                                </span>
                              )}
                              {selectedRound.resolvedAt && (
                                <span style={{ color: theme.text.muted }}>
                                  <strong style={{ color: '#c084fc' }}>Resolved At:</strong> {new Date(selectedRound.resolvedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {roundsList.length === 0 && (
                    <tr>
                      <td colSpan={6} style={styles.emptyTd}>No rounds found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Bonuses Tab ────────────────────────────────────────── */}
        {activeTab === 'bonuses' && (
          <div className="card-enter">
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => setShowCreateBonus(!showCreateBonus)} style={styles.searchBtn}>
                {showCreateBonus ? 'Cancel' : 'Create Bonus Code'}
              </button>
            </div>
            {showCreateBonus && (
              <div style={styles.createFormCard}>
                <div style={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.formLabel}>Code</div>
                    <input type="text" placeholder="e.g. WELCOME100" value={newBonusForm.code} onChange={(e) => setNewBonusForm(prev => ({ ...prev, code: e.target.value }))} style={styles.formInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.formLabel}>Amount (SOL)</div>
                    <input type="number" step="0.001" placeholder="0.05" value={newBonusForm.amountSol} onChange={(e) => setNewBonusForm(prev => ({ ...prev, amountSol: e.target.value }))} style={styles.formInput} className="mono" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.formLabel}>Max Uses</div>
                    <input type="number" placeholder="100" value={newBonusForm.maxUses} onChange={(e) => setNewBonusForm(prev => ({ ...prev, maxUses: e.target.value }))} style={styles.formInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.formLabel}>Expires At</div>
                    <input type="datetime-local" value={newBonusForm.expiresAt} onChange={(e) => setNewBonusForm(prev => ({ ...prev, expiresAt: e.target.value }))} style={styles.formInput} />
                  </div>
                </div>
                <div>
                  <div style={styles.formLabel}>Description</div>
                  <input type="text" placeholder="Optional description" value={newBonusForm.description} onChange={(e) => setNewBonusForm(prev => ({ ...prev, description: e.target.value }))} style={styles.formInput} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={createBonusCode} style={styles.actionBtnGreen}>Create</button>
                  <button onClick={() => setShowCreateBonus(false)} style={styles.actionBtnRed}>Cancel</button>
                </div>
              </div>
            )}
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Code</th>
                    <th style={styles.th}>Description</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Used/Max</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Expires</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusCodesList.map((b: any) => (
                    <tr key={b.id}>
                      <td style={styles.td}>
                        <span className="mono" style={{ fontWeight: 700, color: '#c084fc', fontSize: '13px' }}>{b.code}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: theme.text.muted, fontSize: '12px' }}>{b.description || '--'}</span>
                      </td>
                      <td style={styles.td}>
                        <span className="mono" style={{ color: theme.success, fontWeight: 700, fontSize: '13px' }}>
                          {(Number(b.amountLamports) / 1e9).toFixed(4)} SOL
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: 700, color: theme.text.primary, fontSize: '13px' }}>
                          {b.usedCount ?? 0}/{b.maxUses}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          ...(b.active ? styles.statusActive : styles.statusBanned),
                        }}>
                          {b.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.date}>{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : 'Never'}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.date}>{new Date(b.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => toggleBonusCode(b.id, b.active)}
                          style={b.active ? styles.actionBtnRed : styles.actionBtnGreen}
                        >
                          {b.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bonusCodesList.length === 0 && (
                    <tr>
                      <td colSpan={8} style={styles.emptyTd}>No bonus codes found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Audit Logs Tab ───────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Actor</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={styles.td}>
                      <span style={styles.username}>{log.actorUsername}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.actionType}>{log.actionType}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.target}>
                        {log.targetType}{log.targetId ? `: ${log.targetId.slice(0, 8)}...` : ''}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.date}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={styles.emptyTd}>
                      No audit logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card Sub-Component ─────────────────────────────────────────────────

function StatCard({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <span
        style={{
          ...styles.statValue,
          ...(color ? { color } : {}),
        }}
        className={mono ? 'mono' : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
  },

  // Loading / Access Denied
  loadingWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  loadingText: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  accessDenied: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
  },
  accessDeniedTitle: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.danger,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '1px',
    marginTop: '8px',
  },
  accessDeniedDesc: {
    fontSize: '14px',
    color: theme.text.muted,
  },
  backBtnLarge: {
    marginTop: '12px',
    padding: '10px 24px',
    background: 'rgba(153, 69, 255, 0.15)',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: theme.bg.secondary,
    color: theme.text.secondary,
    cursor: 'pointer',
  },
  headerTitle: {
    flex: 1,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '1px',
    textAlign: 'center',
  },

  // Tabs
  tabRow: {
    display: 'flex',
    gap: '2px',
    background: theme.bg.secondary,
    borderRadius: '10px',
    padding: '3px',
    border: `1px solid ${theme.border.subtle}`,
    marginBottom: '16px',
    overflowX: 'auto',
  },
  tab: {
    flex: 1,
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.muted,
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
  },
  tabActive: {
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
  },

  // Content
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },

  // Stats Grid
  statsGrid: {
    display: 'grid',
    gap: '10px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '0.5px',
    wordBreak: 'break-all',
  },

  // Search
  searchRow: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.primary,
    outline: 'none',
    fontFamily: 'Rajdhani, sans-serif',
    minWidth: 0,
  },
  searchBtn: {
    padding: '10px 20px',
    background: 'rgba(153, 69, 255, 0.15)',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '14px',
    fontWeight: 700,
    color: '#c084fc',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  tableInfo: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  tableInfoText: {
    fontSize: '12px',
    color: theme.text.muted,
  },

  // Table
  tableWrap: {
    overflow: 'auto',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
    fontFamily: 'Rajdhani, sans-serif',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    verticalAlign: 'middle',
  },
  emptyTd: {
    padding: '24px 12px',
    textAlign: 'center',
    color: theme.text.muted,
    fontSize: '13px',
  },

  // Cell styles
  username: {
    fontWeight: 700,
    color: theme.text.primary,
    fontSize: '13px',
  },
  email: {
    color: theme.text.muted,
    fontSize: '12px',
  },
  level: {
    fontWeight: 700,
    color: '#c084fc',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  vipBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statusActive: {
    background: 'rgba(52, 211, 153, 0.1)',
    color: theme.success,
    border: '1px solid rgba(52, 211, 153, 0.25)',
  },
  statusSuspended: {
    background: 'rgba(251, 191, 36, 0.1)',
    color: theme.warning,
    border: '1px solid rgba(251, 191, 36, 0.25)',
  },
  statusBanned: {
    background: 'rgba(248, 113, 113, 0.1)',
    color: theme.danger,
    border: '1px solid rgba(248, 113, 113, 0.25)',
  },
  role: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  date: {
    fontSize: '12px',
    color: theme.text.muted,
    whiteSpace: 'nowrap',
  },
  actionBtns: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  actionBtnGreen: {
    padding: '3px 8px',
    background: 'rgba(52, 211, 153, 0.1)',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    borderRadius: '4px',
    color: theme.success,
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  actionBtnYellow: {
    padding: '3px 8px',
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.25)',
    borderRadius: '4px',
    color: theme.warning,
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  actionBtnRed: {
    padding: '3px 8px',
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.25)',
    borderRadius: '4px',
    color: theme.danger,
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  actionBtnPurple: {
    padding: '3px 8px',
    background: 'rgba(153, 69, 255, 0.1)',
    border: '1px solid rgba(153, 69, 255, 0.25)',
    borderRadius: '4px',
    color: '#c084fc',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },

  // Filter row
  filterRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  filterBtn: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#6b6b8a',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  filterBtnActive: {
    padding: '6px 14px',
    background: 'rgba(153, 69, 255, 0.15)',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: '6px',
    color: '#c084fc',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(14, 10, 22, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '24px',
    background: '#1c142a',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '12px',
    width: '360px',
    maxWidth: '90vw',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },

  // Forms
  formInput: {
    width: '100%',
    padding: '10px 12px',
    background: '#111118',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'Rajdhani, sans-serif',
    boxSizing: 'border-box',
  },
  createFormCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    background: 'rgba(153, 69, 255, 0.06)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
    borderRadius: '10px',
    marginBottom: '12px',
  },
  formLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b6b8a',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '2px',
  },
  formRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },

  // Audit log cells
  actionType: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#c084fc',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  target: {
    fontSize: '12px',
    color: theme.text.secondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
};
