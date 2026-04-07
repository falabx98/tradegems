import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface OpsAlert {
  id: string;
  severity: string;
  category: string;
  message: string;
  userId?: string;
  game?: string;
  metadata?: unknown;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: theme.danger,
  warning: theme.warning,
  info: theme.info,
};

const AUTO_REFRESH_MS = 30_000;

export function OpsAlertsPage() {
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ severity: '', category: '', acknowledged: 'false' });
  const [categories, setCategories] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadAlerts();
    intervalRef.current = setInterval(loadAlerts, AUTO_REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [filter.severity, filter.category, filter.acknowledged]);

  async function loadAlerts() {
    try {
      const res = await adminApi.getOpsAlerts({
        severity: filter.severity || undefined,
        category: filter.category || undefined,
        acknowledged: filter.acknowledged || undefined,
        limit: 100,
      });
      const data = (res as any).data || [];
      setAlerts(data);
      // Extract unique categories
      const cats = [...new Set(data.map((a: OpsAlert) => a.category))].sort() as string[];
      setCategories((prev) => {
        const merged = [...new Set([...prev, ...cats])].sort();
        return merged;
      });
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function handleAcknowledge(id: string) {
    try {
      await adminApi.acknowledgeAlert({ id });
      addToast('Alert acknowledged');
      loadAlerts();
    } catch (err: any) {
      addToast(err.message || 'Failed to acknowledge', 'error');
    }
  }

  async function handleAcknowledgeAll() {
    try {
      const params: { category?: string } = {};
      if (filter.category) params.category = filter.category;
      const res = await adminApi.acknowledgeAlert(params);
      addToast(`${(res as any).acknowledged ?? 0} alert(s) acknowledged`);
      loadAlerts();
    } catch (err: any) {
      addToast(err.message || 'Failed to acknowledge', 'error');
    }
  }

  const unackedCount = alerts.filter((a) => !a.acknowledged).length;

  if (loading) return <div style={styles.loading}>Loading alerts...</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          Ops Alerts
          {unackedCount > 0 && (
            <span style={styles.unackedBadge}>{unackedCount}</span>
          )}
        </h2>
        <div style={styles.headerActions}>
          <span style={{ color: theme.text.muted, fontSize: theme.fontSize.xs }}>Auto-refresh: 30s</span>
          <button style={styles.refreshBtn} onClick={loadAlerts}>Refresh</button>
          {unackedCount > 0 && (
            <button style={styles.ackAllBtn} onClick={handleAcknowledgeAll}>
              Ack All{filter.category ? ` (${filter.category})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <select
          style={styles.select}
          value={filter.acknowledged}
          onChange={(e) => setFilter((f) => ({ ...f, acknowledged: e.target.value }))}
        >
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
          <option value="">All</option>
        </select>
        <select
          style={styles.select}
          value={filter.severity}
          onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value }))}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          style={styles.select}
          value={filter.category}
          onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div style={styles.empty}>No alerts found</div>
      ) : (
        <div style={styles.list}>
          {alerts.map((alert) => (
            <div key={alert.id} style={{
              ...styles.alertCard,
              borderLeftColor: SEVERITY_COLORS[alert.severity] || theme.text.muted,
              opacity: alert.acknowledged ? 0.6 : 1,
            }}>
              <div style={styles.alertTop}>
                <div style={styles.alertMeta}>
                  <SeverityBadge severity={alert.severity} />
                  <CategoryBadge category={alert.category} />
                  <span style={styles.alertTime}>{new Date(alert.createdAt).toLocaleString()}</span>
                </div>
                {!alert.acknowledged && (
                  <button style={styles.ackBtn} onClick={() => handleAcknowledge(alert.id)}>
                    Ack
                  </button>
                )}
                {alert.acknowledged && (
                  <span style={styles.ackedLabel}>Acked</span>
                )}
              </div>
              <div style={styles.alertMessage}>{alert.message}</div>
              {alert.userId && (
                <span style={styles.alertUserId}>User: {alert.userId.slice(0, 8)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLORS[severity] || theme.text.muted;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: theme.radius.full,
      fontSize: theme.fontSize.xs, fontWeight: 700, color, background: `${color}18`,
      border: `1px solid ${color}40`, textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: theme.radius.full,
      fontSize: theme.fontSize.xs, fontWeight: 500, color: theme.text.secondary,
      background: theme.bg.tertiary, border: `1px solid ${theme.border.subtle}`,
    }}>
      {category}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '20px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, fontSize: theme.fontSize.xl, fontWeight: 700, color: theme.text.primary, display: 'flex', alignItems: 'center', gap: '10px' },
  unackedBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '24px', height: '24px', padding: '0 6px',
    borderRadius: theme.radius.full, background: theme.danger, color: '#fff',
    fontSize: theme.fontSize.xs, fontWeight: 700,
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: '10px' },
  refreshBtn: {
    padding: '6px 14px', border: `1px solid ${theme.border.medium}`, borderRadius: theme.radius.md,
    background: 'transparent', color: theme.text.secondary, fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer',
  },
  ackAllBtn: {
    padding: '6px 14px', border: 'none', borderRadius: theme.radius.md,
    background: theme.accent.cyan, color: '#fff', fontSize: theme.fontSize.xs, fontWeight: 700, cursor: 'pointer',
  },
  filters: { display: 'flex', gap: '8px' },
  select: {
    padding: '8px 12px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.sm, outline: 'none',
  },
  empty: { color: theme.text.muted, textAlign: 'center', padding: '40px', fontSize: theme.fontSize.sm },
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  alertCard: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`,
    borderLeft: '4px solid', borderRadius: theme.radius.md, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  alertTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  alertMeta: { display: 'flex', alignItems: 'center', gap: '8px' },
  alertTime: { fontSize: theme.fontSize.xs, color: theme.text.muted },
  alertMessage: { fontSize: theme.fontSize.sm, color: theme.text.primary, lineHeight: 1.5 },
  alertUserId: { fontSize: theme.fontSize.xs, color: theme.text.muted, fontFamily: 'monospace' },
  ackBtn: {
    padding: '4px 12px', border: `1px solid ${theme.accent.cyan}`, borderRadius: theme.radius.sm,
    background: 'transparent', color: theme.accent.cyan, fontSize: theme.fontSize.xs, fontWeight: 600, cursor: 'pointer',
  },
  ackedLabel: { fontSize: theme.fontSize.xs, color: theme.success, fontWeight: 500 },
};
