import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';

interface Flag { id: string; flagKey: string; description: string; enabled: boolean; config: unknown; updatedAt: string; }

export function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const fetchFlags = () => apiFetch('/v1/admin/feature-flags').then((r: any) => setFlags(r.data || [])).catch(() => {});
  useEffect(() => { fetchFlags(); }, []);

  const toggleFlag = async (key: string, enabled: boolean) => {
    await apiFetch(`/v1/admin/feature-flags/${key}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    fetchFlags();
  };

  const createFlag = async () => {
    if (!newKey || !newDesc) return;
    await apiFetch('/v1/admin/feature-flags', { method: 'POST', body: JSON.stringify({ flagKey: newKey, description: newDesc, enabled: false }) });
    setNewKey(''); setNewDesc(''); setCreating(false);
    fetchFlags();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: theme.text.primary, margin: 0, fontSize: 16, fontWeight: 700 }}>Feature Flags</h3>
        <button onClick={() => setCreating(!creating)} style={actionBtn}>
          {creating ? 'Cancel' : '+ New Flag'}
        </button>
      </div>

      {creating && (
        <div style={card}>
          <input placeholder="flag_key" value={newKey} onChange={e => setNewKey(e.target.value)} style={input} />
          <input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} style={input} />
          <button onClick={createFlag} style={primaryBtn}>Create</button>
        </div>
      )}

      <div style={card}>
        {flags.length === 0 ? (
          <div style={{ color: theme.text.muted, fontSize: 13 }}>No feature flags configured</div>
        ) : (
          flags.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, fontFamily: "'JetBrains Mono', monospace" }}>{f.flagKey}</div>
                <div style={{ fontSize: 11, color: theme.text.muted }}>{f.description}</div>
              </div>
              <button
                onClick={() => toggleFlag(f.flagKey, !f.enabled)}
                style={{ ...toggleBtn, background: f.enabled ? 'rgba(0,231,1,0.15)' : 'rgba(255,255,255,0.04)', color: f.enabled ? '#00E701' : theme.text.muted }}
              >
                {f.enabled ? 'ON' : 'OFF'}
              </button>
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
const toggleBtn: React.CSSProperties = { padding: '4px 12px', fontSize: 11, fontWeight: 700, border: `1px solid ${theme.border.subtle}`, borderRadius: 6, cursor: 'pointer', letterSpacing: '0.05em' };
