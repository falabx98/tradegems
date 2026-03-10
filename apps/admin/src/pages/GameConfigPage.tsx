import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';

interface ConfigVersion {
  id: string;
  version: number;
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  config: Record<string, unknown>;
}

export function GameConfigPage() {
  const [activeConfig, setActiveConfig] = useState<ConfigVersion | null>(null);
  const [history, setHistory] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editJson, setEditJson] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const [active, hist] = await Promise.all([
        adminApi.getEngineConfig().catch(() => null),
        adminApi.getEngineConfigHistory().catch(() => ({ data: [] })),
      ]);
      setActiveConfig(active as ConfigVersion | null);
      setHistory((hist as { data: ConfigVersion[] }).data);
      if (active && (active as ConfigVersion).config) {
        setEditJson(JSON.stringify((active as ConfigVersion).config, null, 2));
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function handleSave() {
    setError('');
    try {
      const config = JSON.parse(editJson);
      setSaving(true);
      await adminApi.createEngineConfig(config);
      await loadConfig();
      setShowEditor(false);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Invalid JSON' : 'Failed to save config');
    }
    setSaving(false);
  }

  async function handleActivate(id: string) {
    try {
      await adminApi.activateEngineConfig(id);
      await loadConfig();
    } catch {
      // silent
    }
  }

  const historyColumns: Column<ConfigVersion>[] = [
    { key: 'version', label: 'Version', render: (c) => <span style={{ fontWeight: 700, color: theme.accent.cyan }}>v{c.version}</span> },
    {
      key: 'isActive', label: 'Status', render: (c) => c.isActive
        ? <span style={{ color: theme.success, fontWeight: 600, fontSize: theme.fontSize.xs }}>ACTIVE</span>
        : <span style={{ color: theme.text.muted, fontSize: theme.fontSize.xs }}>inactive</span>,
    },
    { key: 'createdAt', label: 'Created', render: (c) => new Date(c.createdAt).toLocaleString() },
    { key: 'activatedAt', label: 'Activated', render: (c) => c.activatedAt ? new Date(c.activatedAt).toLocaleString() : '—' },
    {
      key: 'actions', label: '', render: (c) => {
        if (c.isActive) return null;
        return (
          <button style={styles.activateBtn} onClick={(e) => { e.stopPropagation(); handleActivate(c.id); }}>
            Activate
          </button>
        );
      },
    },
  ];

  if (loading) return <div style={styles.loading}>Loading config...</div>;

  return (
    <div style={styles.page}>
      {/* Active Config */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Active Configuration</h3>
          <button style={styles.editBtn} onClick={() => setShowEditor(!showEditor)}>
            {showEditor ? 'Cancel' : 'Edit Config'}
          </button>
        </div>

        {activeConfig?.config ? (
          <div style={styles.configPreview}>
            {renderConfigSummary(activeConfig.config)}
          </div>
        ) : (
          <div style={{ color: theme.text.muted, padding: '20px' }}>No active config — using defaults</div>
        )}
      </div>

      {/* JSON Editor */}
      {showEditor && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Config Editor (JSON)</h3>
          <textarea
            style={styles.textarea}
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            rows={20}
            spellCheck={false}
          />
          {error && <div style={{ color: theme.danger, fontSize: theme.fontSize.sm }}>{error}</div>}
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save as New Version'}
          </button>
        </div>
      )}

      {/* Version History */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Version History</h3>
        <DataTable
          columns={historyColumns}
          data={history}
          emptyMessage="No config versions"
          onRowClick={(c) => {
            setEditJson(JSON.stringify(c.config, null, 2));
            setShowEditor(true);
          }}
        />
      </div>
    </div>
  );
}

function renderConfigSummary(config: Record<string, unknown>) {
  const entries = Object.entries(config);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
          <span style={{ color: theme.accent.cyan, fontSize: theme.fontSize.sm, fontWeight: 600 }}>{key}</span>
          <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.xs, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {typeof value === 'object' ? JSON.stringify(value).slice(0, 60) + '...' : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '28px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  configPreview: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '16px', maxHeight: '300px', overflowY: 'auto',
  },
  editBtn: {
    padding: '8px 16px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.accent.cyan, fontSize: theme.fontSize.sm,
    fontWeight: 600, cursor: 'pointer',
  },
  textarea: {
    width: '100%', padding: '14px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.sm,
    fontFamily: 'monospace', resize: 'vertical' as const, outline: 'none', minHeight: '300px',
  },
  saveBtn: {
    padding: '10px 20px', background: theme.gradient.solana, border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer', width: 'fit-content',
  },
  activateBtn: {
    padding: '4px 12px', background: theme.success + '18', border: `1px solid ${theme.success}40`,
    borderRadius: theme.radius.sm, color: theme.success, fontSize: theme.fontSize.xs,
    fontWeight: 600, cursor: 'pointer',
  },
};
