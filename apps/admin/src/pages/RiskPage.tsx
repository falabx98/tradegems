import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';

interface RiskFlag {
  id: string;
  userId: string;
  flagType: string;
  severity: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export function RiskPage() {
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<RiskFlag | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  useEffect(() => {
    loadFlags();
  }, [showResolved]);

  async function loadFlags() {
    setLoading(true);
    try {
      const res = await adminApi.getRiskFlags({ resolved: showResolved, limit: 50 });
      setFlags((res as { data: RiskFlag[] }).data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function handleResolve() {
    if (!resolveTarget) return;
    try {
      await adminApi.resolveRiskFlag(resolveTarget.id, { notes: resolveNotes });
      setResolveTarget(null);
      setResolveNotes('');
      loadFlags();
    } catch {
      // silent
    }
  }

  const severityColor = (s: string) => {
    const map: Record<string, string> = { low: theme.info, medium: theme.warning, high: '#ff8c42', critical: theme.danger };
    return map[s] || theme.text.muted;
  };

  const columns: Column<RiskFlag>[] = [
    { key: 'userId', label: 'User', width: '120px', render: (f) => <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{f.userId.slice(0, 8)}</span> },
    { key: 'flagType', label: 'Type', render: (f) => <span style={{ fontWeight: 600 }}>{f.flagType}</span> },
    {
      key: 'severity', label: 'Severity', render: (f) => {
        const c = severityColor(f.severity);
        return <span style={{ color: c, fontWeight: 700, fontSize: theme.fontSize.xs, textTransform: 'uppercase', padding: '2px 8px', borderRadius: theme.radius.full, background: c + '18', border: `1px solid ${c}40` }}>{f.severity}</span>;
      },
    },
    { key: 'metadata', label: 'Details', render: (f) => <span style={{ fontSize: theme.fontSize.xs, color: theme.text.secondary }}>{JSON.stringify(f.metadata).slice(0, 60)}</span> },
    {
      key: 'resolved', label: 'Status', render: (f) => f.resolved
        ? <span style={{ color: theme.success, fontSize: theme.fontSize.xs }}>Resolved</span>
        : <span style={{ color: theme.warning, fontSize: theme.fontSize.xs }}>Open</span>,
    },
    { key: 'createdAt', label: 'Created', render: (f) => new Date(f.createdAt).toLocaleString() },
    {
      key: 'actions', label: '', render: (f) => {
        if (f.resolved) return null;
        return (
          <button style={styles.resolveBtn} onClick={(e) => { e.stopPropagation(); setResolveTarget(f); }}>
            Resolve
          </button>
        );
      },
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h3 style={styles.title}>Risk Flags</h3>
        <button
          style={{ ...styles.filterBtn, background: showResolved ? theme.bg.tertiary : theme.bg.card }}
          onClick={() => setShowResolved(!showResolved)}
        >
          {showResolved ? 'Show Resolved' : 'Show Open Only'}
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading risk flags...</div>
      ) : (
        <DataTable columns={columns} data={flags} emptyMessage="No risk flags found" />
      )}

      <Modal open={!!resolveTarget} onClose={() => setResolveTarget(null)} title="Resolve Risk Flag" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}>
            Flag: <strong>{resolveTarget?.flagType}</strong> — {resolveTarget?.severity}
          </div>
          <label style={styles.formLabel}>
            Resolution Notes
            <textarea
              style={styles.textarea}
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              rows={4}
              placeholder="Describe the resolution..."
            />
          </label>
          <button style={styles.submitBtn} onClick={handleResolve}>Mark as Resolved</button>
        </div>
      </Modal>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  filterBtn: {
    padding: '6px 14px', border: `1px solid ${theme.border.medium}`, borderRadius: theme.radius.sm,
    color: theme.text.secondary, fontSize: theme.fontSize.sm, cursor: 'pointer',
  },
  resolveBtn: {
    padding: '4px 12px', background: theme.success + '18', border: `1px solid ${theme.success}40`,
    borderRadius: theme.radius.sm, color: theme.success, fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer',
  },
  formLabel: { display: 'flex', flexDirection: 'column', gap: '4px', color: theme.text.secondary, fontSize: theme.fontSize.sm },
  textarea: {
    padding: '10px 12px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.base, outline: 'none', resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  submitBtn: {
    padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer',
  },
};
