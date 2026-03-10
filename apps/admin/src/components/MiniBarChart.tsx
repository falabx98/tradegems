import type { CSSProperties } from 'react';
import { theme } from '../styles/theme';

interface MiniBarChartProps {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export function MiniBarChart({ data, color, height = 120, formatValue }: MiniBarChartProps) {
  if (data.length === 0) {
    return <div style={{ color: theme.text.muted, padding: '20px', textAlign: 'center', fontSize: theme.fontSize.sm }}>No data</div>;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={styles.container}>
      <div style={{ ...styles.bars, height: `${height}px` }}>
        {data.map((d, i) => (
          <div key={i} style={styles.barCol}>
            <div style={styles.barWrap}>
              <div style={{
                ...styles.bar,
                height: `${(d.value / maxVal) * 100}%`,
                background: color,
              }} title={formatValue ? formatValue(d.value) : String(d.value)} />
            </div>
            <span style={styles.label}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    padding: '16px',
  },
  bars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
  },
  barCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  barWrap: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    width: '80%',
    maxWidth: '40px',
    borderRadius: '3px 3px 0 0',
    minHeight: '2px',
    transition: 'height 0.3s',
  },
  label: {
    fontSize: '0.6rem',
    color: theme.text.muted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
};
