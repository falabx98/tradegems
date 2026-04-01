import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminPagination } from './AdminPagination';
import { exportToCSV } from './csvExport';
import { s } from './adminStyles';

export function WithdrawalsTab() {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = () => {
    const q = filter ? `?status=${filter}` : '';
    apiFetch<{ data: any[] }>(`/v1/admin/treasury/withdrawals${q}`).then(r => {
      setList(r.data || []);
      setTotal(r.data?.length || 0);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, [filter, page, limit]);

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    setActionLoading(id);
    try { await apiFetch(`/v1/admin/treasury/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: action }) }); load(); toast.success(`Withdrawal ${action}`); } catch { toast.error('Action failed'); } finally { setActionLoading(null); }
  };

  const handleExport = () => {
    exportToCSV(['Username', 'Amount (SOL)', 'Destination', 'Status', 'Risk', 'Date'],
      list.map(w => [w.username || w.userId?.slice(0, 8), (Number(w.amount) / 1e9).toFixed(4), w.destination || '', w.status, w.riskScore ?? '', new Date(w.createdAt).toLocaleString()]),
      'tradegems_withdrawals');
  };

  return (
    <div>
      <AdminPageHeader title="Withdrawals" subtitle={`${list.length} withdrawals`} actions={
        <button onClick={handleExport} style={{ ...s.searchBtn, fontSize: 12, padding: '6px 14px' }}>Export CSV</button>
      } />
      <div style={s.filterRow}>
        {['', 'pending_review', 'approved', 'rejected', 'completed'].map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(0); }} style={filter === f ? s.filterBtnActive : s.filterBtn}>{f ? f.replace('_', ' ') : 'All'}</button>
        ))}
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Username</th><th style={s.th}>Amount</th><th style={s.th}>Destination</th><th style={s.th}>Status</th><th style={s.th}>Risk</th><th style={s.th}>Date</th><th style={s.th}>Actions</th></tr></thead>
          <tbody>
            {list.map((w: any) => (
              <tr key={w.id}>
                <td style={s.td}><span style={s.username}>{w.username || w.userId?.slice(0, 8)}</span></td>
                <td style={s.td}><span className="mono" style={{ color: theme.danger, fontWeight: 700, fontSize: 13 }}>{(Number(w.amount) / 1e9).toFixed(4)} SOL</span></td>
                <td style={s.td}><span style={s.target}>{w.destination ? w.destination.slice(0, 12) + '...' : '--'}</span></td>
                <td style={s.td}><span style={{ ...s.statusBadge, ...(w.status === 'completed' || w.status === 'approved' ? s.statusActive : w.status === 'pending_review' ? s.statusSuspended : w.status === 'rejected' ? s.statusBanned : {}) }}>{w.status}</span></td>
                <td style={s.td}><span style={{ color: (w.riskScore ?? 0) > 50 ? theme.danger : theme.text.muted, fontWeight: 700, fontSize: 13 }}>{w.riskScore ?? '--'}</span></td>
                <td style={s.td}><span style={s.date}>{new Date(w.createdAt).toLocaleString()}</span></td>
                <td style={s.td}>
                  <div style={s.actionBtns}>
                    {w.status === 'pending_review' && (<>
                      <button onClick={() => handleAction(w.id, 'approved')} disabled={actionLoading === w.id} style={s.actionBtnGreen}>{actionLoading === w.id ? '...' : 'Approve'}</button>
                      <button onClick={() => handleAction(w.id, 'rejected')} disabled={actionLoading === w.id} style={s.actionBtnRed}>{actionLoading === w.id ? '...' : 'Reject'}</button>
                    </>)}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} style={s.emptyTd}>No withdrawals found.</td></tr>}
          </tbody>
        </table>
        <AdminPagination total={total} page={page} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>
    </div>
  );
}
