import type { CSSProperties } from 'react';
import { useToastStore } from '../stores/toastStore';
import { theme } from '../styles/theme';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((t) => {
        const color = t.type === 'success' ? theme.success
          : t.type === 'error' ? theme.danger
          : theme.info;
        return (
          <div
            key={t.id}
            style={{ ...styles.toast, borderLeftColor: color }}
            onClick={() => removeToast(t.id)}
          >
            <span style={{ ...styles.icon, color }}>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span style={styles.message}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '360px',
  },
  toast: {
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderLeft: '4px solid',
    borderRadius: theme.radius.md,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: theme.shadow.lg,
    cursor: 'pointer',
    animation: 'fadeIn 0.2s ease',
  },
  icon: {
    fontSize: theme.fontSize.md,
    fontWeight: 700,
    flexShrink: 0,
  },
  message: {
    color: theme.text.primary,
    fontSize: theme.fontSize.sm,
    lineHeight: '1.4',
  },
};
