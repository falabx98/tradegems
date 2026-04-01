import { useEffect, useCallback } from 'react';
import { theme } from '../../styles/theme';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  showClose?: boolean;
}

const MAX_WIDTHS = { sm: '360px', md: '420px', lg: '520px' } as const;

export function Modal({ open, onClose, title, size = 'md', children, showClose = true }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bg.overlay,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9000,
        padding: '16px',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          background: theme.bg.tertiary,
          border: `1px solid ${theme.border.medium}`,
          borderRadius: theme.radius.xl,
          padding: '24px',
          width: '100%',
          maxWidth: MAX_WIDTHS[size],
          boxShadow: theme.shadow.lg,
          animation: 'authSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: theme.radius.md,
              color: theme.text.muted,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '18px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
        {title && (
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: theme.text.primary,
            marginBottom: '16px',
            paddingRight: showClose ? '32px' : undefined,
          }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
