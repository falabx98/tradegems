import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { theme } from '../styles/theme';
import { DataTable, type Column } from '../components/DataTable';
import { adminApi } from '../utils/api';

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
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

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
      width: '180px',
      render: (m) => new Date(m.createdAt).toLocaleString(),
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ flex: 1 }} />
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

      <div style={styles.info}>
        <span style={{ color: theme.text.muted, fontSize: theme.fontSize.xs }}>
          Auto-refreshes every 10s • Showing last 100 messages
        </span>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading messages...</div>
      ) : (
        <DataTable columns={columns} data={messages} emptyMessage="No messages in this channel" />
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
  info: { display: 'flex', alignItems: 'center', gap: '8px' },
  loading: { color: theme.text.secondary, textAlign: 'center', padding: '40px' },
};
