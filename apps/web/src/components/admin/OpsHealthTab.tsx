import { useEffect, useState, useRef } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { StatCard } from '../ui/StatCard';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function OpsHealthTab() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [rtp, setRtp] = useState<any>(null);
  const [perf, setPerf] = useState<any[]>([]);
  const [moneyPerf, setMoneyPerf] = useState<any[]>([]);
  const [circuit, setCircuit] = useState<any>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = async () => {
    const [h, a, r, p, mp] = await Promise.all([
      apiFetch<any>('/v1/admin/workers/health').catch(() => null),
      apiFetch<any>('/v1/admin/ops/alerts?limit=20').catch(() => ({ data: [] })),
      apiFetch<any>('/v1/admin/ops/rtp').catch(() => null),
      apiFetch<any>('/v1/admin/ops/perf').catch(() => ({ data: [] })),
      apiFetch<any>('/v1/admin/ops/perf/money').catch(() => ({ data: [] })),
    ]);
    if (h?.workers) setWorkers(h.workers);
    if (h?.solanaRpc) setCircuit(h.solanaRpc);
    setAlerts((a as any)?.data || []);
    if (r) setRtp(r);
    setPerf((p as any)?.data || []);
    setMoneyPerf((mp as any)?.data || []);
  };

  useEffect(() => { load(); refreshRef.current = setInterval(load, 15000); return () => { if (refreshRef.current) clearInterval(refreshRef.current); }; }, []);

  const ackAlert = async (id: string) => {
    try { await apiFetch(`/v1/admin/ops/alerts/${id}/acknowledge`, { method: 'POST' }); load(); toast.success('Alert acknowledged'); } catch { toast.error('Ack failed'); }
  };

  const healthColor = (h: string) => h === 'healthy' ? theme.success : h === 'degraded' ? theme.warning : theme.accent.red;

  return (
    <div>
      <AdminPageHeader title="Ops Health" subtitle="System monitoring" />

      {/* Workers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
        {workers.map(w => (
          <div key={w.name} style={{ background: theme.bg.secondary, borderRadius: 10, padding: '12px 14px', border: `1px solid ${theme.border.subtle}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor(w.health), boxShadow: w.health === 'healthy' ? `0 0 6px ${theme.success}` : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{w.name}</span>
            </div>
            <span style={{ fontSize: 11, color: healthColor(w.health), fontWeight: 600, textTransform: 'uppercase' }}>{w.health}</span>
            {w.msSinceHeartbeat != null && <span style={{ fontSize: 10, color: theme.text.muted, marginLeft: 6 }}>{(w.msSinceHeartbeat / 1000).toFixed(0)}s ago</span>}
          </div>
        ))}
        {circuit && (
          <div style={{ background: theme.bg.secondary, borderRadius: 10, padding: '12px 14px', border: `1px solid ${circuit.state === 'CLOSED' ? 'rgba(0,231,1,0.15)' : 'rgba(255,51,51,0.15)'}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Solana RPC</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: circuit.state === 'CLOSED' ? theme.success : theme.accent.red }}>{circuit.state}</span>
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Alerts ({alerts.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.slice(0, 15).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: a.severity === 'critical' ? 'rgba(255,51,51,0.06)' : theme.bg.secondary, border: `1px solid ${a.severity === 'critical' ? 'rgba(255,51,51,0.15)' : theme.border.subtle}` }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.severity === 'critical' ? theme.accent.red : theme.warning }}>[{a.severity}]</span>
                  <span style={{ fontSize: 12, color: theme.text.secondary, marginLeft: 6 }}>{a.category}: {a.message?.slice(0, 80)}</span>
                  <span style={{ fontSize: 10, color: theme.text.muted, marginLeft: 6 }}>{new Date(a.createdAt || a.created_at).toLocaleString()}</span>
                </div>
                {!a.acknowledged && !a.acknowledgedAt && (
                  <button onClick={() => ackAlert(a.id)} style={{ ...s.actionBtnPurple, padding: '3px 10px', fontSize: 10 }}>Ack</button>
                )}
                {(a.acknowledged || a.acknowledgedAt) && (
                  <span style={{ fontSize: 10, color: theme.success, fontWeight: 600 }}>✓ Acked</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Performance */}
      {perf.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>API Performance (top routes)</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Route</th><th style={s.th}>Method</th><th style={s.th}>Avg (ms)</th><th style={s.th}>P95</th><th style={s.th}>P99</th><th style={s.th}>Calls</th></tr></thead>
              <tbody>
                {perf.slice(0, 15).map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={s.td}><span className="mono" style={{ fontSize: 11, color: theme.text.secondary }}>{p.route || p.path}</span></td>
                    <td style={s.td}><span style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6' }}>{p.method || 'GET'}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: (p.avg || p.avgMs) > 500 ? theme.accent.red : theme.text.secondary }}>{(p.avg || p.avgMs || 0).toFixed(0)}</span></td>
                    <td style={s.td}><span className="mono">{(p.p95 || 0).toFixed(0)}</span></td>
                    <td style={s.td}><span className="mono">{(p.p99 || 0).toFixed(0)}</span></td>
                    <td style={s.td}>{p.count || p.calls || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Money Routes */}
      {moneyPerf.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Money Route Performance</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Route</th><th style={s.th}>Avg (ms)</th><th style={s.th}>P95</th><th style={s.th}>Calls</th></tr></thead>
              <tbody>
                {moneyPerf.slice(0, 10).map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={s.td}><span className="mono" style={{ fontSize: 11, color: theme.accent.neonGreen }}>{p.route || p.path}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: (p.avg || p.avgMs) > 200 ? theme.warning : theme.text.secondary }}>{(p.avg || p.avgMs || 0).toFixed(0)}</span></td>
                    <td style={s.td}><span className="mono">{(p.p95 || 0).toFixed(0)}</span></td>
                    <td style={s.td}>{p.count || p.calls || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
