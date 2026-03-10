import type { CSSProperties, ReactNode } from 'react';
import { theme } from '../styles/theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.bg.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
  },
  modal: {
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.xl,
    width: '100%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: theme.shadow.lg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  },
  close: {
    background: 'none',
    border: 'none',
    color: theme.text.secondary,
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
  },
  body: {
    padding: '20px',
    overflowY: 'auto' as const,
  },
};
