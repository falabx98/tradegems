import type { CSSProperties, ReactNode } from 'react';
import { theme } from '../../styles/theme';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <div style={header}>
      <div>
        <h1 style={h1}>{title}</h1>
        {subtitle && <p style={sub}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 20,
};

const h1: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: '#fff',
  margin: 0,
  letterSpacing: '-0.02em',
};

const sub: CSSProperties = {
  fontSize: 13,
  color: theme.text.muted,
  margin: '4px 0 0',
};
