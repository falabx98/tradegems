import { useEffect, useState, useRef } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { StatCard } from '../ui/StatCard';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminChart } from './AdminChart';
import { s } from './adminStyles';

interface Stats { roundsToday: number; betVolumeToday: number; revenue24h: number; activeUsers: number; totalUsers: number; houseEdge: number; }
interface RtpGame { game: string; observed: number; expected: number; bets: number; volume: number; }

export function OverviewTab() {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState('7d');
  const [rtp, setRtp] = useState<RtpGame[]>([]);
  const [timeseries, setTimeseries] = useState<any>(null);
  const [distributions, setDistributions] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchAll = async () => {
    try {
      const [statsData, rtpData, tsData, distData] = await Promise.all([
        apiFetch<Stats>('/v1/admin/dashboard/stats').catch(() => null),
        apiFetch<any>('/v1/admin/ops/rtp').catch(() => null),
        apiFetch<any>(`/v1/admin/analytics/timeseries?metric=volume&period=${period}`).catch(() => null),
        apiFetch<any>('/v1/admin/analytics/distributions').catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (rtpData?.games) setRtp(rtpData.games);
      else if (rtpData?.data) setRtp(rtpData.data);
      if (tsData) setTimeseries(tsData);
      if (distData) setDistributions(distData);
      setLastUpdated(new Date());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [period]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshRef.current = setInterval(fetchAll, 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [period]);

  if (loading) return <div style={{ color: theme.text.muted, padding: 20 }}>Loading dashboard...</div>;

  const ago = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  const agoText = ago < 5 ? 'just now' : `${ago}s ago`;

  const rtpChartData = rtp.map(g => ({ label: g.game, value: parseFloat((g.observed * 100).toFixed(1)) }));
  const tsChartData = (timeseries?.data || []).map((d: any) => ({ label: d.date?.slice(5) || d.label || '', value: Number(d.value || d.volume || 0) }));

  return (
    <div>
      <AdminPageHeader title="Overview" subtitle="Platform metrics and performance" actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.text.muted }}>Updated {agoText}</span>
          <button onClick={fetchAll} style={{ ...s.actionBtnPurple, padding: '4px 10px' }}>↻</button>
          {['24h', '7d', '30d'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: period === p ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: period === p ? '#8b5cf6' : theme.text.muted }}>{p}</button>
          ))}
        </div>
      } />

      {/* KPI Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Users" value={stats.totalUsers.toLocaleString()} />
          <StatCard label="Revenue 24h" value={`${formatSol(stats.revenue24h)} SOL`} color={theme.success} trend="up" />
          <StatCard label="Bet Volume" value={`${formatSol(stats.betVolumeToday)} SOL`} color={theme.accent.purple} />
          <StatCard label="Active Users" value={stats.activeUsers.toLocaleString()} color={theme.info} />
          <StatCard label="House Edge" value={`${(stats.houseEdge * 100).toFixed(2)}%`} color={theme.warning} />
          <StatCard label="Rounds Today" value={stats.roundsToday.toLocaleString()} />
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={chartCard}>
          <AdminChart type="line" data={tsChartData} title="Volume Trend" color={theme.accent.purple} height={180} />
        </div>
        <div style={chartCard}>
          <AdminChart type="horizontal-bar" data={rtpChartData} title="RTP by Game (%)" color={theme.accent.neonGreen} height={180} />
        </div>
      </div>

      {/* User Distributions */}
      {distributions && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {distributions.vipTiers?.length > 0 && (
            <div style={chartCard}>
              <AdminChart type="bar" data={distributions.vipTiers.map((t: any) => ({ label: t.tier || t.vipTier, value: Number(t.count) }))} title="Users by VIP Tier" color="#FFD700" height={160} />
            </div>
          )}
          {distributions.topPlayers?.length > 0 && (
            <div style={chartCard}>
              <AdminChart type="horizontal-bar" data={distributions.topPlayers.slice(0, 8).map((p: any) => ({ label: p.username || 'Player', value: Number(p.totalWagered) / 1e9 }))} title="Top Players (SOL Wagered)" color={theme.accent.neonGreen} height={160} />
            </div>
          )}
        </div>
      )}

      {/* RTP Table */}
      {rtp.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>RTP Detail</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Game</th><th style={s.th}>Observed</th><th style={s.th}>Expected</th><th style={s.th}>Bets</th><th style={s.th}>Volume</th><th style={s.th}>Status</th></tr></thead>
              <tbody>
                {rtp.map((g, i) => {
                  const pct = g.observed * 100;
                  const st = pct > 100 || pct < 90 ? { l: 'Alert', c: theme.accent.red } : pct < 93 || pct > 97 ? { l: 'Watch', c: theme.warning } : { l: 'OK', c: theme.success };
                  return (
                    <tr key={i}>
                      <td style={s.td}><span style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' as const }}>{g.game}</span></td>
                      <td style={s.td}><span className="mono" style={{ fontWeight: 700, color: st.c }}>{pct.toFixed(2)}%</span></td>
                      <td style={s.td}><span className="mono" style={{ color: theme.text.muted }}>{(g.expected * 100).toFixed(1)}%</span></td>
                      <td style={s.td}>{g.bets?.toLocaleString() || '—'}</td>
                      <td style={s.td}><span className="mono">{g.volume ? formatSol(g.volume) + ' SOL' : '—'}</span></td>
                      <td style={s.td}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${st.c}15`, color: st.c, border: `1px solid ${st.c}30` }}>{st.l}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const chartCard = { background: theme.bg.secondary, borderRadius: 12, padding: 16, border: `1px solid ${theme.border.subtle}` };
