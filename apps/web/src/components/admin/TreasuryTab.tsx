import { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { formatSol } from '../../utils/sol';
import { StatCard } from '../ui/StatCard';
import { AdminPageHeader } from './AdminPageHeader';
import { s } from './adminStyles';

interface TreasuryOverview { address: string; balanceSol: number; totalDeposits: number; totalDepositAmount: number; totalWithdrawals: number; totalWithdrawalAmount: number; pendingWithdrawals: number; }

export function TreasuryTab() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<TreasuryOverview | null>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [sweeping, setSweeping] = useState<string | null>(null);

  const load = () => {
    apiFetch<TreasuryOverview>('/v1/admin/treasury/overview').then(setData).catch(() => {});
    apiFetch<any>('/v1/admin/deposit-wallets?limit=50').then(r => setWallets((r as any)?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const sweep = async (userId: string) => {
    if (!confirm('Sweep this wallet to treasury?')) return;
    setSweeping(userId);
    try { await apiFetch(`/v1/admin/deposit-wallets/${userId}/sweep`, { method: 'POST' }); load(); toast.success('Wallet swept'); } catch { toast.error('Sweep failed'); } finally { setSweeping(null); }
  };

  if (!data) return <div style={{ color: theme.text.muted, padding: 20 }}>Loading treasury...</div>;

  return (
    <div>
      <AdminPageHeader title="Treasury" subtitle="Hot wallet and fund management" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Treasury Address" value={data.address.slice(0, 6) + '...' + data.address.slice(-4)} />
        <StatCard label="SOL Balance" value={`${data.balanceSol.toFixed(4)} SOL`} color={theme.success} trend="up" />
        <StatCard label="Total Deposits" value={data.totalDeposits.toLocaleString()} />
        <StatCard label="Deposit Amount" value={`${formatSol(data.totalDepositAmount)} SOL`} color={theme.accent.purple} />
        <StatCard label="Total Withdrawals" value={data.totalWithdrawals.toLocaleString()} />
        <StatCard label="Pending Withdrawals" value={data.pendingWithdrawals.toLocaleString()} color={theme.warning} />
      </div>

      {/* Deposit Wallets */}
      {wallets.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Deposit Wallets</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>User</th><th style={s.th}>Address</th><th style={s.th}>Last Swept</th><th style={s.th}>Actions</th></tr></thead>
              <tbody>
                {wallets.map((w: any) => (
                  <tr key={w.userId || w.id}>
                    <td style={s.td}><span style={s.username}>{w.username || w.userId?.slice(0, 8)}</span></td>
                    <td style={s.td}><span className="mono" style={{ fontSize: 11, color: theme.text.secondary }}>{w.address?.slice(0, 12)}...</span></td>
                    <td style={s.td}><span style={s.date}>{w.lastSweptAt ? new Date(w.lastSweptAt).toLocaleString() : 'Never'}</span></td>
                    <td style={s.td}>
                      <button onClick={() => sweep(w.userId)} disabled={sweeping === w.userId} style={s.actionBtnPurple}>
                        {sweeping === w.userId ? 'Sweeping...' : 'Sweep'}
                      </button>
                    </td>
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
