import { useEffect, useState, useRef } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function SimulationTab() {
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({ botCount: '20', gamesPerMinute: '15', durationMinutes: '10' });
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchStatus = () => {
    apiFetch<any>('/v1/admin/simulation/status').then(r => setStatus(r.data)).catch(() => {});
  };

  useEffect(() => { fetchStatus(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const start = async () => {
    setStarting(true);
    try {
      await apiFetch('/v1/admin/simulation/start', { method: 'POST', body: JSON.stringify({
        botCount: parseInt(form.botCount), gamesPerMinute: parseInt(form.gamesPerMinute), durationMinutes: parseInt(form.durationMinutes),
      })});
      // Start polling
      pollRef.current = setInterval(fetchStatus, 5000);
      fetchStatus();
    } catch {} finally { setStarting(false); }
  };

  const stop = async () => {
    try { await apiFetch('/v1/admin/simulation/stop', { method: 'POST' }); if (pollRef.current) clearInterval(pollRef.current); fetchStatus(); } catch {}
  };

  const cleanup = async () => {
    if (!confirm('Delete all bot users and their data?')) return;
    try { await apiFetch('/v1/admin/simulation/cleanup', { method: 'POST', body: JSON.stringify({ confirmation: 'CLEANUP_BOTS' }) }); fetchStatus(); } catch {}
  };

  const isRunning = status?.running;
  const hasBots = status?.botCount > 0;

  return (
    <div>
      <AdminPageHeader title="Bot Simulation" subtitle="Stress testing & validation" />

      {/* Controls */}
      {!isRunning ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><div style={s.formLabel}>Bots</div><input type="number" min="1" max="100" value={form.botCount} onChange={e => setForm(p => ({ ...p, botCount: e.target.value }))} style={{ ...s.formInput, width: 80 }} /></div>
          <div><div style={s.formLabel}>Games/min</div><input type="number" min="1" max="60" value={form.gamesPerMinute} onChange={e => setForm(p => ({ ...p, gamesPerMinute: e.target.value }))} style={{ ...s.formInput, width: 80 }} /></div>
          <div><div style={s.formLabel}>Duration (min)</div><input type="number" min="1" max="120" value={form.durationMinutes} onChange={e => setForm(p => ({ ...p, durationMinutes: e.target.value }))} style={{ ...s.formInput, width: 80 }} /></div>
          <button onClick={start} disabled={starting} style={{ ...s.actionBtnGreen, padding: '10px 20px', fontSize: 13 }}>{starting ? 'Starting...' : 'Start Simulation'}</button>
          {hasBots && !isRunning && <button onClick={cleanup} style={{ ...s.actionBtnRed, padding: '10px 20px', fontSize: 13 }}>Cleanup Bots</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={stop} style={{ ...s.actionBtnRed, padding: '10px 20px', fontSize: 13 }}>Stop Simulation</button>
        </div>
      )}

      {/* Stats */}
      {status && status.totalBets > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <Stat label="Duration" value={status.duration} />
            <Stat label="Total Bets" value={status.totalBets} />
            <Stat label="Wagered" value={`${(status.totalWagered / 1e9).toFixed(2)} SOL`} color={theme.accent.purple} />
            <Stat label="House Edge" value={status.effectiveHouseEdge} color={status.houseProfit >= 0 ? theme.success : theme.accent.red} />
          </div>

          {/* Per-game table */}
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Game</th><th style={s.th}>Bets</th><th style={s.th}>Wagered</th><th style={s.th}>Payout</th><th style={s.th}>RTP</th></tr></thead>
              <tbody>
                {Object.entries(status.byGame || {}).map(([game, gs]: [string, any]) => {
                  const rtp = gs.wagered > 0 ? (gs.payout / gs.wagered * 100).toFixed(1) : '—';
                  return (
                    <tr key={game}>
                      <td style={s.td}><span style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{game}</span></td>
                      <td style={s.td}>{gs.bets}</td>
                      <td style={s.td}><span className="mono">{(gs.wagered / 1e9).toFixed(2)} SOL</span></td>
                      <td style={s.td}><span className="mono">{(gs.payout / 1e9).toFixed(2)} SOL</span></td>
                      <td style={s.td}><span className="mono" style={{ fontWeight: 700, color: parseFloat(String(rtp)) > 100 ? theme.accent.red : theme.success }}>{rtp}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ background: theme.bg.secondary, borderRadius: 10, padding: '12px 14px', border: `1px solid ${theme.border.subtle}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || '#fff', marginTop: 4 }}>{value}</div>
    </div>
  );
}
