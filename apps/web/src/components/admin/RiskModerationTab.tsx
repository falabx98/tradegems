import { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';

interface RiskFlag { id: string; severity: string; category: string; description: string; resolved: boolean; resolvedBy: string | null; createdAt: string; }
interface ChatMsg { id: string; userId: string; username: string; message: string; channel: string; createdAt: string; }

export function RiskModerationTab() {
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchFlags = () => apiFetch('/v1/admin/risk-flags').then((r: any) => setFlags(r.data || [])).catch(() => {});
  const fetchMessages = () => apiFetch('/v1/admin/chat/messages').then((r: any) => setMessages(r.data || [])).catch(() => {});
  useEffect(() => { fetchFlags(); fetchMessages(); }, []);

  const resolveFlag = async (id: string) => {
    if (!resolveNotes.trim()) return alert('Notes required');
    await apiFetch(`/v1/admin/risk-flags/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ notes: resolveNotes }) });
    setResolvingId(null); setResolveNotes('');
    fetchFlags();
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    await apiFetch(`/v1/admin/chat/messages/${id}`, { method: 'DELETE' });
    fetchMessages();
  };

  const sevColor = (s: string) => s === 'critical' ? '#FF3333' : s === 'high' ? '#FF6B35' : s === 'medium' ? '#EAB308' : theme.text.muted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Risk Flags */}
      <div>
        <h3 style={{ color: theme.text.primary, margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>Risk Flags</h3>
        <div style={card}>
          {flags.length === 0 ? (
            <div style={{ color: theme.text.muted, fontSize: 13 }}>No risk flags</div>
          ) : flags.map(f => (
            <div key={f.id} style={{ padding: '10px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sevColor(f.severity), textTransform: 'uppercase', marginRight: 8 }}>{f.severity}</span>
                  <span style={{ fontSize: 13, color: theme.text.primary }}>{f.description}</span>
                </div>
                {!f.resolved && (
                  resolvingId === f.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input placeholder="Resolution notes" value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} style={{ ...input, width: 200, marginBottom: 0 }} />
                      <button onClick={() => resolveFlag(f.id)} style={primaryBtn}>Resolve</button>
                    </div>
                  ) : (
                    <button onClick={() => setResolvingId(f.id)} style={actionBtn}>Resolve</button>
                  )
                )}
                {f.resolved && <span style={{ fontSize: 11, color: '#00E701' }}>✓ Resolved</span>}
              </div>
              <div style={{ fontSize: 10, color: theme.text.muted, marginTop: 4 }}>{new Date(f.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Moderation */}
      <div>
        <h3 style={{ color: theme.text.primary, margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>Chat Messages</h3>
        <div style={card}>
          {messages.length === 0 ? (
            <div style={{ color: theme.text.muted, fontSize: 13 }}>No messages</div>
          ) : messages.slice(0, 50).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border.subtle}` }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.accent.purple, marginRight: 8 }}>{m.username}</span>
                <span style={{ fontSize: 12, color: theme.text.secondary }}>{m.message}</span>
              </div>
              <button onClick={() => deleteMessage(m.id)} style={{ ...actionBtn, color: '#FF3333', borderColor: 'rgba(255,51,51,0.2)', background: 'rgba(255,51,51,0.06)' }}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: theme.bg.secondary, borderRadius: 12, border: `1px solid ${theme.border.subtle}`, padding: 16 };
const input: React.CSSProperties = { padding: '6px 10px', background: theme.bg.tertiary, border: `1px solid ${theme.border.subtle}`, borderRadius: 6, color: theme.text.primary, fontSize: 12 };
const actionBtn: React.CSSProperties = { padding: '4px 12px', fontSize: 11, fontWeight: 600, color: theme.accent.purple, background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.2)`, borderRadius: 6, cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: theme.accent.purple, border: 'none', borderRadius: 6, cursor: 'pointer' };
