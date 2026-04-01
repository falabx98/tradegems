import { useEffect, useState } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

export function FairnessTab() {
  const [roundId, setRoundId] = useState('');
  const [verification, setVerification] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [outliers, setOutliers] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<any>('/v1/admin/fairness/metrics').then(setMetrics).catch(() => {});
    apiFetch<any>('/v1/admin/ops/outliers').then(r => setOutliers(r.data || r.outliers || [])).catch(() => {});
  }, []);

  const verify = async () => {
    if (!roundId.trim()) return;
    setVerifying(true);
    try {
      const res = await apiFetch<any>(`/v1/admin/fairness/round/${roundId.trim()}`);
      setVerification(res);
    } catch { setVerification({ error: 'Round not found or not resolved' }); }
    finally { setVerifying(false); }
  };

  // Check if seed hash matches
  const hashMatch = verification && verification.serverSeed && verification.serverSeedHash
    ? null // Would need crypto.subtle for client-side SHA-256 — show data for manual check
    : null;

  return (
    <div>
      <AdminPageHeader title="Provably Fair" subtitle="Verification and RTP monitoring" />

      {/* Verify Round */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={heading}>Verify Round</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="Round ID or Game ID..." value={roundId} onChange={e => setRoundId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') verify(); }} style={{ ...s.searchInput, maxWidth: 400 }} />
          <button onClick={verify} disabled={verifying} style={s.searchBtn}>{verifying ? 'Checking...' : 'Verify'}</button>
        </div>
        {verification && !verification.error && (
          <div style={{ background: theme.bg.secondary, borderRadius: 12, padding: 16, border: `1px solid ${theme.border.subtle}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={labelStyle}>Game Mode</span><br /><span style={{ color: '#8b5cf6', fontWeight: 700 }}>{verification.mode || '—'}</span></div>
              <div><span style={labelStyle}>Status</span><br /><span style={{ color: verification.status === 'resolved' ? theme.success : theme.warning, fontWeight: 600 }}>{verification.status}</span></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={labelStyle}>Server Seed</span><br /><span className="mono" style={{ fontSize: 11, color: theme.text.secondary, wordBreak: 'break-all' }}>{verification.serverSeed || '(hidden until resolved)'}</span></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={labelStyle}>Seed Hash (Commitment)</span><br /><span className="mono" style={{ fontSize: 11, color: theme.accent.purple, wordBreak: 'break-all' }}>{verification.serverSeedHash || verification.resultHash || '—'}</span></div>
              <div><span style={labelStyle}>Client Seed</span><br /><span className="mono" style={{ fontSize: 11, color: theme.text.secondary }}>{verification.clientSeed || '—'}</span></div>
              <div><span style={labelStyle}>Nonce</span><br /><span className="mono" style={{ fontSize: 11, color: theme.text.secondary }}>{verification.nonce ?? '—'}</span></div>
            </div>
            {verification.serverSeed && verification.serverSeedHash && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(0,231,1,0.06)', border: '1px solid rgba(0,231,1,0.15)', fontSize: 12, color: theme.accent.neonGreen, fontWeight: 600 }}>
                ✓ Seed data available for verification. Use SHA-256 to verify: sha256("{verification.serverSeed}") should equal the commitment hash.
              </div>
            )}
          </div>
        )}
        {verification?.error && (
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,51,51,0.06)', border: '1px solid rgba(255,51,51,0.15)', fontSize: 13, color: theme.accent.red }}>{verification.error}</div>
        )}
      </div>

      {/* RTP Monitoring */}
      {metrics && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={heading}>RTP Monitoring</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Game</th><th style={s.th}>Win Rate</th><th style={s.th}>House Edge</th><th style={s.th}>Bets</th></tr></thead>
              <tbody>
                {(metrics.winRates || metrics.games || []).map((g: any, i: number) => (
                  <tr key={i}>
                    <td style={s.td}><span style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{g.riskTier || g.game || g.name || '—'}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.text.secondary }}>{g.winRate ? `${(g.winRate * 100).toFixed(1)}%` : '—'}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.text.secondary }}>{g.houseEdge ? `${(g.houseEdge * 100).toFixed(2)}%` : '—'}</span></td>
                    <td style={s.td}>{g.totalBets || g.bets || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outlier Detection */}
      {outliers.length > 0 && (
        <div>
          <h3 style={heading}>Payout Outliers</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Game</th><th style={s.th}>User</th><th style={s.th}>Bet</th><th style={s.th}>Payout</th><th style={s.th}>Multiplier</th><th style={s.th}>When</th></tr></thead>
              <tbody>
                {outliers.slice(0, 20).map((o: any, i: number) => (
                  <tr key={i} onClick={() => { setRoundId(o.gameId || o.roundId || ''); }} style={{ cursor: 'pointer' }}>
                    <td style={s.td}><span style={{ fontWeight: 600, color: '#8b5cf6' }}>{o.game || '—'}</span></td>
                    <td style={s.td}><span style={{ color: theme.text.secondary }}>{o.userId?.slice(0, 8) || '—'}</span></td>
                    <td style={s.td}><span className="mono">{o.betAmount ? formatSol(o.betAmount) + ' SOL' : '—'}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.accent.neonGreen, fontWeight: 700 }}>{o.payoutAmount ? formatSol(o.payoutAmount) + ' SOL' : '—'}</span></td>
                    <td style={s.td}><span className="mono" style={{ color: theme.warning }}>{o.multiplier ? `${Number(o.multiplier).toFixed(2)}x` : '—'}</span></td>
                    <td style={s.td}><span style={s.date}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</span></td>
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

const heading = { fontSize: 14, fontWeight: 700 as const, color: '#fff', marginBottom: 10 };
const labelStyle = { fontSize: 11, fontWeight: 600 as const, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
