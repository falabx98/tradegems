import { useState, type CSSProperties, type ReactNode } from 'react';
import { theme } from '../../styles/theme';
import { Icon } from '../primitives/Icon';

// ─── Placeholder gradient map (subtle dark gradients only) ──
const GAME_GRADIENTS: Record<string, string> = {
  'rug-game':    'linear-gradient(160deg, #1a0a0a 0%, #2a1010 100%)',
  'mines':       'linear-gradient(160deg, #0a1a12 0%, #102a1a 100%)',
  'candleflip':  'linear-gradient(160deg, #1a1408 0%, #2a2010 100%)',
  'predictions': 'linear-gradient(160deg, #0c1024 0%, #141830 100%)',
  'trading-sim': 'linear-gradient(160deg, #10082a 0%, #1a1040 100%)',
  'solo':        'linear-gradient(160deg, #081a1a 0%, #0e2828 100%)',
  'lottery':     'linear-gradient(160deg, #1a1408 0%, #28200a 100%)',
};

// ─── Props ──────────────────────────────────────────────────

export interface GameCardProps {
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  onClick: () => void;
  badge?: 'live' | 'hot' | 'pvp' | 'new' | null;
  players?: number;
  liveData?: string;
  liveDataColor?: string;
  liveExtra?: ReactNode;
  // Legacy props — mapped internally
  isLive?: boolean;
  isHot?: boolean;
  isRecommended?: boolean;
}

// ─── Badge config ───────────────────────────────────────────

const BADGE_CONFIG: Record<string, { label: string; bg: string; color: string; dot?: boolean }> = {
  live: { label: 'LIVE', bg: 'rgba(255,179,0,0.85)', color: '#fff', dot: true },
  hot:  { label: 'HOT',  bg: 'rgba(255,59,59,0.85)',  color: '#fff' },
  pvp:  { label: 'PVP',  bg: 'rgba(6,182,212,0.85)',  color: '#fff' },
  new:  { label: 'NEW',  bg: 'rgba(139,92,246,0.85)',  color: '#fff' },
};

// ─── Component ──────────────────────────────────────────────

export function GameCard({
  gameId,
  title,
  subtitle,
  image,
  onClick,
  badge,
  players,
  liveData,
  liveDataColor,
  liveExtra,
  isLive,
  isHot,
  isRecommended,
}: GameCardProps) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Resolve badge from legacy props if not explicitly set
  const resolvedBadge = badge
    || (isLive ? 'live' : null)
    || (isHot ? 'hot' : null)
    || (isRecommended ? 'new' : null);

  const badgeCfg = resolvedBadge ? BADGE_CONFIG[resolvedBadge] : null;
  const placeholderGradient = GAME_GRADIENTS[gameId] || `linear-gradient(160deg, ${theme.bg.elevated} 0%, ${theme.bg.surface} 100%)`;
  const showPlaceholder = !image || imgError;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        aspectRatio: '2 / 3',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered
          ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.15)`
          : '0 2px 8px rgba(0,0,0,0.3)',
        border: hovered
          ? '1px solid rgba(255,255,255,0.12)'
          : `1px solid ${theme.border.subtle}`,
      }}
    >
      {/* ─── Image / Placeholder ──────────────── */}
      {showPlaceholder ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: placeholderGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: '0 16px',
          }}>
            {title}
          </span>
        </div>
      ) : (
        <img
          src={image}
          alt={title}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      )}

      {/* ─── Badge — top-left ─────────────────── */}
      {badgeCfg && (
        <div style={badgeStyle}>
          {badgeCfg.dot && <div style={badgeDot} />}
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: badgeCfg.color,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {badgeCfg.label}
          </span>
        </div>
      )}

      {/* ─── Live data chip — bottom-left ────── */}
      {(liveData || liveExtra) && (
        <div style={liveChipStyle}>
          {liveData && (
            <span className="mono" style={{
              fontSize: 11,
              fontWeight: 700,
              color: liveDataColor || theme.accent.green,
            }}>
              {liveData}
            </span>
          )}
          {liveExtra}
        </div>
      )}

      {/* ─── Players — bottom-right ──────────── */}
      {players != null && players >= 3 && (
        <div style={playersChipStyle}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.8)',
          }}>
            <Icon name="users" size={12} style={{ color: 'rgba(255,255,255,0.8)', verticalAlign: 'middle', marginRight: 3 }} />{players}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────

const badgeStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  zIndex: 5,
};

const badgeDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: theme.accent.amber,
  boxShadow: `0 0 6px ${theme.accent.amber}99`,
  animation: 'pulse 1.5s ease infinite',
};

const liveChipStyle: CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  zIndex: 5,
};

const playersChipStyle: CSSProperties = {
  position: 'absolute',
  bottom: 8,
  right: 8,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  zIndex: 5,
};
