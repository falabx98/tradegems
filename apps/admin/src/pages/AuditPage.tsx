import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';

interface AuditLog {
  id: number;
  actorUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actorUsername?: string;
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs({ limit: 100 });
      // Handle both { data: [...] } and direct array response
      const data = Array.isArray(res) ? res : (res as { data: AuditLog[] }).data;
      setLogs(data);
    } catch {
      // silent
    }
    setLoading(false);
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'actorUserId', label: 'Actor', render: (l) => (
        <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>
          {l.actorUsername || l.actorUserId.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'actionType', label: 'Action', render: (l) => (
        <span style={{ fontWeight: 600, color: theme.accent.cyan }}>{l.actionType}</span>
      ),
    },
    {
      key: 'targetType', label: 'Target', render: (l) => (
        <span style={{ color: theme.text.secondary }}>{l.targetType}</span>
      ),
    },
    {
      key: 'targetId', label: 'Target ID', render: (l) => (
        <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs }}>{l.targetId.slice(0, 12)}</span>
      ),
    },
    {
      key: 'payload', label: 'Details', render: (l) => (
        <button
          style={styles.detailBtn}
          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === l.id ? null : l.id); }}
        >
          {expandedId === l.id ? 'Hide' : 'Show'}
        </button>
      ),
    },
    { key: 'ipAddress', label: 'IP', render: (l) => <span style={{ fontSize: theme.fontSize.xs, color: theme.text.muted }}>{l.ipAddress || '—'}</span> },
    { key: 'createdAt', label: 'Date', render: (l) => new Date(l.createdAt).toLocaleString() },
  ];

  return (
    <div style={styles.page}>
      {loading ? (
        <div style={styles.loading}>Loading audit logs...</div>
      ) : (
        <>
          <DataTable columns={columns} data={logs} keyField="id" emptyMessage="No audit logs" />

          {/* Expanded payload view */}
          {expandedId && (
            <div style={styles.payloadBox}>
              <h4 style={{ color: theme.text.primary, margin: '0 0 8px', fontSize: theme.fontSize.base }}>
                Payload — Entry #{expandedId}
              </h4>
              <pre style={styles.pre}>
                {JSON.stringify(logs.find((l) => l.id === expandedId)?.payload, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  detailBtn: {
    padding: '2px 8px', background: theme.bg.tertiary, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm, color: theme.text.secondary, fontSize: theme.fontSize.xs, cursor: 'pointer',
  },
  payloadBox: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '16px',
  },
  pre: {
    background: theme.bg.tertiary, padding: '12px', borderRadius: theme.radius.md,
    fontSize: theme.fontSize.xs, color: theme.accent.cyan, fontFamily: 'monospace',
    overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
    margin: 0,
  },
};
