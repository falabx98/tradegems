import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function SponsoredAccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showGrant, setShowGrant] = useState(false);
  const [form, setForm] = useState({ userId: '', amount: '', profitShare: '20', notes: '', expiresAt: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    apiFetch<any>('/v1/admin/sponsored-balance').then(r => setAccounts(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const grant = async () => {
    try {
      await apiFetch('/v1/admin/sponsored-balance/grant', { method: 'POST', body: JSON.stringify({
        userId: form.userId, amount: parseFloat(form.amount),
        profitSharePercentage: parseInt(form.profitShare), notes: form.notes || undefined,
        expiresAt: form.expiresAt || undefined,
      })});
      setShowGrant(false); setForm({ userId: '', amount: '', profitShare: '20', notes: '', expiresAt: '' }); load();
      toast.success('Sponsorship granted');
    } catch (err: any) { toast.error(err?.message || 'Failed to grant'); }
  };

  const settle = async (userId: string, username: string) => {
    if (!confirm(`Settle sponsorship for ${username}? This will return non-withdrawable funds to treasury.`)) return;
    try { await apiFetch(`/v1/admin/sponsored-balance/${userId}/settle`, { method: 'POST' }); load(); toast.success('Sponsorship settled'); } catch { toast.error('Settle failed'); }
  };

  if (loading) return <div style={{ color: theme.text.muted, padding: 20 }}>Loading...</div>;

  return (
    <div>
      <AdminPageHeader title="Sponsored Accounts" subtitle={`${accounts.length} sponsorships`} actions={
        <button onClick={() => setShowGrant(!showGrant)} style={s.searchBtn}>{showGrant ? 'Cancel' : 'Grant New'}</button>
      } />

      {showGrant && (
        <div style={s.createFormCard}>
          <div style={s.formRow}>
            <div style={{ flex: 1 }}><div style={s.formLabel}>User ID</div><input placeholder="UUID" value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))} style={s.formInput} /></div>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Amount (SOL)</div><input type="number" step="1" placeholder="500" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={s.formInput} className="mono" /></div>
            <div style={{ width: 100 }}><div style={s.formLabel}>Profit Share %</div><input type="number" min="1" max="100" value={form.profitShare} onChange={e => setForm(p => ({ ...p, profitShare: e.target.value }))} style={s.formInput} /></div>
          </div>
          <div style={s.formRow}>
            <div style={{ flex: 1 }}><div style={s.formLabel}>Notes</div><input placeholder="Campaign name..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={s.formInput} /></div>
            <div style={{ width: 200 }}><div style={s.formLabel}>Expires At</div><input type="datetime-local" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} style={s.formInput} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={grant} style={s.actionBtnGreen}>Grant</button><button onClick={() => setShowGrant(false)} style={s.actionBtnRed}>Cancel</button></div>
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>User</th><th style={s.th}>Granted</th><th style={s.th}>Balance</th><th style={s.th}>Net P&L</th><th style={s.th}>Withdrawable</th><th style={s.th}>Share %</th><th style={s.th}>Status</th><th style={s.th}>Actions</th>
          </tr></thead>
          <tbody>
            {accounts.map((a: any) => {
              const netPnl = a.currentBalance - a.grantedAmount;
              return (
                <tr key={a.id}>
                  <td style={s.td}><span style={s.username}>{a.username}</span></td>
                  <td style={s.td}><span className="mono" style={{ color: theme.text.secondary }}>{formatSol(a.grantedAmount)} SOL</span></td>
                  <td style={s.td}><span className="mono" style={{ fontWeight: 700, color: '#fff' }}>{formatSol(a.currentBalance)} SOL</span></td>
                  <td style={s.td}><span className="mono" style={{ fontWeight: 700, color: netPnl >= 0 ? theme.accent.neonGreen : theme.accent.red }}>{netPnl >= 0 ? '+' : ''}{formatSol(netPnl)} SOL</span></td>
                  <td style={s.td}><span className="mono" style={{ color: theme.accent.neonGreen }}>—</span></td>
                  <td style={s.td}><span style={{ fontWeight: 700, color: theme.accent.purple }}>{a.profitSharePercentage}%</span></td>
                  <td style={s.td}><span style={{ ...s.statusBadge, ...(a.status === 'active' ? s.statusActive : a.status === 'settled' ? s.statusSuspended : s.statusBanned) }}>{a.status}</span></td>
                  <td style={s.td}>
                    {a.status === 'active' && <button onClick={() => settle(a.userId, a.username)} style={s.actionBtnRed}>Settle</button>}
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && <tr><td colSpan={8} style={s.emptyTd}>No sponsored accounts.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
