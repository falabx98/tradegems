import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function BonusCodesTab() {
  const [list, setList] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', amountSol: '', maxUses: '100', description: '', expiresAt: '' });
  const [redemptions, setRedemptions] = useState<{ codeId: string; code: string; data: any[] } | null>(null);

  const load = () => { apiFetch<{ data: any[] }>('/v1/admin/bonus-codes').then(r => setList(r.data || [])).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const amountLamports = Math.round(parseFloat(form.amountSol) * 1e9);
      await apiFetch('/v1/admin/bonus-codes', { method: 'POST', body: JSON.stringify({ code: form.code, amountLamports, maxUses: parseInt(form.maxUses) || 100, description: form.description, expiresAt: form.expiresAt || undefined }) });
      setShowCreate(false); setForm({ code: '', amountSol: '', maxUses: '100', description: '', expiresAt: '' }); load();
    } catch {}
  };

  const toggle = async (id: string, active: boolean) => {
    try { await apiFetch(`/v1/admin/bonus-codes/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) }); load(); } catch {}
  };

  const viewRedemptions = async (codeId: string, code: string) => {
    try {
      const res = await apiFetch<{ data: any[] }>(`/v1/admin/bonus-codes/${codeId}/redemptions`);
      setRedemptions({ codeId, code, data: res.data || [] });
    } catch { setRedemptions({ codeId, code, data: [] }); }
  };

  return (
    <div>
      <AdminPageHeader title="Bonus Codes" subtitle={`${list.length} codes`} actions={
        <button onClick={() => setShowCreate(!showCreate)} style={s.searchBtn}>{showCreate ? 'Cancel' : 'Create Code'}</button>
      } />
      {showCreate && (
        <div style={s.createFormCard}>
          <div style={s.formRow}>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Code</div><input type="text" placeholder="e.g. WELCOME100" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} style={s.formInput} /></div>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Amount (SOL)</div><input type="number" step="0.001" placeholder="0.05" value={form.amountSol} onChange={e => setForm(p => ({ ...p, amountSol: e.target.value }))} style={s.formInput} className="mono" /></div>
          </div>
          <div style={s.formRow}>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Max Uses</div><input type="number" placeholder="100" value={form.maxUses} onChange={e => setForm(p => ({ ...p, maxUses: e.target.value }))} style={s.formInput} /></div>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Expires At</div><input type="datetime-local" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} style={s.formInput} /></div>
          </div>
          <div><div style={s.formLabel}>Description</div><input type="text" placeholder="Optional description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={s.formInput} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}><button onClick={create} style={s.actionBtnGreen}>Create</button><button onClick={() => setShowCreate(false)} style={s.actionBtnRed}>Cancel</button></div>
        </div>
      )}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Code</th><th style={s.th}>Description</th><th style={s.th}>Amount</th><th style={s.th}>Used/Max</th><th style={s.th}>Status</th><th style={s.th}>Expires</th><th style={s.th}>Created</th><th style={s.th}>Actions</th></tr></thead>
          <tbody>
            {list.map((b: any) => (
              <tr key={b.id}>
                <td style={s.td}><span className="mono" style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 13 }}>{b.code}</span></td>
                <td style={s.td}><span style={{ color: theme.text.muted, fontSize: 12 }}>{b.description || '--'}</span></td>
                <td style={s.td}><span className="mono" style={{ color: theme.success, fontWeight: 700, fontSize: 13 }}>{(Number(b.amountLamports) / 1e9).toFixed(4)} SOL</span></td>
                <td style={s.td}><span style={{ fontWeight: 700, color: theme.text.primary, fontSize: 13 }}>{b.usedCount ?? 0}/{b.maxUses}</span></td>
                <td style={s.td}><span style={{ ...s.statusBadge, ...(b.active ? s.statusActive : s.statusBanned) }}>{b.active ? 'Active' : 'Inactive'}</span></td>
                <td style={s.td}><span style={s.date}>{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : 'Never'}</span></td>
                <td style={s.td}><span style={s.date}>{new Date(b.createdAt).toLocaleDateString()}</span></td>
                <td style={s.td}>
                  <div style={s.actionBtns}>
                    <button onClick={() => toggle(b.id, b.active)} style={b.active ? s.actionBtnRed : s.actionBtnGreen}>{b.active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => viewRedemptions(b.id, b.code)} style={s.actionBtnBlue}>View</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} style={s.emptyTd}>No bonus codes found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Redemptions Modal */}
      {redemptions && (
        <div style={s.modalOverlay} onClick={() => setRedemptions(null)}>
          <div style={{ ...s.modalCard, maxWidth: 600, maxHeight: '80vh', overflow: 'auto', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={s.modalTitle}>Redemptions: {redemptions.code}</div>
              <button onClick={() => setRedemptions(null)} style={{ background: 'none', border: 'none', color: theme.text.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {redemptions.data.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: theme.text.muted, fontSize: 13 }}>No redemptions yet.</div>
            ) : (
              <table style={s.table}>
                <thead><tr><th style={s.th}>User</th><th style={s.th}>Amount</th><th style={s.th}>Redeemed</th></tr></thead>
                <tbody>
                  {redemptions.data.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={s.td}><span style={s.username}>{r.username || r.userId?.slice(0, 8)}</span></td>
                      <td style={s.td}><span className="mono" style={{ color: theme.success }}>{(Number(r.amountLamports) / 1e9).toFixed(4)} SOL</span></td>
                      <td style={s.td}><span style={s.date}>{new Date(r.redeemedAt).toLocaleString()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
