import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { formatSol } from '../../utils/sol';

export function ReferralsAnalyticsTab() {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [refStats, setRefStats] = useState<any>(null);
  const [distributions, setDistributions] = useState<any>(null);

  useEffect(() => {
    apiFetch('/v1/admin/referrals').then((r: any) => setReferrals(r.data || [])).catch(() => {});
    apiFetch('/v1/admin/referrals/stats').then((r: any) => setRefStats(r)).catch(() => {});
    apiFetch('/v1/admin/analytics/distributions').then((r: any) => setDistributions(r)).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Referral Stats */}
      <div>
        <h3 style={{ color: theme.text.primary, margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>Referral Program</h3>
        {refStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <StatBox label="Total Codes" value={refStats.totalCodes || 0} />
            <StatBox label="Total Referrals" value={refStats.totalReferrals || 0} />
            <StatBox label="Total Earnings" value={`${formatSol(refStats.totalEarnings || 0)} SOL`} />
            <StatBox label="Claimed" value={`${formatSol(refStats.claimedAmount || 0)} SOL`} />
          </div>
        )}
        <div style={card}>
          {referrals.length === 0 ? (
            <div style={{ color: theme.text.muted, fontSize: 13 }}>No referral codes</div>
          ) : referrals.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
              <div>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: theme.accent.purple }}>{r.code}</span>
                <span style={{ fontSize: 11, color: theme.text.muted, marginLeft: 8 }}>by {r.username || 'unknown'}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: theme.text.secondary }}>{r.referralCount || 0} referrals</span>
                <span className="mono" style={{ fontSize: 11, color: theme.accent.neonGreen }}>{formatSol(r.earnings || 0)} SOL</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analytics Distributions */}
      <div>
        <h3 style={{ color: theme.text.primary, margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>Analytics Distributions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* VIP Tier Distribution */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, marginBottom: 8 }}>VIP Tier Distribution</div>
            {distributions?.vipDistribution ? distributions.vipDistribution.map((d: any) => (
              <div key={d.tier} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: theme.text.primary, textTransform: 'capitalize' }}>{d.tier}</span>
                <span className="mono" style={{ color: theme.text.secondary }}>{d.count}</span>
              </div>
            )) : <div style={{ color: theme.text.muted, fontSize: 12 }}>Loading...</div>}
          </div>

          {/* Top Players */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, marginBottom: 8 }}>Top 10 by Wagered</div>
            {distributions?.topPlayers ? distributions.topPlayers.map((p: any, i: number) => (
              <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: theme.text.primary }}>#{i + 1} {p.username || 'Unknown'}</span>
                <span className="mono" style={{ color: theme.accent.neonGreen }}>{formatSol(p.totalWagered || 0)}</span>
              </div>
            )) : <div style={{ color: theme.text.muted, fontSize: 12 }}>Loading...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: theme.bg.secondary, borderRadius: 8, border: `1px solid ${theme.border.subtle}`, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: theme.text.primary, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: theme.bg.secondary, borderRadius: 12, border: `1px solid ${theme.border.subtle}`, padding: 16 };
