import { theme } from '../../styles/theme';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  retry?: () => void;
  inline?: boolean;
}

function AlertIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.accent.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function ErrorState({ message, retry, inline }: ErrorStateProps) {
  if (inline) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(255, 51, 51, 0.06)',
        border: '1px solid rgba(255, 51, 51, 0.12)',
        borderRadius: theme.radius.md,
      }}>
        <AlertIcon size={16} />
        <span style={{ fontSize: '13px', color: theme.text.secondary, flex: 1 }}>
          {message}
        </span>
        {retry && (
          <Button variant="ghost" size="sm" onClick={retry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      padding: '24px 16px',
      textAlign: 'center',
    }}>
      <AlertIcon size={28} />
      <div style={{ fontSize: '14px', fontWeight: 500, color: theme.text.secondary }}>
        {message}
      </div>
      {retry && (
        <Button variant="ghost" size="sm" onClick={retry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
