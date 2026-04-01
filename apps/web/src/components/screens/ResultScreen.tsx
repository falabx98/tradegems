import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatMultiplier } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';
import { GameNode } from '../../types/game';
import { formatSol } from '../../utils/sol';
import { playLevelUp, hapticHeavy } from '../../utils/sounds';
import { GemIcon, BombIcon, ShieldIcon, LightningIcon, WaveIcon } from '../ui/GameIcons';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { getServerConfig } from '../../utils/api';
import { WinCard } from '../ui/WinCard';
import { SolIcon } from '../ui/SolIcon';
import { ErrorState } from '../primitives/ErrorState';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { GameHeader } from '../game/GameHeader';
import { WinConfetti } from '../game/WinConfetti';
import { CountUpNumber } from '../game/CountUpNumber';
import { gameTrack } from '../../utils/analytics';

// ─── Helpers ─────────────────────────────────────────────────

function nodeLabel(n: GameNode): string {
  switch (n.type) {
    case 'multiplier': return `×${n.value}`;
    case 'divider': return `÷${n.value}`;
    case 'shield': return 'Shield';
    case 'fake_breakout': return 'Fake breakout';
    case 'volatility_spike': return 'Vol spike';
    default: return n.type;
  }
}

function nodeColor(n: GameNode): string {
  switch (n.type) {
    case 'multiplier': return theme.game.multiplier;
    case 'divider': return theme.game.divider;
    case 'shield': return theme.game.shield;
    case 'fake_breakout': return theme.game.fakeBreakout;
    case 'volatility_spike': return theme.game.volatilitySpike;
    default: return theme.text.secondary;
  }
}

function nodeIcon(n: GameNode): React.ReactNode {
  switch (n.type) {
    case 'multiplier': return <GemIcon size={14} />;
    case 'divider': return <BombIcon size={14} />;
    case 'shield': return <ShieldIcon size={14} />;
    case 'fake_breakout': return <LightningIcon size={14} />;
    case 'volatility_spike': return <WaveIcon size={14} />;
    default: return null;
  }
}

const SOLO_ATMOSPHERE = 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.04) 0%, transparent 70%)';

// ─── Main Component ──────────────────────────────────────────

export function ResultScreen() {
  const isMobile = useIsMobile();
  const { result, profile, playAgain, resetRound, betAmount, riskTier } = useGameStore();
  const go = useAppNavigate();
  const [revealed, setRevealed] = useState(false);
  const [feeRate, setFeeRate] = useState<number>((globalThis as any).__serverFeeRate ?? 0.03);
  const [showWinCard, setShowWinCard] = useState(false);

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  useEffect(() => {
    setTimeout(() => setRevealed(true), 300);
  }, []);

  useEffect(() => {
    getServerConfig().then(cfg => setFeeRate(cfg.feeRate));
  }, []);

  useEffect(() => {
    if (!result) return;
    const fee = Math.floor(result.playerState.betAmount * feeRate);
    const totalCost = result.playerState.betAmount + fee;
    if (result.payout >= totalCost) {
      setTimeout(() => { playLevelUp(); hapticHeavy(); }, 400);
    }
  }, [result, feeRate]);

  if (!result) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
      <ErrorState message="Round result not available" retry={() => { resetRound(); go('lobby'); }} />
    </div>
  );

  const fee = Math.floor(result.playerState.betAmount * feeRate);
  const totalCost = result.playerState.betAmount + fee;
  const isWin = result.payout >= totalCost;
  const profit = result.payout - totalCost;
  const resultColor = isWin ? theme.accent.neonGreen : theme.accent.red;
  const totalNodes = result.nodesHit.length + result.nodesMissed.length;
  const hitRate = totalNodes > 0 ? Math.round((result.nodesHit.length / totalNodes) * 100) : 0;

  // Track result
  useEffect(() => {
    gameTrack.complete('solo', isWin ? 'win' : 'loss', result.finalMultiplier, result.payout);
  }, []);

  /* ─── HEADER ─── */
  const header = (
    <GameHeader
      title="Solo"
      subtitle="Round Complete"
      backTo="lobby"
      icon={
        <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
        </div>
      }
    />
  );

  /* ─── RAIL: Actions + Summary ─── */
  const railContent = (
    <GameControlRail>
      {/* Actions */}
      <button onClick={() => { playAgain(); go('setup'); }} style={primaryBtn}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Play Again</span>
        <span className="mono" style={{ fontSize: 12, opacity: 0.7 }}>
          {formatSol(betAmount)} <SolIcon size="0.8em" /> · {riskTier === 'conservative' ? 'Low' : riskTier === 'balanced' ? 'Balanced' : 'High'}
        </span>
      </button>

      <button onClick={() => { resetRound(); go('lobby'); }} style={ghostBtn}>
        Back to Lobby
      </button>

      {isWin && (
        <button onClick={() => setShowWinCard(true)} style={{ ...ghostBtn, color: theme.accent.neonGreen, borderColor: 'rgba(0,231,1,0.15)' }}>
          Share Win
        </button>
      )}

      {/* Round Summary */}
      <div style={panelStyle}>
        <div style={panelHeader}><span style={panelTitle}>Round Summary</span></div>
        <div style={panelBody}>
          <Row label="Bet" value={<>{formatSol(result.playerState.betAmount)} <SolIcon size="0.9em" /></>} />
          <Row label={`Fee (${(feeRate * 100).toFixed(0)}%)`} value={<>{formatSol(fee)} <SolIcon size="0.9em" /></>} color={theme.text.muted} />
          <Row label="Payout" value={<>{formatSol(result.payout)} <SolIcon size="0.9em" /></>} color={resultColor} />
          <Row label="P&L" value={<>{profit >= 0 ? '+' : ''}{formatSol(profit)} <SolIcon size="0.9em" /></>} color={resultColor} />
          <Row label="Risk" value={result.playerState.riskTier} color={
            result.playerState.riskTier === 'aggressive' ? theme.danger :
            result.playerState.riskTier === 'conservative' ? theme.success : theme.warning
          } />
        </div>
      </div>

      {/* Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${gap.sm}px ${gap.md}px`, background: 'rgba(255,255,255,0.02)', borderRadius: theme.radius.md, border: `1px solid ${theme.border.subtle}` }}>
        <span style={{ fontSize: ts('sm'), color: theme.text.muted }}>Balance</span>
        <span className="mono" style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary }}>
          {formatSol(profile.balance)} <SolIcon size="0.9em" />
        </span>
      </div>
    </GameControlRail>
  );

  /* ─── STAGE: Hero Result + Waterfall ─── */
  const stageContent = (
    <GameStage atmosphere={SOLO_ATMOSPHERE} style={{ padding: isMobile ? gap.md : gap.lg }}>
      {!isMobile && <div style={{ marginBottom: gap.md }}>{header}</div>}

      {/* Hero result */}
      <div style={{
        textAlign: 'center',
        padding: `${isMobile ? 24 : 40}px ${gap.lg}px`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <WinConfetti active={isWin && revealed} zIndex={2} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 16px', borderRadius: 20,
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          background: `${resultColor}12`, border: `1px solid ${resultColor}25`, color: resultColor,
          marginBottom: gap.sm, position: 'relative', zIndex: 3,
        }}>
          {isWin ? 'VICTORY' : 'DEFEAT'}
        </div>

        {/* Multiplier */}
        <div style={{
          fontSize: isMobile ? 48 : 72, fontWeight: 900, lineHeight: 1,
          fontFamily: "'JetBrains Mono', monospace",
          color: resultColor,
          textShadow: `0 0 30px ${resultColor}40`,
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.5)',
          transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative', zIndex: 3,
        }}>
          {formatMultiplier(result.finalMultiplier)}
        </div>

        {/* P&L */}
        <div style={{
          fontSize: isMobile ? 20 : 26, fontWeight: 800,
          fontFamily: "'JetBrains Mono', monospace",
          color: resultColor, marginTop: gap.xs,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          opacity: revealed ? 1 : 0, transition: 'opacity 0.4s ease 0.3s',
          position: 'relative', zIndex: 3,
        }}>
          {profit >= 0 ? '+' : ''}{formatSol(profit)} <SolIcon size="0.8em" />
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: gap.lg, marginTop: gap.lg, position: 'relative', zIndex: 3 }}>
          <Stat label="Hit Rate" value={`${hitRate}%`} color={hitRate >= 50 ? theme.accent.neonGreen : theme.accent.red} />
          <Stat label="Nodes" value={`${result.nodesHit.length}/${totalNodes}`} color={theme.accent.purple} />
          <Stat label="XP" value={`+${result.xpGained}`} color={theme.accent.purple} />
        </div>
      </div>

      {/* Multiplier Waterfall */}
      <div style={panelStyle}>
        <div style={panelHeader}>
          <span style={panelTitle}>Multiplier Breakdown</span>
          <span className="mono" style={{ fontSize: ts('sm'), fontWeight: 800, color: resultColor }}>
            {formatMultiplier(result.finalMultiplier)}
          </span>
        </div>
        <div style={{ padding: '4px 0' }}>
          <WaterfallStep label="Base" value="1.0x" color={theme.text.secondary} isFirst />
          {result.nodesHit.map((node, i) => (
            <WaterfallStep key={node.id} icon={nodeIcon(node)} label={nodeLabel(node)}
              value={node.type === 'multiplier' ? `×${node.value}` : `÷${node.value}`}
              color={nodeColor(node)} delay={i * 60} />
          ))}
          {result.nodesMissed.map((node, i) => (
            <WaterfallStep key={node.id} icon={nodeIcon(node)} label={nodeLabel(node)}
              value="MISS" color={theme.text.muted} missed delay={(result.nodesHit.length + i) * 60} />
          ))}
          {totalNodes === 0 && (
            <div style={{ padding: 16, fontSize: ts('sm'), color: theme.text.muted, textAlign: 'center' }}>
              No nodes encountered
            </div>
          )}
        </div>
      </div>

      {/* Progression */}
      <div style={{ ...panelStyle, marginTop: gap.md }}>
        <div style={panelHeader}><span style={panelTitle}>Progression</span></div>
        <div style={panelBody}>
          <Row label="Level" value={`${profile.level}`} />
          <Row label="VIP" value={profile.vipTier} color={theme.accent.purple} />
          <div style={{ marginTop: gap.xs }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: theme.text.muted }}>XP</span>
              <span className="mono" style={{ fontSize: 11, color: theme.text.muted }}>{profile.xp}/{profile.xpToNext}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: theme.accent.purple, width: `${Math.min(100, (profile.xp / profile.xpToNext) * 100)}%`, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        </div>
      </div>
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = (
    <GameFooterBar>
      <span>Solo · Provably Fair</span>
    </GameFooterBar>
  );

  return (
    <>
      {isMobile && <div style={{ padding: `${gap.sm}px 12px` }}>{header}</div>}
      <CasinoGameLayout
        rail={railContent}
        stage={stageContent}
        footer={footerContent}
      />
      {showWinCard && (
        <WinCard
          gameType="solo"
          multiplier={result.finalMultiplier}
          betAmount={result.playerState.betAmount}
          payout={result.payout}
          profit={profit}
          timestamp={new Date()}
          username={profile.username || 'Player'}
          level={profile.level}
          vipTier={profile.vipTier || 'bronze'}
          nodesHit={result.nodesHit.length}
          totalNodes={totalNodes}
          riskTier={result.playerState.riskTier}
          xpGained={result.xpGained}
          onClose={() => setShowWinCard(false)}
        />
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function WaterfallStep({ icon, label, value, color, isFirst, missed, delay = 0 }: {
  icon?: React.ReactNode; label: string; value: string; color: string; isFirst?: boolean; missed?: boolean; delay?: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px',
      borderLeft: `2px solid ${missed ? theme.text.muted + '30' : color}`,
      opacity: missed ? 0.4 : 1,
      animation: `slideUp 0.3s ease ${delay}ms both`,
    }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: isFirst ? theme.text.muted : color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: missed ? theme.text.muted : theme.text.primary, textDecoration: missed ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: theme.text.muted }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: color || theme.text.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: theme.text.muted, marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  background: theme.bg.card,
  border: `1px solid ${theme.border.subtle}`,
  borderRadius: theme.radius.md,
  overflow: 'hidden',
};

const panelHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: `1px solid ${theme.border.subtle}`,
  background: theme.bg.tertiary,
};

const panelTitle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: theme.text.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const panelBody: CSSProperties = {
  padding: '8px 12px',
  display: 'flex', flexDirection: 'column', gap: 5,
};

const primaryBtn: CSSProperties = {
  width: '100%', padding: '14px 16px',
  fontSize: 15, fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#fff',
  background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
  border: 'none', borderRadius: theme.radius.lg,
  cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  minHeight: 48,
};

const ghostBtn: CSSProperties = {
  width: '100%', padding: '10px 16px',
  fontSize: 13, fontWeight: 600,
  color: theme.text.secondary,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${theme.border.medium}`,
  borderRadius: theme.radius.md,
  cursor: 'pointer', fontFamily: 'inherit',
  minHeight: 40,
};
