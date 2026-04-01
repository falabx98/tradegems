/**
 * Inline Solana logo icon — replaces "SOL" text everywhere.
 * Uses the official Solana mark as an inline SVG.
 * Defaults to 1em size so it scales with surrounding text.
 */
export function SolIcon({ size = '1em', color = 'currentColor', style }: {
  size?: string | number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: '-0.1em', flexShrink: 0, ...style }}
    >
      <circle cx="64" cy="64" r="64" fill="currentColor" fillOpacity={0.08} />
      <path
        d="M36.7 82.6c.5-.5 1.2-.8 2-.8h58.6c1.2 0 1.9 1.5 1 2.4l-12.1 12.1c-.5.5-1.2.8-2 .8H25.6c-1.2 0-1.9-1.5-1-2.4L36.7 82.6z"
        fill={color}
      />
      <path
        d="M36.7 31.7c.5-.5 1.3-.8 2-.8h58.6c1.2 0 1.9 1.5 1 2.4L86.2 45.4c-.5.5-1.2.8-2 .8H25.6c-1.2 0-1.9-1.5-1-2.4l12.1-12.1z"
        fill={color}
      />
      <path
        d="M86.2 56.9c-.5-.5-1.2-.8-2-.8H25.6c-1.2 0-1.9 1.5-1 2.4l12.1 12.1c.5.5 1.2.8 2 .8h58.6c1.2 0 1.9-1.5 1-2.4L86.2 56.9z"
        fill={color}
      />
    </svg>
  );
}

/** Inline helper: renders "0.25 ◎" pattern — amount followed by Solana icon */
export function SolAmount({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {children}
      <SolIcon size="0.9em" color={color} />
    </span>
  );
}
