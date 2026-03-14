import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

export function ChatToggle() {
  const chatOpen = useGameStore((s) => s.chatOpen);
  const toggleChat = useGameStore((s) => s.toggleChat);
  const unreadChat = useGameStore((s) => s.unreadChat);
  const isMobile = useIsMobile();

  // Don't show the toggle when chat is already open
  if (chatOpen) return null;

  return (
    <button
      onClick={toggleChat}
      style={{
        ...styles.button,
        bottom: isMobile ? '72px' : '24px', // Above BottomNav on mobile
      }}
      title="Open chat"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadChat > 0 && (
        <span style={styles.badge}>
          {unreadChat > 9 ? '9+' : unreadChat}
        </span>
      )}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    position: 'fixed',
    right: '20px',
    zIndex: 500,
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: theme.accent.purple,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 0 #7325d4, 0 4px 12px rgba(119, 23, 255, 0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    animation: 'chatBtnPulse 3s ease-in-out infinite',
  },
  icon: {
    fontSize: '26px',
    lineHeight: 1,
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    minWidth: '20px',
    height: '20px',
    borderRadius: '10px',
    background: theme.danger,
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
    boxShadow: '0 2px 6px rgba(248, 113, 113, 0.5)',
  },
};
