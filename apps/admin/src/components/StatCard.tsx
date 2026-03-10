import type { CSSProperties } from 'react';
import { theme } from '../styles/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: string;
}

export function StatCard({ label, value, sub, color = theme.accent.cyan, icon }: StatCardProps) {
  return (
    <div style={styles.card}>
      <div style={styles.top}>
        {icon && <span style={{ ...styles.icon, color }}>{icon}</span>}
        <span style={styles.label}>{label}</span>
      </div>
      <div style={{ ...styles.value, color }}>{value}</div>
      {sub && <div style={styles.sub}>{sub}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '1.2rem',
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: 700,
    lineHeight: 1,
  },
  sub: {
    fontSize: theme.fontSize.xs,
    color: theme.text.muted,
  },
};
