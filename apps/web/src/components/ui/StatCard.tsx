import { ReactNode } from 'react';
import { theme } from '../../styles/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: 'up' | 'down';
  color?: string;
}

export function StatCard({ label, value, icon, trend, color }: StatCardProps) {
  const valColor = color || (trend === 'up' ? theme.accent.green : trend === 'down' ? theme.accent.red : theme.text.primary);
  const strVal = String(value);
  const hasSol = strVal.includes('SOL');
  const displayVal = hasSol ? strVal.replace(' SOL', '').replace('SOL', '') : strVal;
  return (
    <div style={s.card}>
      <div style={s.top}>
        <span style={s.label}>{label}</span>
        {icon && <span style={s.icon}>{icon}</span>}
      </div>
      <span className="mono" style={{ ...s.value, color: valColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
        {hasSol && <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px' }} />}
        {trend === 'up' && '+'}{displayVal}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 14px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    minWidth: 0,
    flex: 1,
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  icon: {
    fontSize: '14px',
    color: theme.text.muted,
    display: 'flex',
  },
  value: {
    fontSize: '18px',
    fontWeight: 700,
  },
};
