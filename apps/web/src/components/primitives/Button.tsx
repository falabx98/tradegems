import { forwardRef } from 'react';
import { theme } from '../../styles/theme';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'ghost-accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const SIZES = {
  sm: { height: '34px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, iconSize: 14 },
  md: { height: '40px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, iconSize: 16 },
  lg: { height: '48px', padding: '14px 28px', fontSize: '16px', fontWeight: 600, iconSize: 16 },
} as const;

const VARIANTS: Record<ButtonProps['variant'], {
  background: string;
  color: string;
  border: string;
  hoverBg: string;
}> = {
  primary: {
    background: theme.accent.primary,
    color: '#FFFFFF',
    border: 'none',
    hoverBg: theme.accent.primaryHover,
  },
  secondary: {
    background: theme.bg.elevated,
    color: theme.text.secondary,
    border: `1px solid ${theme.border.default}`,
    hoverBg: '#252A4D',
  },
  success: {
    background: theme.accent.green,
    color: theme.text.inverse,
    border: 'none',
    hoverBg: '#00C853',
  },
  danger: {
    background: theme.accent.red,
    color: '#FFFFFF',
    border: 'none',
    hoverBg: '#E63535',
  },
  ghost: {
    background: 'transparent',
    color: theme.text.secondary,
    border: 'none',
    hoverBg: 'rgba(255, 255, 255, 0.04)',
  },
  'ghost-accent': {
    background: 'transparent',
    color: theme.accent.primary,
    border: `1px solid ${theme.border.accent}`,
    hoverBg: 'rgba(139, 92, 246, 0.06)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size = 'md', fullWidth, loading, icon, children, disabled, style, ...rest }, ref) => {
    const s = SIZES[size];
    const v = VARIANTS[variant];
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          height: s.height,
          padding: s.padding,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontFamily: 'inherit',
          lineHeight: 1,
          color: v.color,
          background: v.background,
          border: v.border,
          borderRadius: theme.radius.md,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.35 : 1,
          transition: 'all 0.15s ease',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          ...(fullWidth ? { width: '100%' } : {}),
          ...style,
        }}
        {...rest}
      >
        {loading ? (
          <span style={{
            width: `${s.iconSize}px`,
            height: `${s.iconSize}px`,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: v.color,
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            flexShrink: 0,
          }} />
        ) : icon ? (
          <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
