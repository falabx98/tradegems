import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function WeeklyRaceTab() {
  const [race, setRace] = useState<any>(null);
  const [races, setRaces] = useState<any[]>([]);
  const [prizePool, setPrizePool] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [current, all] = await Promise.all([
        apiFetch<any>('/v1/races/current').catch(() => ({ data: null })),
        apiFetch<any>('/v1/admin/races').catch(() => ({ data: [] })),
      ]);
      setRace(current.data);
      setRaces(all.data || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const forceComplete = async () => {
    if (!race?.raceId || !confirm('Force complete the current race? Prizes will be distributed.')) return;
    try { await apiFetch(`/v1/admin/races/${race.raceId}/force-complete`, { method: 'POST' }); load(); toast.success('Race completed'); } catch { toast.error('Failed'); }
  };

  const forceCreate = async () => {
    try { await apiFetch('/v1/admin/races/force-create', { method: 'POST' }); load(); toast.success('Race created'); } catch { toast.error('Failed'); }
  };

  const updateConfig = async () => {
    if (!prizePool) return;
    try {
      await apiFetch('/v1/admin/races/config', { method: 'PUT', body: JSON.stringify({ prizePoolLamports: Math.round(parseFloat(prizePool) * 1e9) }) });
      setPrizePool(''); load();
    } catch {}
  };

  if (loading) return <div style={{ color: theme.text.muted, padding: 20 }}>Loading...</div>;

  const timeLeft = race?.timeRemainingMs ? `${Math.floor(race.timeRemainingMs / 3600000)}h ${Math.floor((race.timeRemainingMs % 3600000) / 60000)}m` : '—';

  return (
    <div>
      <AdminPageHeader title="Weekly Race" subtitle="Competition management" actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={forceCreate} style={s.actionBtnPurple}>Force Create New</button>
          {race && <button onClick={forceComplete} style={s.actionBtnRed}>Force Complete</button>}
        </div>
      } />

      {/* Current Race */}
      {race ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={card}><span style={cardLabel}>Prize Pool</span><span className="mono" style={{ fontSize: 18, fontWeight: 800, color: theme.accent.neonGreen }}>{formatSol(race.prizePool)} SOL</span></div>
          <div style={card}><span style={cardLabel}>Time Left</span><span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{timeLeft}</span></div>
          <div style={card}><span style={cardLabel}>Participants</span><span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{race.leaderboard?.length || 0}</span></div>
          <div style={card}><span style={cardLabel}>Total Volume</span><span className="mono" style={{ fontSize: 14, fontWeight: 700, color: theme.text.secondary }}>{formatSol(race.totalVolume || 0)} SOL</span></div>
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: 'center', color: theme.text.muted }}>No active race</div>
      )}

      {/* Config */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <div style={s.formLabel}>Prize Pool (SOL)</div>
          <input type="number" step="0.1" placeholder="10" value={prizePool} onChange={e => setPrizePool(e.target.value)} style={{ ...s.formInput, width: 150 }} className="mono" />
        </div>
        <button onClick={updateConfig} style={{ ...s.searchBtn, height: 40 }}>Update Config</button>
      </div>

      {/* Leaderboard */}
      {race?.leaderboard?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Current Leaderboard</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>#</th><th style={s.th}>User</th><th style={s.th}>Wagered</th><th style={s.th}>Prize</th></tr></thead>
              <tbody>
                {race.leaderboard.slice(0, 20).map((e: any) => (
                  <tr key={e.userId}>
                    <td style={s.td}><span style={{ fontWeight: 800, color: e.rank <= 3 ? ['', '#FFD700', '#C0C0C0', '#CD7F32'][e.rank] : theme.text.muted }}>{e.rank}</span></td>
                    <td style={s.td}><span style={s.username}>{e.username}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.text.secondary }}>{formatSol(e.wagered)} SOL</span></td>
                    <td style={s.td}><span className="mono" style={{ color: e.prize > 0 ? theme.accent.neonGreen : theme.text.muted }}>{e.prize > 0 ? `${formatSol(e.prize)} SOL` : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History */}
      {races.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Race History</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Week Start</th><th style={s.th}>Status</th><th style={s.th}>Prize Pool</th><th style={s.th}>Volume</th></tr></thead>
              <tbody>
                {races.map((r: any) => (
                  <tr key={r.id}>
                    <td style={s.td}><span style={s.date}>{new Date(r.weekStart).toLocaleDateString()}</span></td>
                    <td style={s.td}><span style={{ ...s.statusBadge, ...(r.status === 'active' ? s.statusActive : r.status === 'completed' ? s.statusSuspended : {}) }}>{r.status}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.accent.neonGreen }}>{formatSol(r.prizePoolLamports)} SOL</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.text.secondary }}>{formatSol(r.totalVolumeLamports)} SOL</span></td>
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

const card = { background: theme.bg.secondary, borderRadius: 12, padding: '14px 16px', border: `1px solid ${theme.border.subtle}`, display: 'flex', flexDirection: 'column' as const, gap: 4 };
const cardLabel = { fontSize: 11, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };
