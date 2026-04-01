import { useToastStore, type ToastType } from '../stores/toastStore';
import { CheckIcon, XIcon, InfoIcon, WarningIcon } from './ui/GameIcons';
import { theme } from '../styles/theme';

const ICON_COMPONENTS: Record<ToastType, (color: string) => React.ReactNode> = {
  success: (c) => <CheckIcon size={14} color={c} />,
  error: (c) => <XIcon size={14} color={c} />,
  info: (c) => <InfoIcon size={14} color={c} />,
  warning: (c) => <WarningIcon size={14} color={c} />,
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'rgba(0, 231, 1, 0.06)',
    border: 'rgba(0, 231, 1, 0.20)',
    text: theme.accent.neonGreen,
    icon: theme.accent.neonGreen,
  },
  error: {
    bg: 'rgba(255, 51, 51, 0.06)',
    border: 'rgba(255, 51, 51, 0.20)',
    text: theme.accent.red,
    icon: theme.accent.red,
  },
  info: {
    bg: 'rgba(139, 92, 246, 0.06)',
    border: 'rgba(139, 92, 246, 0.20)',
    text: theme.accent.blue,
    icon: theme.accent.purple,
  },
  warning: {
    bg: 'rgba(255, 170, 0, 0.06)',
    border: 'rgba(255, 170, 0, 0.20)',
    text: theme.accent.amber,
    icon: theme.accent.amber,
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
              opacity: 1 - i * 0.06,
              animation: 'toastSlideIn 0.3s ease',
            }}
          >
            <div style={{
              ...styles.iconCircle,
              background: `${c.icon}12`,
              color: c.icon,
              border: `1px solid ${c.icon}25`,
            }}>
              {ICON_COMPONENTS[t.type](c.icon)}
            </div>
            <div style={styles.textWrap}>
              <span style={{ ...styles.title, color: c.text }}>{t.title}</span>
              {t.message && <span style={styles.message}>{t.message}</span>}
            </div>
            <button
              style={styles.close}
              onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
            >
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
    gap: '8px',
    padding: '12px',
    borderRadius: theme.radius.lg,
    border: '1px solid',
    boxShadow: theme.shadow.lg,
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  iconCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'inherit',
    letterSpacing: '0.2px',
  },
  message: {
    fontSize: '13px',
    color: theme.text.secondary,
    lineHeight: 1.4,
  },
  close: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    background: 'rgba(255,255,255,0.04)',
    border: 'none',
    borderRadius: theme.radius.sm,
    color: theme.text.muted,
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
};
