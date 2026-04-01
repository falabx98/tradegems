import { theme } from '../../styles/theme';

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
  lines?: number;
  style?: React.CSSProperties;
}

const shimmerStyle: React.CSSProperties = {
  background: `linear-gradient(90deg, ${theme.bg.secondary} 25%, #1c1c1c 50%, ${theme.bg.secondary} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'skeleton 1.5s ease-in-out infinite',
};

export function Skeleton({ variant = 'rect', width, height, lines, style }: SkeletonProps) {
  if (variant === 'text' && lines && lines > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...style }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              ...shimmerStyle,
              height: '12px',
              borderRadius: theme.radius.xs,
              width: i === lines - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    const size = width || height || '40px';
    return (
      <div style={{
        ...shimmerStyle,
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        ...style,
      }} />
    );
  }

  return (
    <div style={{
      ...shimmerStyle,
      width: width || '100%',
      height: height || (variant === 'text' ? '12px' : '40px'),
      borderRadius: variant === 'text' ? theme.radius.xs : theme.radius.sm,
      ...style,
    }} />
  );
}
