import { forwardRef, useState } from 'react';
import { theme } from '../../styles/theme';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: 'sm' | 'md';
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  error?: string;
  label?: string;
}

const SIZES = {
  sm: { height: '36px', padding: '8px 12px', fontSize: '13px' },
  md: { height: '42px', padding: '12px 16px', fontSize: '14px' },
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', icon, suffix, mono, error, label, style, onFocus, onBlur, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const s = SIZES[inputSize];

    const borderColor = error
      ? theme.accent.red
      : focused
        ? theme.border.focus
        : theme.border.default;

    const boxShadow = focused && !error
      ? '0 0 0 3px rgba(139, 92, 246, 0.12)'
      : undefined;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {label && (
          <label style={{
            fontSize: '13px',
            fontWeight: 500,
            color: theme.text.secondary,
          }}>
            {label}
          </label>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: s.height,
          padding: s.padding,
          background: theme.bg.base,
          border: `1px solid ${borderColor}`,
          borderRadius: theme.radius.md,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow,
        }}>
          {icon && (
            <span style={{ display: 'flex', flexShrink: 0, color: theme.text.muted }}>
              {icon}
            </span>
          )}
          <input
            ref={ref}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: s.fontSize,
              fontWeight: 500,
              fontFamily: mono ? 'var(--font-mono)' : 'inherit',
              color: theme.text.primary,
              padding: 0,
              minWidth: 0,
              ...style,
            }}
            {...rest}
          />
          {suffix && (
            <span style={{ display: 'flex', flexShrink: 0 }}>
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <span style={{
            fontSize: '11px',
            color: theme.accent.red,
            lineHeight: 1.3,
          }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
