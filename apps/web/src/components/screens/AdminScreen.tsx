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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'treasury' | 'logs'>('overview');
  const [statusLoading, setStatusLoading] = useState<string | null>(null);

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
