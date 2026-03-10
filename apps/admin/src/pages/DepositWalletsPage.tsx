import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface DepositWallet {
  id: string;
  userId: string;
  address: string;
  isActive: boolean;
  lastSweptAt: string | null;
  createdAt: string;
  username?: string;
}

export function DepositWalletsPage() {
  const [wallets, setWallets] = useState<DepositWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DepositWallet | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadWallets();
  }, []);

  async function loadWallets() {
    setLoading(true);
    try {
      const res = await adminApi.getDepositWallets({ limit: 100 });
      setWallets((res as { data: DepositWallet[] }).data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function openWallet(wallet: DepositWallet) {
    setSelected(wallet);
    setBalance(null);
    try {
      const res = await adminApi.getDepositWalletBalance(wallet.userId);
      setBalance((res as { balanceLamports: number }).balanceLamports);
    } catch {
      setBalance(0);
    }
  }

  async function handleSweep() {
    if (!selected) return;
    setSweeping(true);
    try {
      await adminApi.sweepDepositWallet(selected.userId);
      addToast('Wallet swept to treasury successfully');
      setSelected(null);
      loadWallets();
    } catch {
      addToast('Failed to sweep wallet', 'error');
    }
    setSweeping(false);
  }

  const sol = (l: number) => (l / 1e9).toFixed(6);

  const columns: Column<DepositWallet>[] = [
    {
      key: 'userId',
      label: 'User',
      width: '120px',
      render: (w) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{(w.username || w.userId).slice(0, 12)}</span>,
    },
    {
      key: 'address',
      label: 'Address',
      render: (w) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{w.address.slice(0, 20)}...</span>,
    },
    {
      key: 'isActive',
      label: 'Active',
      width: '80px',
      render: (w) => <Badge color={w.isActive ? theme.success : theme.text.muted}>{w.isActive ? 'Yes' : 'No'}</Badge>,
    },
    {
      key: 'lastSweptAt',
      label: 'Last Swept',
      width: '160px',
      render: (w) => w.lastSweptAt ? new Date(w.lastSweptAt).toLocaleString() : '—',
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: '160px',
      render: (w) => new Date(w.createdAt).toLocaleString(),
    },
  ];

  return (
    <div style={styles.page}>
      {loading ? (
        <div style={styles.loading}>Loading wallets...</div>
      ) : (
        <DataTable columns={columns} data={wallets} onRowClick={openWallet} emptyMessage="No deposit wallets" />
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Deposit Wallet"
        width={480}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={styles.detailGrid}>
              <DetailRow label="User ID" value={selected.userId} mono />
              <DetailRow label="Address" value={selected.address} mono />
              <DetailRow label="Active" value={selected.isActive ? 'Yes' : 'No'} />
              <DetailRow label="On-Chain Balance" value={balance !== null ? `${sol(balance)} SOL` : 'Loading...'} />
              <DetailRow label="Last Swept" value={selected.lastSweptAt ? new Date(selected.lastSweptAt).toLocaleString() : 'Never'} />
            </div>

            {balance !== null && balance > 0 && (
              <button style={styles.sweepBtn} onClick={handleSweep} disabled={sweeping}>
                {sweeping ? 'Sweeping...' : `Sweep ${sol(balance)} SOL to Treasury`}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}>{label}</span>
      <span style={{ color: theme.text.primary, fontSize: theme.fontSize.sm, fontFamily: mono ? 'monospace' : 'inherit', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-all' as const }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  detailGrid: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    background: theme.bg.card, padding: '12px 16px', borderRadius: theme.radius.md,
  },
  sweepBtn: {
    padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer',
  },
};
