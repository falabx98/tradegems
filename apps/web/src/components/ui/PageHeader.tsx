import { ReactNode } from 'react';
import { theme } from '../../styles/theme';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, action }: PageHeaderProps) {
  return (
    <div style={s.wrap}>
      <div style={s.left}>
        {icon && <div style={s.icon}>{icon}</div>}
        <div>
          <h2 style={s.title}>{title}</h2>
          {subtitle && <p style={s.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '12px',
    marginBottom: '16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: theme.radius.md,
    background: 'rgba(139, 92, 246, 0.1)',
    color: theme.accent.purple,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: theme.text.primary,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: '13px',
    color: theme.text.muted,
    fontWeight: 500,
  },
};
