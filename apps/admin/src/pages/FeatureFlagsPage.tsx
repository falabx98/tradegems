import { useEffect, useState, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { Modal } from '../components/Modal';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface FeatureFlag {
  id: string;
  flagKey: string;
  enabled: boolean;
  description: string | null;
  config: Record<string, unknown>;
  updatedAt: string;
}

export function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editConfig, setEditConfig] = useState('');

  useEffect(() => {
    loadFlags();
  }, []);

  async function loadFlags() {
    setLoading(true);
    try {
      const res = await adminApi.getFeatureFlags();
      setFlags(res as FeatureFlag[]);
    } catch {
      // silent
    }
    setLoading(false);
  }

  const addToast = useToastStore((s) => s.addToast);

  async function toggleFlag(key: string, enabled: boolean) {
    try {
      await adminApi.updateFeatureFlag(key, { enabled });
      setFlags((prev) => prev.map((f) => f.flagKey === key ? { ...f, enabled } : f));
      addToast(`Flag ${enabled ? 'enabled' : 'disabled'}`);
    } catch {
      addToast('Failed to toggle flag', 'error');
    }
  }

  async function handleCreate() {
    if (!newKey.trim()) return;
    try {
      await adminApi.createFeatureFlag({ flagKey: newKey.trim(), description: newDesc || newKey });
      addToast('Flag created');
      setCreateModal(false);
      setNewKey('');
      setNewDesc('');
      loadFlags();
    } catch {
      addToast('Failed to create flag', 'error');
    }
  }

  async function handleUpdateConfig() {
    if (!editFlag) return;
    try {
      const config = JSON.parse(editConfig);
      await adminApi.updateFeatureFlag(editFlag.flagKey, { config });
      addToast('Config saved');
      setEditFlag(null);
      loadFlags();
    } catch {
      addToast('Invalid JSON config', 'error');
    }
  }

  if (loading) return <div style={styles.loading}>Loading feature flags...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ flex: 1 }} />
        <button style={styles.addBtn} onClick={() => setCreateModal(true)}>+ New Flag</button>
      </div>

      <div style={styles.flagList}>
        {flags.length === 0 ? (
          <div style={{ color: theme.text.muted, textAlign: 'center', padding: '40px' }}>No feature flags configured</div>
        ) : (
          flags.map((flag) => (
            <div key={flag.id} style={styles.flagCard}>
              <div style={styles.flagTop}>
                <div style={styles.flagInfo}>
                  <span style={styles.flagKey}>{flag.flagKey}</span>
                  <span style={styles.flagDesc}>{flag.description || '—'}</span>
                </div>
                <div style={styles.flagActions}>
                  <button
                    style={styles.configBtn}
                    onClick={() => { setEditFlag(flag); setEditConfig(JSON.stringify(flag.config, null, 2)); }}
                  >
                    Config
                  </button>
                  <button
                    style={{
                      ...styles.toggle,
                      background: flag.enabled ? theme.success : theme.bg.tertiary,
                      borderColor: flag.enabled ? theme.success : theme.border.medium,
                    }}
                    onClick={() => toggleFlag(flag.flagKey, !flag.enabled)}
                  >
                    <span style={{
                      ...styles.toggleDot,
                      transform: flag.enabled ? 'translateX(20px)' : 'translateX(0)',
                    }} />
                  </button>
                </div>
              </div>
              <div style={styles.flagMeta}>
                Updated: {new Date(flag.updatedAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Feature Flag" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={styles.formLabel}>
            Flag Key
            <input style={styles.formInput} placeholder="e.g. enable_leaderboard_v2" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </label>
          <label style={styles.formLabel}>
            Description
            <input style={styles.formInput} placeholder="What does this flag do?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </label>
          <button style={styles.submitBtn} onClick={handleCreate}>Create Flag</button>
        </div>
      </Modal>

      {/* Edit Config Modal */}
      <Modal open={!!editFlag} onClose={() => setEditFlag(null)} title={`Config: ${editFlag?.flagKey}`} width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea
            style={styles.textarea}
            value={editConfig}
            onChange={(e) => setEditConfig(e.target.value)}
            rows={12}
            spellCheck={false}
          />
          <button style={styles.submitBtn} onClick={handleUpdateConfig}>Save Config</button>
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
  addBtn: {
    padding: '8px 16px', background: theme.accent.cyan, border: 'none', borderRadius: theme.radius.md,
    color: theme.text.inverse, fontWeight: 600, fontSize: theme.fontSize.sm, cursor: 'pointer',
  },
  flagList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  flagCard: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg,
    padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
  },
  flagTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  flagInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  flagKey: { fontWeight: 700, color: theme.text.primary, fontSize: theme.fontSize.base, fontFamily: 'monospace' },
  flagDesc: { color: theme.text.secondary, fontSize: theme.fontSize.sm },
  flagActions: { display: 'flex', alignItems: 'center', gap: '10px' },
  configBtn: {
    padding: '4px 10px', background: theme.bg.tertiary, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm, color: theme.text.secondary, fontSize: theme.fontSize.xs, cursor: 'pointer',
  },
  toggle: {
    width: '44px', height: '24px', borderRadius: '12px', border: '1px solid',
    position: 'relative' as const, cursor: 'pointer', padding: 0, transition: 'all 0.2s',
  },
  toggleDot: {
    display: 'block', width: '18px', height: '18px', borderRadius: '50%',
    background: '#fff', position: 'absolute' as const, top: '2px', left: '2px', transition: 'transform 0.2s',
  },
  flagMeta: { fontSize: theme.fontSize.xs, color: theme.text.muted },
  formLabel: { display: 'flex', flexDirection: 'column', gap: '4px', color: theme.text.secondary, fontSize: theme.fontSize.sm },
  formInput: {
    padding: '10px 12px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.base, outline: 'none',
  },
  textarea: {
    width: '100%', padding: '12px', background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md, color: theme.text.primary, fontSize: theme.fontSize.sm,
    fontFamily: 'monospace', resize: 'vertical' as const, outline: 'none',
  },
  submitBtn: {
    padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: theme.radius.md,
    color: '#fff', fontWeight: 600, fontSize: theme.fontSize.base, cursor: 'pointer',
  },
};
