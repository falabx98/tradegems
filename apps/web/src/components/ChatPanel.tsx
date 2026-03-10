import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { api } from '../utils/api';
import { theme } from '../styles/theme';
import { isPhotoAvatar, getAvatarGradient, getInitials } from '../utils/avatars';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  channel: string;
  createdAt: string;
  avatar?: string | null;
  level?: number;
}

// SVG Icons
function ChatIcon({ size = 18, color = '#9945FF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function ChatPanel() {
  const chatOpen = useGameStore((s) => s.chatOpen);
  const toggleChat = useGameStore((s) => s.toggleChat);
  const incrementUnreadChat = useGameStore((s) => s.incrementUnreadChat);
  const profile = useGameStore((s) => s.profile);
  const { isAuthenticated, userId } = useAuthStore();
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTimestampRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLoadedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const fetchMessages = useCallback(async (isInitial = false) => {
    try {
      const afterParam = isInitial ? undefined : (lastTimestampRef.current || undefined);
      const res = await api.getChatMessages('global', afterParam);
      const newMsgs = res.messages || [];

      // Update online count from server response
      if (typeof (res as any).onlineCount === 'number') {
        setOnlineCount((res as any).onlineCount);
      }

      if (newMsgs.length > 0) {
        lastTimestampRef.current = newMsgs[newMsgs.length - 1].createdAt;

        if (isInitial) {
          setMessages(newMsgs);
        } else {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const filtered = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));
            if (filtered.length === 0) return prev;
            return [...prev, ...filtered];
          });
        }
        setTimeout(scrollToBottom, 100);
      } else if (isInitial) {
        // Even with no messages, update online count
      }
    } catch (err) {
      console.warn('Chat fetch failed:', err);
    }
  }, [scrollToBottom]);

  const fetchUnread = useCallback(async () => {
    if (chatOpen) return;
    try {
      const afterParam = lastTimestampRef.current || undefined;
      const res = await api.getChatMessages('global', afterParam);
      const newMsgs = res.messages || [];

      if (typeof (res as any).onlineCount === 'number') {
        setOnlineCount((res as any).onlineCount);
      }

      if (newMsgs.length > 0) {
        lastTimestampRef.current = newMsgs[newMsgs.length - 1].createdAt;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const filtered = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));
          if (filtered.length === 0) return prev;
          incrementUnreadChat(filtered.length);
          return [...prev, ...filtered];
        });
      }
    } catch {
      // Silently fail
    }
  }, [chatOpen, incrementUnreadChat]);

  useEffect(() => {
    if (chatOpen && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchMessages(true);
    }
  }, [chatOpen, fetchMessages]);

  useEffect(() => {
    if (!chatOpen) return;
    setTimeout(() => inputRef.current?.focus(), 300);
    const interval = setInterval(() => fetchMessages(false), 3000);
    return () => clearInterval(interval);
  }, [chatOpen, fetchMessages]);

  useEffect(() => {
    if (chatOpen) return;
    if (!hasLoadedRef.current) return;
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, [chatOpen, fetchUnread]);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(scrollToBottom, 200);
    }
  }, [chatOpen, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || isSending || !isAuthenticated) return;

    setIsSending(true);
    setError(null);

    try {
      const msg = await api.sendChatMessage(trimmed);
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        if (exists) return prev;
        return [...prev, msg as ChatMessage];
      });
      setNewMessage('');
      lastTimestampRef.current = msg.createdAt;
      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      setError(err.message || 'Failed to send');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!chatOpen) return null;

  const panelWidth = isMobile ? '100vw' : '340px';

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isMobile && (
        <div style={styles.backdrop} onClick={toggleChat} />
      )}

      {/* Panel */}
      <div
        style={{
          ...styles.panel,
          width: panelWidth,
          ...(isMobile ? { right: 0, bottom: 0, top: 0 } : {}),
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <ChatIcon size={16} color={theme.accent.purple} />
            <span style={styles.headerTitle}>GENERAL CHAT</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.onlineDot} />
            <span style={styles.onlineCount}>{onlineCount}</span>
            <button style={styles.closeBtn} onClick={toggleChat}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.secondary} strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} style={styles.messageList}>
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              <ChatIcon size={36} color={theme.text.muted} />
              <p style={styles.emptyText}>No messages yet</p>
              <p style={styles.emptySubtext}>Be the first to say something!</p>
            </div>
          )}

          {messages.map((msg) => {
            const isOwn = msg.userId === userId;
            const hasPhoto = isPhotoAvatar(msg.avatar);
            const gradient = getAvatarGradient(null, msg.username);
            const level = msg.level || (isOwn ? profile.level : 1);

            return (
              <div
                key={msg.id}
                style={{
                  ...styles.messageItem,
                  ...(isOwn ? styles.messageItemOwn : {}),
                }}
              >
                {/* Avatar */}
                {hasPhoto ? (
                  <img
                    src={msg.avatar!}
                    alt={msg.username}
                    style={styles.avatarImg}
                  />
                ) : (
                  <div
                    style={{
                      ...styles.avatar,
                      background: gradient,
                    }}
                  >
                    {getInitials(msg.username)}
                  </div>
                )}

                {/* Content */}
                <div style={styles.messageContent}>
                  <div style={styles.messageHeader}>
                    <span style={{
                      ...styles.username,
                      ...(isOwn ? { color: theme.accent.green } : {}),
                    }}>
                      {msg.username}
                    </span>
                    <span style={styles.levelBadge}>{level}</span>
                  </div>
                  <div style={styles.messageText}>{msg.message}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Error toast */}
        {error && (
          <div style={styles.errorToast}>{error}</div>
        )}

        {/* Input */}
        {isAuthenticated ? (
          <div style={styles.inputBar}>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type message..."
              maxLength={200}
              style={styles.input}
              disabled={isSending}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              style={{
                ...styles.sendBtn,
                opacity: !newMessage.trim() || isSending ? 0.4 : 1,
              }}
            >
              <SendIcon size={18} />
            </button>
          </div>
        ) : (
          <div style={styles.loginPrompt}>
            Sign in to chat
          </div>
        )}
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 998,
  },
  panel: {
    position: 'fixed',
    top: '64px',
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    background: theme.bg.primary,
    borderLeft: `1px solid ${theme.border.medium}`,
    zIndex: 999,
    boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
    animation: 'slideInRight 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  headerTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
    letterSpacing: '1px',
  },
  onlineDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: theme.accent.green,
    boxShadow: `0 0 6px ${theme.accent.green}`,
  },
  onlineCount: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.accent.green,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: theme.text.secondary,
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '8px',
  },
  messageList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '8px',
    opacity: 0.4,
  },
  emptyText: {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '18px',
    fontWeight: 600,
    color: theme.text.secondary,
    margin: 0,
  },
  emptySubtext: {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '15px',
    color: theme.text.muted,
    margin: 0,
  },
  messageItem: {
    display: 'flex',
    gap: '10px',
    padding: '10px 14px',
    borderBottom: `1px solid rgba(153, 69, 255, 0.06)`,
    transition: 'background 0.15s',
  },
  messageItemOwn: {
    background: 'rgba(153, 69, 255, 0.06)',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  avatarImg: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    objectFit: 'cover' as const,
    flexShrink: 0,
  },
  messageContent: {
    flex: 1,
    minWidth: 0,
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '2px',
  },
  username: {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  levelBadge: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(153, 69, 255, 0.5)',
    borderRadius: '4px',
    padding: '1px 5px',
    lineHeight: '14px',
  },
  messageText: {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '15px',
    fontWeight: 500,
    color: theme.text.secondary,
    lineHeight: 1.4,
    wordBreak: 'break-word' as const,
  },
  errorToast: {
    padding: '8px 16px',
    background: 'rgba(248, 113, 113, 0.15)',
    borderTop: `1px solid rgba(248, 113, 113, 0.3)`,
    color: theme.danger,
    fontSize: '14px',
    fontFamily: 'Rajdhani, sans-serif',
    fontWeight: 600,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  inputBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px 14px',
    borderTop: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '20px',
    color: theme.text.primary,
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    fontWeight: 500,
    outline: 'none',
  },
  sendBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: theme.accent.purple,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(153, 69, 255, 0.4)',
    transition: 'opacity 0.2s',
    flexShrink: 0,
  },
  loginPrompt: {
    padding: '16px',
    textAlign: 'center' as const,
    color: theme.text.secondary,
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    fontWeight: 600,
    borderTop: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
    flexShrink: 0,
  },
};
