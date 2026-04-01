import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function RoundsTab() {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = (status?: string) => {
    const q = status ? `?status=${status}&limit=50` : '?limit=50';
    apiFetch<{ data: any[] }>(`/v1/admin/rounds${q}`).then(r => setList(r.data || [])).catch(() => {});
  };
  useEffect(() => { load(filter || undefined); }, [filter]);

  const loadDetail = async (id: string) => {
    if (selected?.id === id) { setSelected(null); return; }
    try { const res = await apiFetch<any>(`/v1/admin/rounds/${id}`); setSelected(res); } catch {}
  };

  return (
    <div>
      <AdminPageHeader title="Game Rounds" subtitle={`${list.length} rounds`} />
      <div style={s.filterRow}>
        {['', 'resolved', 'active', 'started'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={filter === f ? s.filterBtnActive : s.filterBtn}>{f || 'All'}</button>
        ))}
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>ID</th><th style={s.th}>Mode</th><th style={s.th}>Status</th><th style={s.th}>Players</th><th style={s.th}>Duration</th><th style={s.th}>Created</th></tr></thead>
          <tbody>
            {list.map((r: any) => (<>
              <tr key={r.id} onClick={() => loadDetail(r.id)} style={{ cursor: 'pointer' }}>
                <td style={s.td}><span style={s.target}>{r.id.slice(0, 8)}</span></td>
                <td style={s.td}><span style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 12, textTransform: 'uppercase' as const }}>{r.mode || '--'}</span></td>
                <td style={s.td}><span style={{ ...s.statusBadge, ...(r.status === 'resolved' ? s.statusActive : r.status === 'active' || r.status === 'started' ? s.statusSuspended : {}) }}>{r.status}</span></td>
                <td style={s.td}><span style={{ fontWeight: 700, color: theme.text.primary, fontSize: 13 }}>{r.playerCount ?? '--'}</span></td>
                <td style={s.td}><span style={s.date}>{r.durationSeconds ? `${r.durationSeconds}s` : '--'}</span></td>
                <td style={s.td}><span style={s.date}>{new Date(r.createdAt).toLocaleString()}</span></td>
              </tr>
              {selected?.id === r.id && (
                <tr key={`${r.id}-d`}><td colSpan={6} style={{ ...s.td, background: 'rgba(139,92,246,0.04)', padding: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13 }}>
                    <span style={{ color: theme.text.muted }}><strong style={{ color: '#8b5cf6' }}>Round ID:</strong> {selected.id}</span>
                    {selected.bets && <span style={{ color: theme.text.muted }}><strong style={{ color: '#8b5cf6' }}>Bets:</strong> {selected.bets.length}</span>}
                    {selected.resolvedAt && <span style={{ color: theme.text.muted }}><strong style={{ color: '#8b5cf6' }}>Resolved:</strong> {new Date(selected.resolvedAt).toLocaleString()}</span>}
                  </div>
                </td></tr>
              )}
            </>))}
            {list.length === 0 && <tr><td colSpan={6} style={s.emptyTd}>No rounds found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
