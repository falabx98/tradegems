import { useToastStore, type ToastType } from '../stores/toastStore';
import { CheckIcon, XIcon, InfoIcon, WarningIcon } from './ui/GameIcons';

const ICON_COMPONENTS: Record<ToastType, (color: string) => React.ReactNode> = {
  success: (c) => <CheckIcon size={14} color={c} />,
  error: (c) => <XIcon size={14} color={c} />,
  info: (c) => <InfoIcon size={14} color={c} />,
  warning: (c) => <WarningIcon size={14} color={c} />,
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'rgba(46, 204, 113, 0.08)',
    border: 'rgba(46, 204, 113, 0.25)',
    text: '#2ecc71',
    icon: '#2ecc71',
  },
  error: {
    bg: 'rgba(248, 113, 113, 0.08)',
    border: 'rgba(248, 113, 113, 0.25)',
    text: '#f87171',
    icon: '#f87171',
  },
  info: {
    bg: 'rgba(139, 92, 246, 0.08)',
    border: 'rgba(139, 92, 246, 0.25)',
    text: '#3b82f6',
    icon: '#8b5cf6',
  },
  warning: {
    bg: 'rgba(251, 191, 36, 0.08)',
    border: 'rgba(251, 191, 36, 0.25)',
    text: '#8b5cf6',
    icon: '#8b5cf6',
  },
};

export function ToastOverlay() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((t, i) => {
        const c = COLORS[t.type];
        return (
          <div
            key={t.id}
            style={{
              ...styles.toast,
              background: c.bg,
              borderColor: c.border,
              opacity: 1 - i * 0.08,
              animation: 'toastSlideIn 0.3s ease',
            }}
            onClick={() => removeToast(t.id)}
          >
            <div style={{
              ...styles.iconCircle,
              background: `${c.icon}18`,
              color: c.icon,
              border: `1px solid ${c.icon}30`,
            }}>
              {ICON_COMPONENTS[t.type](c.icon)}
            </div>
            <div style={styles.textWrap}>
              <span style={{ ...styles.title, color: c.text }}>{t.title}</span>
              {t.message && <span style={styles.message}>{t.message}</span>}
            </div>
            <button style={styles.close} onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}>
              <XIcon size={12} color="currentColor" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '380px',
    width: '100%',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease',
  },
  iconCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: "inherit",
    letterSpacing: '0.3px',
  },
  message: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.4,
  },
  close: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 1,
    flexShrink: 0,
  },
};
