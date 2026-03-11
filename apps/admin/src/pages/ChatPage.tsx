import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';
import { useToastStore } from '../stores/toastStore';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  channel: string;
  createdAt: string;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('global');
  const [muteUserId, setMuteUserId] = useState<string | null>(null);
  const [muteUsername, setMuteUsername] = useState('');
  const [muteDuration, setMuteDuration] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadMessages();
    intervalRef.current = setInterval(loadMessages, 10000);
    return () => clearInterval(intervalRef.current);
  }, [channel]);

  async function loadMessages() {
    try {
      const res = await adminApi.getChatMessages({ channel, limit: 100 });
      const data = res as { messages: ChatMessage[] };
      setMessages(data.messages || []);
    } catch {
      // silent
    }
    setLoading(false);
  }

  async function handleDelete(messageId: string) {
    try {
      await adminApi.deleteChatMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      addToast({ type: 'success', title: 'Message deleted' });
    } catch {
      addToast({ type: 'error', title: 'Failed to delete message' });
    }
  }

  async function handleMute() {
    if (!muteUserId) return;
    try {
      await adminApi.muteUser(muteUserId, muteDuration);
      addToast({ type: 'success', title: `${muteUsername} muted for ${muteDuration}m` });
      setMuteUserId(null);
    } catch {
      addToast({ type: 'error', title: 'Failed to mute user' });
    }
  }

  const columns: Column<ChatMessage>[] = [
    {
      key: 'username',
      label: 'User',
      width: '140px',
      render: (m) => <span style={{ fontWeight: 600, color: theme.accent.cyan }}>{m.username}</span>,
    },
    {
      key: 'message',
      label: 'Message',
      render: (m) => <span style={{ color: theme.text.primary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</span>,
    },
    { key: 'channel', label: 'Channel', width: '100px' },
    {
      key: 'createdAt',
      label: 'Time',
      width: '150px',
      render: (m) => <span style={{ fontSize: theme.fontSize.xs, color: theme.text.secondary }}>
        {new Date(m.createdAt).toLocaleString()}
      </span>,
    },
    {
      key: 'actions' as keyof ChatMessage,
      label: 'Actions',
      width: '140px',
      render: (m) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            style={styles.actionBtn}
            onClick={() => handleDelete(m.id)}
            title="Delete message"
          >
            🗑
          </button>
          <button
            style={{ ...styles.actionBtn, background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}
            onClick={() => { setMuteUserId(m.userId); setMuteUsername(m.username); }}
            title="Mute user"
          >
            🔇
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Chat Moderation</h2>
        <div style={styles.filters}>
          {['global'].map((ch) => (
            <button
              key={ch}
              style={{
                ...styles.filterBtn,
                background: channel === ch ? theme.bg.tertiary : 'transparent',
                color: channel === ch ? theme.text.primary : theme.text.secondary,
              }}
              onClick={() => setChannel(ch)}
            >
              #{ch}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        <div style={styles.statPill}>
          <span style={styles.statValue}>{messages.length}</span>
          <span style={styles.statLabel}>Messages</span>
        </div>
        <div style={styles.statPill}>
          <span style={styles.statValue}>{new Set(messages.map((m) => m.userId)).size}</span>
          <span style={styles.statLabel}>Users</span>
        </div>
        <span style={{ color: theme.text.muted, fontSize: theme.fontSize.xs }}>
          Auto-refreshes every 10s
        </span>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading messages...</div>
      ) : (
        <DataTable columns={columns} data={messages} emptyMessage="No messages in this channel" />
      )}

      {/* Mute Modal */}
      {muteUserId && (
        <div style={styles.modalBackdrop} onClick={() => setMuteUserId(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Mute {muteUsername}</h3>
            <p style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm, margin: '8px 0 16px' }}>
              User will be unable to send messages for the selected duration.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[5, 10, 30, 60, 1440].map((d) => (
                <button
                  key={d}
                  style={{
                    ...styles.durationBtn,
                    background: muteDuration === d ? 'rgba(153, 69, 255, 0.2)' : 'transparent',
                    borderColor: muteDuration === d ? theme.accent.purple : theme.border.subtle,
                    color: muteDuration === d ? theme.accent.cyan : theme.text.secondary,
                  }}
                  onClick={() => setMuteDuration(d)}
                >
                  {d < 60 ? `${d}m` : d === 60 ? '1h' : '24h'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button style={styles.cancelBtn} onClick={() => setMuteUserId(null)}>Cancel</button>
              <button style={styles.muteBtn} onClick={handleMute}>Mute User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  filters: { display: 'flex', gap: '4px' },
  filterBtn: {
    padding: '6px 14px', border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.sm,
    fontSize: theme.fontSize.sm, fontWeight: 600, cursor: 'pointer',
  },
  statsBar: {
    display: 'flex', alignItems: 'center', gap: '12px',
  },
  statPill: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 14px', borderRadius: '20px',
    background: 'rgba(153, 69, 255, 0.06)', border: `1px solid ${theme.border.subtle}`,
  },
  statValue: {
    fontSize: theme.fontSize.sm, fontWeight: 700, color: theme.accent.cyan,
    fontFamily: '"JetBrains Mono", monospace',
  },
  statLabel: {
    fontSize: theme.fontSize.xs, fontWeight: 500, color: theme.text.muted,
  },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
  actionBtn: {
    width: '30px', height: '30px', borderRadius: '6px',
    background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '14px',
  },
  modalBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: theme.bg.card, border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.lg, padding: '24px', maxWidth: '400px', width: '100%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
  },
  modalTitle: {
    fontSize: theme.fontSize.md, fontWeight: 700, color: theme.text.primary, margin: 0,
  },
  durationBtn: {
    padding: '8px 16px', borderRadius: theme.radius.sm, border: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer', fontSize: theme.fontSize.sm, fontWeight: 600,
  },
  cancelBtn: {
    padding: '8px 16px', background: 'transparent', border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.sm, cursor: 'pointer', color: theme.text.secondary,
    fontSize: theme.fontSize.sm, fontWeight: 600,
  },
  muteBtn: {
    padding: '8px 16px', background: '#fbbf24', border: 'none',
    borderRadius: theme.radius.sm, cursor: 'pointer', color: '#000',
    fontSize: theme.fontSize.sm, fontWeight: 700,
  },
};
