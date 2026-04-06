import { ReactNode } from 'react';
import { theme } from '../../styles/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: 'up' | 'down';
  trendValue?: string;
  color?: string;
  mono?: boolean;
}

export function StatCard({ label, value, icon, trend, trendValue, color, mono = true }: StatCardProps) {
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span
          className={mono ? 'mono' : undefined}
          style={{
            ...s.value,
            color: valColor,
            fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
          }}
        >
          {hasSol && <img src="/sol-coin.png" alt="SOL" style={{ width: '20px', height: '20px', verticalAlign: 'middle', marginRight: '6px' }} />}
          {displayVal}
        </span>
        {/* Trend indicator */}
        {trend && trendValue && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            fontSize: '12px',
            fontWeight: 600,
            color: trend === 'up' ? theme.accent.green : theme.accent.red,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: trend === 'down' ? 'rotate(180deg)' : undefined }}>
              <polyline points="18 15 12 9 6 15" />
            </svg>
            {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    background: theme.bg.surface,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
    minWidth: 0,
    flex: 1,
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  icon: {
    fontSize: '14px',
    color: theme.text.muted,
    display: 'flex',
  },
  value: {
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1.2,
  },
};
