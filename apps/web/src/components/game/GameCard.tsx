import { useState, type CSSProperties, type ReactNode } from 'react';
import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

// ─── Props ──────────────────────────────────────────────────

export interface GameCardProps {
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  onClick: () => void;
  isLive?: boolean;
  isHot?: boolean;
  isRecommended?: boolean;
  liveData?: string;
  liveDataColor?: string;
  liveExtra?: ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export function GameCard({
  gameId,
  title,
  subtitle,
  image,
  onClick,
  isLive,
  isHot,
  isRecommended,
  liveData,
  liveDataColor,
  liveExtra,
}: GameCardProps) {
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        cursor: 'pointer',
        minWidth: 0,
        aspectRatio: '2 / 3',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        border: hovered
          ? '1px solid rgba(255,255,255,0.15)'
          : '1px solid rgba(255,255,255,0.06)',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered
          ? '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Poster image — fills entire card, no UI title overlay */}
      <img
        src={image}
        alt={title}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      {/* LIVE badge */}
      {isLive && (
        <div style={liveBadge}>
          <div style={liveDot} />
          <span style={liveBadgeText}>LIVE</span>
        </div>
      )}

      {/* HOT badge */}
      {isHot && !isLive && !isRecommended && (
        <div style={hotBadge}>
          <span style={{ fontSize: 9 }}>🔥</span>
          <span style={hotBadgeText}>HOT</span>
        </div>
      )}

      {/* RECOMMENDED badge — takes priority over HOT */}
      {isRecommended && !isLive && (
        <div style={recommendedBadge}>
          <span style={{ fontSize: 9 }}>⭐</span>
          <span style={recommendedBadgeText}>START HERE</span>
        </div>
      )}

      {/* Live data chip — small floating overlay at bottom-left, only when data exists */}
      {(liveData || liveExtra) && (
        <div style={liveChip}>
          {liveData && (
            <span className="mono" style={{ fontSize: isMobile ? theme.textSize.xs.mobile : theme.textSize.xs.desktop, fontWeight: 700, color: liveDataColor || theme.accent.neonGreen }}>
              {liveData}
            </span>
          )}
          {liveExtra}
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const liveBadge: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  zIndex: 5,
};

const liveDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#00E701',
  boxShadow: '0 0 6px rgba(0,231,1,0.6)',
  animation: 'pulse 1.5s ease infinite',
};

const liveBadgeText: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#00E701',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const hotBadge: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  zIndex: 5,
};

const hotBadgeText: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#FF6B35',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const recommendedBadge: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(139, 92, 246, 0.85)',
  backdropFilter: 'blur(4px)',
  zIndex: 5,
};

const recommendedBadgeText: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#fff',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const liveChip: CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  zIndex: 5,
};
