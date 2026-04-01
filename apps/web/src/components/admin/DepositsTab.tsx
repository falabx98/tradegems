import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminPagination } from './AdminPagination';
import { exportToCSV } from './csvExport';
import { s } from './adminStyles';

export function DepositsTab() {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const load = () => {
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    params.set('limit', String(limit));
    apiFetch<{ data: any[] }>(`/v1/admin/treasury/deposits?${params}`).then(r => {
      setList(r.data || []);
      setTotal(r.data?.length >= limit ? (page + 1) * limit + 1 : page * limit + (r.data?.length || 0));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, [filter, page, limit]);

  const handleExport = () => {
    exportToCSV(['Username', 'Amount (SOL)', 'Tx Hash', 'Status', 'Date'],
      list.map(d => [d.username || d.userId?.slice(0, 8), (Number(d.amount) / 1e9).toFixed(4), d.txHash || '', d.status, new Date(d.createdAt).toLocaleString()]),
      'tradegems_deposits');
  };

  return (
    <div>
      <AdminPageHeader title="Deposits" subtitle={`${list.length} deposits`} actions={
        <button onClick={handleExport} style={{ ...s.searchBtn, fontSize: 12, padding: '6px 14px' }}>Export CSV</button>
      } />
      <div style={s.filterRow}>
        {['', 'pending', 'confirming', 'confirmed', 'failed'].map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(0); }} style={filter === f ? s.filterBtnActive : s.filterBtn}>{f || 'All'}</button>
        ))}
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Username</th><th style={s.th}>Amount</th><th style={s.th}>Tx Hash</th><th style={s.th}>Status</th><th style={s.th}>Date</th></tr></thead>
          <tbody>
            {list.map((d: any) => (
              <tr key={d.id}>
                <td style={s.td}><span style={s.username}>{d.username || d.userId?.slice(0, 8)}</span></td>
                <td style={s.td}><span className="mono" style={{ color: theme.success, fontWeight: 700, fontSize: 13 }}>{(Number(d.amount) / 1e9).toFixed(4)} SOL</span></td>
                <td style={s.td}><span style={s.target}>{d.txHash ? d.txHash.slice(0, 12) + '...' : '--'}</span></td>
                <td style={s.td}><span style={{ ...s.statusBadge, ...(d.status === 'confirmed' ? s.statusActive : s.statusSuspended) }}>{d.status}</span></td>
                <td style={s.td}><span style={s.date}>{new Date(d.createdAt).toLocaleString()}</span></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} style={s.emptyTd}>No deposits found.</td></tr>}
          </tbody>
        </table>
        <AdminPagination total={total} page={page} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>
    </div>
  );
}
