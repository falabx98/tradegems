import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminPagination } from './AdminPagination';
import { exportToCSV } from './csvExport';
import { s } from './adminStyles';

interface AuditLog { id: number; actorUsername: string; actionType: string; targetType: string; targetId: string; createdAt: string; }

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: AuditLog[] }>(`/v1/admin/audit-logs?limit=${limit}&offset=${page * limit}`)
      .then(res => { setLogs(res.data || []); setTotal(res.data?.length >= limit ? (page + 1) * limit + 1 : page * limit + (res.data?.length || 0)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, limit]);

  const handleExport = () => {
    exportToCSV(['Actor', 'Action', 'Target', 'Timestamp'], logs.map(l => [l.actorUsername, l.actionType, `${l.targetType}:${l.targetId}`, new Date(l.createdAt).toLocaleString()]), 'tradegems_audit_logs');
  };

  if (loading && logs.length === 0) return <div style={{ color: theme.text.muted, padding: 20 }}>Loading audit logs...</div>;

  return (
    <div>
      <AdminPageHeader title="Audit Logs" subtitle="Admin action history" actions={
        <button onClick={handleExport} style={{ ...s.searchBtn, fontSize: 12, padding: '6px 14px' }}>Export CSV</button>
      } />
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Actor</th><th style={s.th}>Action</th><th style={s.th}>Target</th><th style={s.th}>Timestamp</th></tr></thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td style={s.td}><span style={{ fontWeight: 600, color: theme.text.secondary }}>{log.actorUsername}</span></td>
                <td style={s.td}><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.08)', color: theme.accent.purple, fontWeight: 600 }}>{log.actionType}</span></td>
                <td style={s.td}><span style={{ fontSize: 12, color: theme.text.muted }}>{log.targetType}{log.targetId ? `: ${log.targetId.slice(0, 8)}...` : ''}</span></td>
                <td style={s.td}><span style={{ fontSize: 12, color: theme.text.muted }}>{new Date(log.createdAt).toLocaleString()}</span></td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: theme.text.muted }}>No audit logs found.</td></tr>}
          </tbody>
        </table>
        <AdminPagination total={total} page={page} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>
    </div>
  );
}
