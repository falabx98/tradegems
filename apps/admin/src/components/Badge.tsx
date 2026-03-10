import { theme } from '../styles/theme';

interface BadgeProps {
  children: React.ReactNode;
  color: string;
}

export function Badge({ children, color }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: theme.radius.full,
      fontSize: theme.fontSize.xs,
      fontWeight: 600,
      color,
      background: `${color}18`,
      border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  );
}
