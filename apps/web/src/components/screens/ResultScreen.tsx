import { useGameStore } from '../../stores/gameStore';
import { formatMultiplier } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';
import { GameNode } from '../../types/game';
import { formatSol } from '../../utils/sol';

function nodeLabel(node: GameNode): string {
  switch (node.type) {
    case 'multiplier': return `×${node.value}`;
    case 'divider': return `÷${node.value}`;
    case 'shield': return 'Shield';
    case 'fake_breakout': return 'Fake breakout';
    case 'volatility_spike': return 'Vol spike';
    default: return node.type;
  }
}

function nodeColor(node: GameNode): string {
  switch (node.type) {
    case 'multiplier': return theme.game.multiplier;
    case 'divider': return theme.game.divider;
    case 'shield': return theme.game.shield;
    case 'fake_breakout': return theme.game.fakeBreakout;
    case 'volatility_spike': return theme.game.volatilitySpike;
    default: return theme.text.secondary;
  }
}

export function ResultScreen() {
  const { result, profile, playAgain, resetRound, betAmount, riskTier } = useGameStore();

  if (!result) return null;

  const isWin = result.finalMultiplier >= 1;
  const profit = result.payout - result.playerState.betAmount;
  const profitPercent = ((result.finalMultiplier - 1) * 100).toFixed(0);
  const resultColor = isWin ? theme.game.multiplier : theme.game.divider;

  return (
    <div style={styles.container}>
      <div style={styles.columns}>
        {/* Left: Hero result */}
        <div style={styles.heroCol}>
          <div style={{
            ...styles.heroBanner,
            border: `1px solid ${resultColor}30`,
            background: `linear-gradient(180deg, ${resultColor}06, transparent)`,
          }}>
            <span style={{ ...styles.resultTag, color: resultColor }}>
              {isWin ? 'Round won' : 'Round lost'}
            </span>
            <span
              style={{ ...styles.heroMultiplier, color: resultColor }}
              className="mono"
            >
              {formatMultiplier(result.finalMultiplier)}
            </span>
            <span style={{ ...styles.heroPnl, color: resultColor }} className="mono">
              {profit >= 0 ? '+' : ''}{formatSol(profit)} SOL ({profit >= 0 ? '+' : ''}{profitPercent}%)
            </span>
          </div>

          {/* Round summary */}
          <div style={styles.summaryPanel}>
            <div style={styles.summaryHeader}>
              <span style={styles.summaryTitle}>Round summary</span>
            </div>
            <div style={styles.summaryBody}>
              <SummaryRow label="Bet" value={`${formatSol(result.playerState.betAmount)} SOL`} icon />
              <SummaryRow label="Payout" value={`${formatSol(result.payout)} SOL`} color={resultColor} icon />
              <SummaryRow label="P&L" value={`${profit >= 0 ? '+' : ''}${formatSol(profit)} SOL`} color={resultColor} icon />
              <SummaryRow label="Risk" value={result.playerState.riskTier} color={
                result.playerState.riskTier === 'aggressive' ? theme.danger :
                result.playerState.riskTier === 'conservative' ? theme.success : theme.warning
              } />
              <SummaryRow label="Nodes hit" value={`${result.nodesHit.length}`} />
              <SummaryRow label="Missed" value={`${result.nodesMissed.length}`} color={result.nodesMissed.length > 0 ? theme.text.muted : undefined} />
            </div>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button onClick={playAgain} style={styles.primaryBtn}>
              <span style={styles.primaryBtnText}>Play again</span>
              <span style={styles.primaryBtnSub} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />
                {formatSol(betAmount)} · {riskTier}
              </span>
            </button>
            <button onClick={resetRound} style={styles.ghostBtn}>
              Back to lobby
            </button>
          </div>
        </div>

        {/* Right: Breakdown & Progression */}
        <div style={styles.detailCol}>
          {/* Node log */}
          <div style={styles.summaryPanel}>
            <div style={styles.summaryHeader}>
              <span style={styles.summaryTitle}>Node log</span>
              <span style={styles.nodeCount} className="mono">
                {result.nodesHit.length + result.nodesMissed.length}
              </span>
            </div>
            <div style={styles.nodeList}>
              {result.nodesHit.map((node) => (
                <div key={node.id} style={styles.nodeRow}>
                  <span style={{ ...styles.nodeLabel, color: nodeColor(node) }} className="mono">
                    {nodeLabel(node)}
                  </span>
                  <span style={{ ...styles.nodeStatus, color: theme.game.multiplier }}>HIT</span>
                </div>
              ))}
              {result.nodesMissed.map((node) => (
                <div key={node.id} style={{ ...styles.nodeRow, opacity: 0.5 }}>
                  <span style={styles.nodeLabel} className="mono">
                    {nodeLabel(node)}
                  </span>
                  <span style={{ ...styles.nodeStatus, color: theme.text.muted }}>MISS</span>
                </div>
              ))}
              {result.nodesHit.length === 0 && result.nodesMissed.length === 0 && (
                <div style={styles.emptyNode}>No nodes encountered</div>
              )}
            </div>
          </div>

          {/* Progression */}
          <div style={styles.summaryPanel}>
            <div style={styles.summaryHeader}>
              <span style={styles.summaryTitle}>Progression</span>
            </div>
            <div style={styles.summaryBody}>
              <SummaryRow label="XP earned" value={`+${result.xpGained}`} color={theme.accent.purple} />
              <SummaryRow label="Level" value={`${profile.level}`} />
              <SummaryRow label="VIP" value={profile.vipTier} color={theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary} />
              <div style={styles.xpBarWrap}>
                <div style={styles.xpBarTrack}>
                  <div style={{
                    ...styles.xpBarFill,
                    width: `${(profile.xp / profile.xpToNext) * 100}%`,
                  }} />
                </div>
                <div style={styles.xpBarLabel} className="mono">
                  {profile.xp}/{profile.xpToNext}
                </div>
              </div>
            </div>
          </div>

          {/* Balance */}
          <div style={styles.balancePanel}>
            <span style={styles.balanceLabel}>Balance</span>
            <span style={styles.balanceValue} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '20px', height: '20px', marginRight: '5px', verticalAlign: 'middle' }} />
              {formatSol(profile.balance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function SummaryRow({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: boolean }) {
  return (
    <div style={summaryRowStyles.row}>
      <span style={summaryRowStyles.label}>{label}</span>
      <span style={{ ...summaryRowStyles.value, color: color || theme.text.primary }} className="mono">
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />}
        {value}
      </span>
    </div>
  );
}

const summaryRowStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '13px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
};

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '16px',
    flex: 1,
  },
  heroCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Hero Banner
  heroBanner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '32px 24px',
    borderRadius: '10px',
    border: '1px solid transparent',
  },
  resultTag: {
    fontSize: '13px',
    fontWeight: 700,
  },
  heroMultiplier: {
    fontSize: '72px',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-2px',
  },
  heroPnl: {
    fontSize: '18px',
    fontWeight: 600,
    marginTop: '4px',
  },

  // Summary Panels
  summaryPanel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  summaryTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    flex: 1,
  },
  nodeCount: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.secondary,
  },
  summaryBody: {
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  // Node Log
  nodeList: {
    display: 'flex',
    flexDirection: 'column',
  },
  nodeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  nodeLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.secondary,
  },
  nodeStatus: {
    fontSize: '10px',
    fontWeight: 700,
  },
  emptyNode: {
    padding: '12px',
    fontSize: '12px',
    color: theme.text.muted,
    textAlign: 'center',
  },

  // XP
  xpBarWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
  },
  xpBarTrack: {
    height: '3px',
    background: theme.bg.primary,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    background: '#9945FF',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  xpBarLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.text.muted,
    textAlign: 'right',
  },

  // Actions
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  primaryBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    padding: '14px 24px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  primaryBtnText: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  },
  primaryBtnSub: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
  },
  ghostBtn: {
    padding: '10px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
  },

  // Balance
  balancePanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
  },
  balanceLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },
};
