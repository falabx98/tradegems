import { useEffect, useRef, useState } from 'react';

export interface MultiplierPulseProps {
  /** The current multiplier value — pulse triggers when this changes */
  value: number;
  /** Content to wrap (typically the multiplier text) */
  children: React.ReactNode;
  /** Additional styles on the wrapper */
  style?: React.CSSProperties;
  /** Whether pulsing is enabled (default: true) */
  enabled?: boolean;
  /** Pulse duration in ms (default: 200) */
  duration?: number;
  /** Scale factor during pulse (default: 1.08) */
  scale?: number;
}

/**
 * Wave 1B — Micro-animation wrapper for live multiplier changes.
 *
 * When `value` prop changes:
 * - Scales up briefly (100ms)
 * - Returns to normal (100ms)
 * - Optional glow intensification via CSS transition
 *
 * Lightweight: uses CSS transitions, no requestAnimationFrame.
 * Safe: handles rapid value changes without stacking animations.
 */
export function MultiplierPulse({
  value,
  children,
  style,
  enabled = true,
  duration = 200,
  scale = 1.08,
}: MultiplierPulseProps) {
  const [pulsing, setPulsing] = useState(false);
  const prevValue = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled) return;

    // Only pulse on actual value changes (not initial mount)
    if (prevValue.current !== value && prevValue.current !== 0) {
      // Clear any existing pulse timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      setPulsing(true);
      timeoutRef.current = setTimeout(() => setPulsing(false), duration / 2);
    }
    prevValue.current = value;
  }, [value, enabled, duration]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <span
      style={{
        display: 'inline-block',
        transform: pulsing ? `scale(${scale})` : 'scale(1)',
        transition: `transform ${duration / 2}ms ease-out`,
        willChange: pulsing ? 'transform' : 'auto',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
