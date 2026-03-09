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
              color: isProfit ? theme.game.multiplier : theme.game.divider,
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
                color: isProfit ? theme.game.multiplier : theme.game.divider,
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
              color: riskTier === 'aggressive' ? theme.danger :
                     riskTier === 'conservative' ? theme.success :
                     theme.warning,
            }}>
              {riskTier.charAt(0).toUpperCase()}
            </span>
            {shields > 0 && (
              <span style={{ ...styles.metaItem, color: theme.game.shield }} className="mono">
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
  },
  phaseDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
  },
  phaseText: {
    fontSize: '10px',
    fontWeight: 700,
  },
  timer: {
    fontSize: '22px',
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
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  multValue: {
    fontSize: '36px',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-1px',
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
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  payoutValue: {
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
  },
  metaGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  metaItem: {
    fontSize: '9px',
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
