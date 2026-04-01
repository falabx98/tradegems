import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';

interface ConfigVersion { id: string; version: number; config: unknown; isActive: boolean; activatedBy: string | null; activatedAt: string | null; createdAt: string; }

export function EngineConfigTab() {
  const [configs, setConfigs] = useState<ConfigVersion[]>([]);
  const [creating, setCreating] = useState(false);
  const [newConfig, setNewConfig] = useState('{}');

  const fetchConfigs = () => apiFetch('/v1/admin/engine-config/history').then((r: any) => setConfigs(r.data || [])).catch(() => {});
  useEffect(() => { fetchConfigs(); }, []);

  const createConfig = async () => {
    try {
      const parsed = JSON.parse(newConfig);
      await apiFetch('/v1/admin/engine-config', { method: 'POST', body: JSON.stringify({ config: parsed }) });
      setCreating(false); setNewConfig('{}');
      fetchConfigs();
    } catch { alert('Invalid JSON'); }
  };

  const activateConfig = async (id: string) => {
    if (!confirm('Activate this config version?')) return;
    await apiFetch(`/v1/admin/engine-config/${id}/activate`, { method: 'PATCH' });
    fetchConfigs();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: theme.text.primary, margin: 0, fontSize: 16, fontWeight: 700 }}>Engine Configuration</h3>
        <button onClick={() => setCreating(!creating)} style={actionBtn}>
          {creating ? 'Cancel' : '+ New Version'}
        </button>
      </div>

      {creating && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, marginBottom: 8 }}>Config JSON</div>
          <textarea value={newConfig} onChange={e => setNewConfig(e.target.value)} style={{ ...input, minHeight: 120, fontFamily: "'JetBrains Mono', monospace", resize: 'vertical' }} />
          <button onClick={createConfig} style={primaryBtn}>Create Version</button>
        </div>
      )}

      <div style={card}>
        {configs.length === 0 ? (
          <div style={{ color: theme.text.muted, fontSize: 13 }}>No config versions</div>
        ) : (
          configs.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary }}>v{c.version}</span>
                  {c.isActive && <span style={{ fontSize: 10, fontWeight: 700, color: '#00E701', background: 'rgba(0,231,1,0.1)', padding: '2px 6px', borderRadius: 4 }}>ACTIVE</span>}
                </div>
                <div style={{ fontSize: 11, color: theme.text.muted }}>{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              {!c.isActive && (
                <button onClick={() => activateConfig(c.id)} style={actionBtn}>Activate</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: theme.bg.secondary, borderRadius: 12, border: `1px solid ${theme.border.subtle}`, padding: 16 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', background: theme.bg.tertiary, border: `1px solid ${theme.border.subtle}`, borderRadius: 8, color: theme.text.primary, fontSize: 13, marginBottom: 8 };
const actionBtn: React.CSSProperties = { padding: '6px 14px', fontSize: 12, fontWeight: 600, color: theme.accent.purple, background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.2)`, borderRadius: 8, cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', background: theme.accent.purple, border: 'none', borderRadius: 8, cursor: 'pointer' };
