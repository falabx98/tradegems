import { theme } from '../../styles/theme';

interface DataPoint { label: string; value: number; }

interface AdminChartProps {
  type: 'line' | 'bar' | 'horizontal-bar';
  data: DataPoint[];
  height?: number;
  color?: string;
  showLabels?: boolean;
  title?: string;
}

export function AdminChart({ type, data, height = 200, color = '#8b5cf6', showLabels = true, title }: AdminChartProps) {
  if (!data.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.muted, fontSize: 13 }}>No data</div>;

  const pad = { top: 20, right: 16, bottom: showLabels ? 28 : 8, left: 48 };
  const w = 100; // percentage-based for responsiveness
  const maxVal = Math.max(...data.map(d => d.value), 1);

  if (type === 'horizontal-bar') {
    const barH = Math.min(28, Math.floor((height - 20) / data.length) - 4);
    return (
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 80, fontSize: 11, fontWeight: 600, color: theme.text.secondary, textAlign: 'right', flexShrink: 0 }}>{d.label}</span>
              <div style={{ flex: 1, height: barH, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: `${(d.value / maxVal) * 100}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
              <span className="mono" style={{ width: 50, fontSize: 11, fontWeight: 700, color: theme.text.secondary, flexShrink: 0 }}>{d.value.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // SVG-based line and bar charts
  const svgH = height;
  const chartW = 600;
  const chartH = svgH - pad.top - pad.bottom;
  const chartLeft = pad.left;

  const scaleY = (v: number) => pad.top + chartH - (v / maxVal) * chartH;
  const scaleX = (i: number) => chartLeft + (i / Math.max(data.length - 1, 1)) * (chartW - chartLeft - pad.right);

  // Grid lines
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => (maxVal / gridLines) * i);

  if (type === 'bar') {
    const barW = Math.max(8, Math.min(40, (chartW - chartLeft - pad.right) / data.length - 4));
    return (
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>}
        <svg viewBox={`0 0 ${chartW} ${svgH}`} style={{ width: '100%', height }}>
          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={chartLeft} y1={scaleY(v)} x2={chartW - pad.right} y2={scaleY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={chartLeft - 4} y={scaleY(v) + 4} textAnchor="end" fill={theme.text.muted} fontSize="9" fontFamily="JetBrains Mono">{v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = chartLeft + (i + 0.5) * ((chartW - chartLeft - pad.right) / data.length);
            const h = (d.value / maxVal) * chartH;
            return (
              <g key={i}>
                <rect x={x - barW / 2} y={scaleY(d.value)} width={barW} height={h} rx={3} fill={color} opacity={0.85} />
                {showLabels && <text x={x} y={svgH - 4} textAnchor="middle" fill={theme.text.muted} fontSize="9">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // Line chart
  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ');
  const areaPoints = `${scaleX(0)},${pad.top + chartH} ${points} ${scaleX(data.length - 1)},${pad.top + chartH}`;

  return (
    <div>
      {title && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>}
      <svg viewBox={`0 0 ${chartW} ${svgH}`} style={{ width: '100%', height }}>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={chartLeft} y1={scaleY(v)} x2={chartW - pad.right} y2={scaleY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={chartLeft - 4} y={scaleY(v) + 4} textAnchor="end" fill={theme.text.muted} fontSize="9" fontFamily="JetBrains Mono">{v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}</text>
          </g>
        ))}
        <polygon points={areaPoints} fill={color} opacity={0.06} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={scaleX(i)} cy={scaleY(d.value)} r={3} fill={color} />
            {showLabels && <text x={scaleX(i)} y={svgH - 4} textAnchor="middle" fill={theme.text.muted} fontSize="9">{d.label}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
