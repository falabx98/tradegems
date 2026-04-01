import { useState, useEffect, useRef, type ReactNode } from 'react';

export interface CountUpNumberProps {
  /** Target value to count up to */
  value: number;
  /** Starting value (default: 0) */
  from?: number;
  /** Animation duration in ms (default: 1000) */
  duration?: number;
  /** Number of decimal places (default: 2) */
  decimals?: number;
  /** Prefix before number (e.g., "+" or "") — accepts ReactNode */
  prefix?: ReactNode;
  /** Suffix after number (e.g., "x" or " SOL") — accepts ReactNode */
  suffix?: ReactNode;
  /** Optional custom formatter — receives the current animated value */
  formatter?: (value: number) => string;
  /** Whether animation should run (default: true). Set false to show final value instantly. */
  animate?: boolean;
  /** Style applied to the wrapping span */
  style?: React.CSSProperties;
}

/**
 * Wave 1B — Animated count-up number for multipliers and payouts.
 *
 * - Smooth 60fps animation using requestAnimationFrame
 * - ease-out easing (fast start, slow finish — builds anticipation)
 * - Monospace-friendly output
 * - Lightweight: no external dependencies
 */
export function CountUpNumber({
  value,
  from = 0,
  duration = 1000,
  decimals = 2,
  prefix = '',
  suffix = '',
  formatter,
  animate = true,
  style,
}: CountUpNumberProps) {
  const [display, setDisplay] = useState(animate ? from : value);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!animate) {
      setDisplay(value);
      return;
    }

    const startVal = from;
    const endVal = value;
    const diff = endVal - startVal;

    if (diff === 0) {
      setDisplay(endVal);
      return;
    }

    startTimeRef.current = 0;

    const tick = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + diff * eased;

      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(endVal); // Ensure exact final value
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, from, duration, animate]);

  if (formatter) {
    return <span style={style}>{formatter(display)}</span>;
  }

  return <span style={style}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}
