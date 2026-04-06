import type { CSSProperties } from 'react';

/**
 * Icon — renders an SVG from /public/icons/ using CSS mask-image.
 *
 * The icon inherits `color` from its parent element via `currentColor`.
 * This works because the SVG is used as a mask shape, and
 * `background-color: currentColor` fills only the visible parts.
 *
 * Usage:
 *   <Icon name="trophy" size={20} />
 *   <Icon name="wallet" size={16} style={{ color: theme.accent.purple }} />
 *
 * Available icons (40):
 *   arrow-down, arrow-up, bolt, bomb, candles, chart, check,
 *   chevron-down, chevron-right, clock, close, copy, diamond,
 *   dice, discord, external-link, gear, gem, gift, grid, info,
 *   left-arrow, list, menu, play, search, shield, signal, solana,
 *   star, swords, target, telegram, terminal, ticket, trophy,
 *   twitter-x, user, users, wallet
 */

export interface IconProps {
  /** Icon filename without .svg extension */
  name: string;
  /** Size in px (default 20) */
  size?: number;
  /** Optional CSS class */
  className?: string;
  /** Additional inline styles — use `color` to set icon color */
  style?: CSSProperties;
}

export function Icon({ name, size = 20, className, style }: IconProps) {
  const maskValue = `url(/icons/${name}.svg) no-repeat center / contain`;

  return (
    <span
      role="img"
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        mask: maskValue,
        WebkitMask: maskValue,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
