import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';

export function SettlementsTab() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = () => { apiFetch<{ data: any[] }>('/v1/admin/failed-settlements').then(r => setSettlements((r as any)?.data || [])).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try { await apiFetch(`/v1/admin/failed-settlements/${id}/retry`, { method: 'POST' }); load(); toast.success('Settlement retried'); } catch { toast.error('Retry failed'); }
    setRetrying(null);
  };

  const handleAbandon = async (id: string) => {
    if (!confirm('Abandon this settlement? The funds will NOT be recovered.')) return;
    try { await apiFetch(`/v1/admin/failed-settlements/${id}/abandon`, { method: 'POST' }); load(); toast.success('Settlement abandoned'); } catch { toast.error('Abandon failed'); }
  };

  return (
    <div>
      <AdminPageHeader title="Failed Settlements" subtitle={settlements.length > 0 ? `${settlements.length} pending` : 'All clear'} />
      {settlements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: theme.text.muted, fontSize: 14 }}>No failed settlements. All clear ✓</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {settlements.map((se: any) => (
            <div key={se.id} style={{ background: theme.bg.secondary, borderRadius: 12, padding: 12, border: '1px solid rgba(239,68,68,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>{se.gameType} — {se.userId?.slice(0, 8)}...</div>
                <div style={{ fontSize: 11, color: theme.text.muted }}>{formatSol(se.amount)} SOL · {se.retryCount} retries · {new Date(se.createdAt).toLocaleString()}</div>
                {se.error && <div style={{ fontSize: 11, color: theme.accent.red, marginTop: 2 }}>{se.error?.slice(0, 80)}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleRetry(se.id)} disabled={retrying === se.id} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, color: theme.accent.purple, cursor: 'pointer', fontFamily: 'inherit', opacity: retrying === se.id ? 0.5 : 1 }}>
                  {retrying === se.id ? 'Retrying...' : 'Retry'}
                </button>
                <button onClick={() => handleAbandon(se.id)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: theme.accent.red, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Abandon
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
