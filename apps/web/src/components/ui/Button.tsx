import { ButtonHTMLAttributes, ReactNode } from 'react';
import { theme } from '../../styles/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
    color: '#fff',
    border: 'none',
    fontWeight: 700,
  },
  success: {
    background: '#00dc82',
    color: '#080808',
    border: 'none',
    fontWeight: 700,
  },
  secondary: {
    background: 'transparent',
    color: theme.text.primary,
    border: `1px solid ${theme.border.medium}`,
    fontWeight: 600,
  },
  danger: {
    background: '#ff4757',
    color: '#fff',
    border: 'none',
    fontWeight: 700,
  },
  ghost: {
    background: 'transparent',
    color: theme.text.secondary,
    border: `1px solid ${theme.border.subtle}`,
    fontWeight: 500,
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '7px 16px', fontSize: '13px', borderRadius: '6px' },
  md: { padding: '11px 22px', fontSize: '14px', borderRadius: '8px' },
  lg: { padding: '14px 30px', fontSize: '15px', borderRadius: '10px' },
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
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
        width: fullWidth ? '100%' : undefined,
        opacity: props.disabled ? 0.4 : 1,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
