import { ButtonHTMLAttributes, ReactNode } from 'react';
import { theme } from '../../styles/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: '#9945FF',
    color: '#fff',
    border: 'none',
    fontWeight: 600,
  },
  secondary: {
    background: 'rgba(255,255,255,0.06)',
    color: theme.text.primary,
    border: `1px solid ${theme.border.medium}`,
    fontWeight: 500,
  },
  danger: {
    background: theme.danger,
    color: '#fff',
    border: 'none',
    fontWeight: 600,
  },
  ghost: {
    background: 'transparent',
    color: theme.text.secondary,
    border: `1px solid ${theme.border.subtle}`,
    fontWeight: 500,
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: '13px', borderRadius: '6px' },
  md: { padding: '10px 20px', fontSize: '14px', borderRadius: '8px' },
  lg: { padding: '14px 28px', fontSize: '15px', borderRadius: '10px' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  fullWidth,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'Rajdhani, sans-serif',
        transition: 'all 0.15s ease',
        width: fullWidth ? '100%' : undefined,
        opacity: props.disabled ? 0.5 : 1,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
