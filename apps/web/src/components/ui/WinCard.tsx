import { useRef, useState, type CSSProperties } from 'react';
import html2canvas from 'html2canvas';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { SolIcon } from './SolIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WinCardBase {
  multiplier: number;
  betAmount: number;
  payout: number;
  profit: number;
  timestamp: Date;
  username: string;
  level: number;
  vipTier: string;
  onClose: () => void;
}

interface SoloWinCard extends WinCardBase {
  gameType: 'solo';
  nodesHit: number;
  totalNodes: number;
  riskTier: string;
  xpGained: number;
}

interface PredictionWinCard extends WinCardBase {
  gameType: 'prediction';
  direction: string;
  entryPrice: number;
  exitPrice: number;
  priceChangePercent: number;
}

interface RugGameWinCard extends WinCardBase {
  gameType: 'rug-game';
}

interface TradingSimWinCard extends WinCardBase {
  gameType: 'trading-sim';
  rank: number;
  participants: number;
  prizePool: number;
}

export type WinCardProps = SoloWinCard | PredictionWinCard | RugGameWinCard | TradingSimWinCard;

// ─── Constants ────────────────────────────────────────────────────────────────

const GAME_LABELS: Record<string, string> = {
  'solo': 'SOLO',
  'prediction': 'PREDICTIONS',
  'rug-game': 'RUG GAME',
  'trading-sim': 'TRADING SIM',
};

const GAME_COLORS: Record<string, string> = {
  'solo': theme.accent.purple,
  'prediction': theme.accent.blue,
  'rug-game': '#ef4444',
  'trading-sim': theme.accent.green,
};

const GAME_GRADIENTS: Record<string, string> = {
  'solo': theme.gradient.primary,
  'prediction': theme.gradient.secondary,
  'rug-game': theme.gradient.danger,
  'trading-sim': theme.gradient.green,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function WinCard(props: WinCardProps) {
  const { gameType, multiplier, betAmount, payout, profit, timestamp, username, level, vipTier, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const gameColor = GAME_COLORS[gameType];
  const profitPercent = betAmount > 0 ? ((payout / betAmount - 1) * 100).toFixed(0) : '0';

  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#080808',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `tradegems-win-${gameType}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // silent fail
    }
    setDownloading(false);
  };

  const formatTime = (d: Date) => {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const day = d.getDate();
    const month = d.toLocaleString('en', { month: 'short' });
    const year = d.getFullYear();
    return `${h}:${m} · ${month} ${day}, ${year}`;
  };

  // Game-specific stats
  const getStats = (): { label: string; value: React.ReactNode; color?: string }[] => {
    switch (props.gameType) {
      case 'solo':
        return [
          { label: 'Nodes Hit', value: `${props.nodesHit}/${props.totalNodes}` },
          { label: 'Hit Rate', value: `${props.totalNodes > 0 ? Math.round((props.nodesHit / props.totalNodes) * 100) : 0}%`, color: theme.accent.green },
          { label: 'Risk Tier', value: props.riskTier.charAt(0).toUpperCase() + props.riskTier.slice(1) },
          { label: 'XP Earned', value: `+${props.xpGained}`, color: theme.accent.purple },
        ];
      case 'prediction':
        return [
          { label: 'Direction', value: props.direction === 'long' ? 'LONG' : props.direction === 'short' ? 'SHORT' : 'RANGE', color: props.direction === 'long' ? theme.accent.green : props.direction === 'short' ? theme.accent.red : theme.accent.cyan },
          { label: 'Entry', value: `$${props.entryPrice.toFixed(2)}` },
          { label: 'Exit', value: `$${props.exitPrice.toFixed(2)}` },
          { label: 'Change', value: `${props.priceChangePercent >= 0 ? '+' : ''}${props.priceChangePercent.toFixed(2)}%`, color: props.priceChangePercent >= 0 ? theme.accent.green : theme.accent.red },
        ];
      case 'rug-game':
        return [
          { label: 'Cash Out', value: `${Number(multiplier).toFixed(2)}x`, color: theme.accent.green },
          { label: 'Status', value: 'SURVIVED', color: theme.accent.green },
        ];
      case 'trading-sim':
        return [
          { label: 'Rank', value: `#${props.rank}`, color: theme.accent.amber },
          { label: 'Players', value: `${props.participants}` },
          { label: 'Prize Pool', value: <>{formatSol(props.prizePool)} <SolIcon size="0.9em" /></>, color: theme.accent.green },
        ];
    }
  };

  const stats = getStats();

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* The card (captured for PNG) */}
        <div ref={cardRef} style={s.card}>
          {/* Grid pattern overlay */}
          <div style={s.gridPattern} />

          {/* Glow orb behind multiplier */}
          <div style={{
            ...s.glowOrb,
            background: `radial-gradient(circle, ${gameColor}15 0%, transparent 70%)`,
          }} />

          {/* Header: game badge + logo */}
          <div style={s.header}>
            <div style={{ ...s.gameBadge, background: GAME_GRADIENTS[gameType] }}>
              {GAME_LABELS[gameType]}
            </div>
            <div style={s.logoText}>
              <span style={{ color: theme.accent.purple, fontWeight: 800 }}>TRADE</span>
              <span style={{ color: theme.text.primary, fontWeight: 800 }}>GEMS</span>
            </div>
          </div>

          {/* Divider */}
          <div style={s.divider} />

          {/* Victory label */}
          <div style={s.victoryLabel}>VICTORY</div>

          {/* Hero multiplier */}
          <div style={{
            ...s.heroMultiplier,
            color: theme.accent.green,
            textShadow: `0 0 30px ${theme.accent.green}50, 0 0 60px ${theme.accent.green}20, 0 0 100px ${theme.accent.green}10`,
          }} className="mono">
            {Number(multiplier).toFixed(2)}x
          </div>

          {/* Profit display */}
          <div style={s.profitRow}>
            <div style={s.profitAmount} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: 22, height: 22 }} />
              +{formatSol(profit)} <SolIcon size="0.9em" />
            </div>
            <div style={s.profitBadge}>+{profitPercent}%</div>
          </div>

          {/* Separator line */}
          <div style={s.separator} />

          {/* Stats grid */}
          <div style={{
            ...s.statsGrid,
            gridTemplateColumns: stats.length <= 2 ? '1fr 1fr' : '1fr 1fr',
          }}>
            {stats.map((stat, i) => (
              <div key={i} style={s.statItem}>
                <div style={s.statLabel}>{stat.label}</div>
                <div style={{ ...s.statValue, color: stat.color || theme.text.primary }} className="mono">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Bet → Payout row */}
          <div style={s.betPayoutRow}>
            <div style={s.betPayoutItem}>
              <span style={s.betPayoutLabel}>Bet</span>
              <span style={s.betPayoutValue} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                {formatSol(betAmount)}
              </span>
            </div>
            <div style={s.arrow}>→</div>
            <div style={s.betPayoutItem}>
              <span style={s.betPayoutLabel}>Payout</span>
              <span style={{ ...s.betPayoutValue, color: theme.accent.green }} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                {formatSol(payout)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={s.footer}>
            <div style={s.userRow}>
              <div style={s.userAvatar}>
                {username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={s.username}>{username}</div>
                <div style={s.userMeta}>
                  Lvl {level} · <span style={{ color: theme.vip[vipTier as keyof typeof theme.vip] || theme.text.muted }}>{vipTier.toUpperCase()}</span>
                </div>
              </div>
            </div>
            <div style={s.timestampText}>{formatTime(timestamp)}</div>
          </div>

          {/* Brand watermark */}
          <div style={s.watermark}>tradegems.gg</div>
        </div>

        {/* Buttons (outside card ref — not captured in PNG) */}
        <div style={s.buttonRow}>
          <button onClick={handleDownload} style={s.downloadBtn} disabled={downloading}>
            {downloading ? 'Saving...' : 'Download PNG'}
          </button>
          <button onClick={onClose} style={s.closeBtn}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    maxHeight: '95vh',
    overflowY: 'auto',
  },
  card: {
    position: 'relative',
    width: '380px',
    background: 'linear-gradient(180deg, #0e0e10 0%, #080808 50%, #0a0a0c 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 0 40px rgba(0, 220, 130, 0.08), 0 20px 60px rgba(0, 0, 0, 0.6)',
    padding: '24px',
    overflow: 'hidden',
  },
  gridPattern: {
    position: 'absolute',
    inset: 0,
    opacity: 0.4,
    background: `repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(255,255,255,0.015) 23px, rgba(255,255,255,0.015) 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(255,255,255,0.015) 23px, rgba(255,255,255,0.015) 24px)`,
    pointerEvents: 'none',
  },
  glowOrb: {
    position: 'absolute',
    top: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '300px',
    height: '200px',
    borderRadius: '50%',
    pointerEvents: 'none',
  },
  header: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameBadge: {
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '1.5px',
  },
  logoText: {
    fontSize: '14px',
    letterSpacing: '0.5px',
  },
  divider: {
    position: 'relative',
    height: '1px',
    background: 'rgba(255, 255, 255, 0.06)',
    margin: '16px 0 12px',
  },
  victoryLabel: {
    position: 'relative',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: 'rgba(0, 220, 130, 0.6)',
    letterSpacing: '4px',
    marginBottom: '4px',
  },
  heroMultiplier: {
    position: 'relative',
    textAlign: 'center',
    fontSize: '64px',
    fontWeight: 900,
    lineHeight: 1,
    marginBottom: '8px',
  },
  profitRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  profitAmount: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '20px',
    fontWeight: 800,
    color: '#00dc82',
  },
  profitBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#00dc82',
    background: 'rgba(0, 220, 130, 0.1)',
    border: '1px solid rgba(0, 220, 130, 0.2)',
  },
  separator: {
    position: 'relative',
    height: '1px',
    background: 'rgba(255, 255, 255, 0.04)',
    margin: '0 0 16px',
  },
  statsGrid: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  statItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#e8ecf4',
  },
  betPayoutRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    marginBottom: '16px',
  },
  betPayoutItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  betPayoutLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  betPayoutValue: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#e8ecf4',
  },
  arrow: {
    fontSize: '18px',
    color: 'rgba(255, 255, 255, 0.15)',
    fontWeight: 300,
  },
  footer: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  userAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: theme.gradient.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
  },
  username: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  userMeta: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  timestampText: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
    textAlign: 'right',
  },
  watermark: {
    position: 'relative',
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(139, 92, 246, 0.3)',
    letterSpacing: '2px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    width: '380px',
  },
  downloadBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '10px',
    background: theme.gradient.primary,
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  closeBtn: {
    padding: '12px 20px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: theme.text.secondary,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
