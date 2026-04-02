import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';

interface Round {
  id: string;
  mode: string;
  status: string;
  playerCount: number;
  durationMs: number;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRound, setSelectedRound] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    loadRounds();
  }, [statusFilter]);

  async function loadRounds() {
    setLoading(true);
    try {
      const res = await adminApi.getRounds({ limit: 50, status: statusFilter || undefined });
      setRounds((res as { data: Round[] }).data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function openRound(round: Round) {
    try {
      const detail = await adminApi.getRoundDetail(round.id);
      setSelectedRound(detail as Record<string, unknown>);
    } catch {
      setSelectedRound({ ...round } as unknown as Record<string, unknown>);
    }
  }

  const sol = (l: number) => (l / 1e9).toFixed(4);

  const columns: Column<Round>[] = [
    { key: 'id', label: 'Round ID', width: '120px', render: (r) => <Mono>{r.id.slice(0, 8)}</Mono> },
    { key: 'mode', label: 'Mode' },
    {
      key: 'status', label: 'Status', render: (r) => {
        const colorMap: Record<string, string> = {
          scheduled: theme.info, entry_open: theme.warning, in_progress: theme.accent.purple,
          resolving: theme.warning, resolved: theme.success,
        };
        return <Badge color={colorMap[r.status] || theme.text.muted}>{r.status}</Badge>;
      },
    },
    { key: 'playerCount', label: 'Players' },
    { key: 'durationMs', label: 'Duration', render: (r) => `${r.durationMs / 1000}s` },
    { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  const statuses = ['', 'scheduled', 'entry_open', 'in_progress', 'resolving', 'resolved'];

  return (
    <div style={styles.page}>
      <div style={styles.filters}>
        {statuses.map((s) => (
          <button
            key={s}
            style={{
              ...styles.filterBtn,
              background: statusFilter === s ? theme.bg.tertiary : 'transparent',
              color: statusFilter === s ? theme.text.primary : theme.text.secondary,
            }}
            onClick={() => setStatusFilter(s)}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>Loading rounds...</div>
      ) : (
        <DataTable columns={columns} data={rounds} onRowClick={openRound} emptyMessage="No rounds found" />
      )}

      <Modal
        open={!!selectedRound}
        onClose={() => setSelectedRound(null)}
        title={`Round: ${(selectedRound?.id as string)?.slice(0, 8) || ''}`}
        width={600}
      >
        {selectedRound && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={styles.detailGrid}>
              <DetailRow label="ID" value={selectedRound.id as string} mono />
              <DetailRow label="Mode" value={selectedRound.mode as string} />
              <DetailRow label="Status" value={selectedRound.status as string} />
              <DetailRow label="Players" value={String(selectedRound.playerCount ?? 0)} />
              <DetailRow label="Duration" value={`${(selectedRound.durationMs as number) / 1000}s`} />
              <DetailRow label="Seed" value={(selectedRound.seed as string) || '—'} mono />
              <DetailRow label="Seed Commitment" value={(selectedRound.seedCommitment as string) || '—'} mono />
            </div>

            {!!selectedRound.pool && (
              <div>
                <h4 style={styles.subTitle}>Pool</h4>
                <div style={styles.detailGrid}>
                  <DetailRow label="Gross Pool" value={`${sol((selectedRound.pool as Record<string, number>).grossPool || 0)} SOL`} />
                  <DetailRow label="Fee Amount" value={`${sol((selectedRound.pool as Record<string, number>).feeAmount || 0)} SOL`} />
                  <DetailRow label="Net Pool" value={`${sol((selectedRound.pool as Record<string, number>).netPool || 0)} SOL`} />
                  <DetailRow label="Fee Rate" value={`${((selectedRound.pool as Record<string, number>).feeRate || 0) * 100}%`} />
                </div>
              </div>
            )}

            {!!selectedRound.nodes && Array.isArray(selectedRound.nodes) && (
              <div>
                <h4 style={styles.subTitle}>Nodes ({(selectedRound.nodes as unknown[]).length})</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(selectedRound.nodes as { nodeType: string; nodeValue: string; rarity: string }[]).map((n, i) => (
                    <span key={i} style={{
                      padding: '3px 8px', borderRadius: theme.radius.sm,
                      fontSize: theme.fontSize.xs, fontWeight: 600,
                      background: n.nodeType === 'multiplier' ? theme.success + '20' : n.nodeType === 'divider' ? theme.danger + '20' : theme.info + '20',
                      color: n.nodeType === 'multiplier' ? theme.success : n.nodeType === 'divider' ? theme.danger : theme.info,
                    }}>
                      {n.nodeType} {n.nodeValue}x ({n.rarity})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!!selectedRound.bets && Array.isArray(selectedRound.bets) && (selectedRound.bets as unknown[]).length > 0 && (
              <div>
                <h4 style={styles.subTitle}>Bets ({(selectedRound.bets as unknown[]).length})</h4>
                <div style={styles.detailGrid}>
                  {(selectedRound.bets as { userId: string; amount: number; riskTier: string; status: string }[]).map((b, i) => (
                    <DetailRow key={i} label={`${b.userId.slice(0, 8)} (${b.riskTier})`} value={`${sol(b.amount)} SOL — ${b.status}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{children}</span>;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: theme.radius.full,
      fontSize: theme.fontSize.xs, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}>{label}</span>
      <span style={{ color: theme.text.primary, fontSize: theme.fontSize.sm, fontFamily: mono ? 'monospace' : 'inherit', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  filters: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  filterBtn: {
    padding: '6px 14px', border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.sm,
    fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase',
  },
  detailGrid: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    background: theme.bg.card, padding: '12px 16px', borderRadius: theme.radius.md,
  },
  subTitle: { color: theme.text.primary, fontSize: theme.fontSize.base, fontWeight: 600, margin: 0 },
};
