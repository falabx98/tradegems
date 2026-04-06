import { Icon } from '../primitives/Icon';

/**
 * NavIcon — thin wrapper around Icon for navigation contexts.
 * Maps icon names to /public/icons/*.svg files via CSS mask-image.
 *
 * The 'more' icon has no SVG file and uses an inline fallback.
 */

interface NavIconProps {
  name: string;
  size?: number;
  color?: string;
}

export function NavIcon({ name, size = 18, color }: NavIconProps) {
  // 'more' has no SVG file — keep as inline fallback
  if (name === 'more') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <circle cx="12" cy="5" r="1.5" fill={color || 'currentColor'} />
        <circle cx="12" cy="12" r="1.5" fill={color || 'currentColor'} />
        <circle cx="12" cy="19" r="1.5" fill={color || 'currentColor'} />
      </svg>
    );
  }

  return (
    <Icon
      name={name}
      size={size}
      style={color ? { color } : undefined}
    />
  );
}
