import { RoundPhase } from '../../types/game';
import { getPhaseLabel, getPhaseColor, formatMultiplier } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';

interface GameHUDProps {
  phase: RoundPhase;
  elapsed: number;
  duration: number;
  currentMultiplier: number;
  betAmount: number;
  shields: number;
  riskTier: string;
}

export function GameHUD({
  phase,
  elapsed,
  duration,
  currentMultiplier,
  betAmount,
  shields,
  riskTier,
}: GameHUDProps) {
  const remaining = Math.max(0, duration - elapsed);
  const progress = Math.min(1, elapsed / duration);
  const phaseColor = getPhaseColor(phase);
  const payout = betAmount * currentMultiplier;
  const isProfit = currentMultiplier >= 1;

  return (
    <>
      {/* Top floating HUD bar */}
      <div style={styles.topBar}>
        {/* Left: Phase + Timer */}
        <div style={styles.topLeft}>
          <div style={{
            ...styles.phasePill,
            border: `1px solid ${phaseColor}40`,
            background: `${phaseColor}10`,
          }}>
            <div style={{
              ...styles.phaseDot,
              background: phaseColor,
              boxShadow: `0 0 6px ${phaseColor}80`,
            }} />
            <span style={{ ...styles.phaseText, color: phaseColor }}>
              {getPhaseLabel(phase)}
            </span>
          </div>
          <span style={styles.timer} className="mono">
            {remaining.toFixed(1)}
          </span>
        </div>

        {/* Center: Multiplier (hero) */}
        <div style={styles.topCenter}>
          <span style={styles.multLabel}>Multiplier</span>
          <span
            style={{
              ...styles.multValue,
              color: isProfit ? theme.accent.green : theme.accent.red,
              textShadow: isProfit
                ? '0 0 24px rgba(0, 230, 118, 0.3)'
                : '0 0 24px rgba(255, 59, 59, 0.3)',
            }}
            className="mono"
          >
            {formatMultiplier(currentMultiplier)}
          </span>
        </div>

        {/* Right: Payout + Meta */}
        <div style={styles.topRight}>
          <div style={styles.payoutGroup}>
            <span style={styles.payoutLabel}>Payout</span>
            <span
              style={{
                ...styles.payoutValue,
                color: isProfit ? theme.accent.green : theme.accent.red,
              }}
              className="mono"
            >
              {formatSol(payout)} SOL
            </span>
          </div>
          <div style={styles.metaGroup}>
            <span style={styles.metaItem} className="mono">{formatSol(betAmount)}</span>
            <span style={{
              ...styles.metaItem,
              color: riskTier === 'aggressive' ? theme.accent.red :
                     riskTier === 'conservative' ? theme.accent.green :
                     theme.accent.amber,
            }}>
              {riskTier.charAt(0).toUpperCase()}
            </span>
            {shields > 0 && (
              <span style={{ ...styles.metaItem, color: theme.accent.blue }} className="mono">
                ◆{shields}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div style={styles.progressContainer}>
        <div style={{
          ...styles.progressFill,
          width: `${progress * 100}%`,
          background: `linear-gradient(90deg, ${phaseColor}80, ${phaseColor})`,
          boxShadow: `0 0 8px ${phaseColor}40`,
        }} />
        {/* Phase markers */}
        <div style={{ ...styles.phaseMarker, left: '13.3%' }} />
        <div style={{ ...styles.phaseMarker, left: '40%' }} />
        <div style={{ ...styles.phaseMarker, left: '73.3%' }} />
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'rgba(17, 20, 39, 0.9)',
    borderBottom: `1px solid ${theme.border.subtle}`,
    zIndex: 4,
    pointerEvents: 'none',
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  phasePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '12px',
    border: '1px solid transparent',
    backdropFilter: 'blur(4px)',
  },
  phaseDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    animation: 'pulse 1.5s ease infinite',
  },
  phaseText: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  timer: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.text.primary,
    lineHeight: 1,
  },
  topCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  multLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  multValue: {
    fontSize: '38px',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-1px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  topRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  },
  payoutGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1px',
  },
  payoutLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  payoutValue: {
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
  metaGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  metaItem: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'rgba(255,255,255,0.04)',
    zIndex: 4,
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.1s linear',
  },
  phaseMarker: {
    position: 'absolute',
    top: 0,
    width: '1px',
    height: '100%',
    background: 'rgba(255,255,255,0.1)',
  },
};
