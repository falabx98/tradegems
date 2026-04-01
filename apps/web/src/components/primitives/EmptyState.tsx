import { theme } from '../../styles/theme';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'ghost' | 'ghost-accent';
  };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      padding: '32px 16px',
      textAlign: 'center',
    }}>
      <div style={{ color: theme.text.muted, fontSize: '32px', lineHeight: 1 }}>
        {icon}
      </div>
      <div style={{
        fontSize: '15px',
        fontWeight: 600,
        color: theme.text.secondary,
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: '13px',
          fontWeight: 400,
          color: theme.text.muted,
          maxWidth: '280px',
          lineHeight: 1.5,
        }}>
          {subtitle}
        </div>
      )}
      {action && (
        <Button
          variant={action.variant || 'ghost-accent'}
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
