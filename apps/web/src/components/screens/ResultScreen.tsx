import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatMultiplier } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';
import { GameNode } from '../../types/game';
import { formatSol } from '../../utils/sol';
import { playLevelUp, hapticHeavy } from '../../utils/sounds';
import { GemIcon, BombIcon, ShieldIcon, LightningIcon, WaveIcon, TrophyIcon, ExplosionIcon } from '../ui/GameIcons';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { getServerConfig } from '../../utils/api';
import { StatCard as SharedStatCard } from '../ui/StatCard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function nodeIcon(node: GameNode): React.ReactNode {
  switch (node.type) {
    case 'multiplier': return <GemIcon size={16} />;
    case 'divider': return <BombIcon size={16} />;
    case 'shield': return <ShieldIcon size={16} />;
    case 'fake_breakout': return <LightningIcon size={16} />;
    case 'volatility_spike': return <WaveIcon size={16} />;
    default: return '•';
  }
}

// ─── Confetti Canvas ─────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  rotation: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  shape: 'rect' | 'circle';
}

function ConfettiCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    const colors = ['#2ecc71', '#14F195', '#8b5cf6', '#3b82f6', '#a78bfa', '#5b8def', '#fff'];

    // Burst particles
    for (let i = 0; i < 120; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 8;
      particles.current.push({
        x: W / 2, y: H * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        life: 0,
        maxLife: 60 + Math.random() * 60,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }

    function tick() {
      ctx!.clearRect(0, 0, W, H);
      const ps = particles.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.life++;

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (alpha <= 0) { ps.splice(i, 1); continue; }

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.restore();
      }

      if (ps.length > 0) raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ResultScreen() {
  const isMobile = useIsMobile();
  const { result, profile, playAgain, resetRound, betAmount, riskTier } = useGameStore();
  const go = useAppNavigate();
  const [revealed, setRevealed] = useState(false);
  const [feeRate, setFeeRate] = useState<number>((globalThis as any).__serverFeeRate ?? 0.03);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Fetch server fee rate
  useEffect(() => {
    getServerConfig().then(cfg => setFeeRate(cfg.feeRate));
  }, []);

  // L1 fix: Play victory sound based on actual win condition (payout >= totalCost)
  // instead of just finalMultiplier >= 1 (which ignores the fee)
  useEffect(() => {
    if (!result) return;
    const fee = Math.floor(result.playerState.betAmount * feeRate);
    const totalCost = result.playerState.betAmount + fee;
    if (result.payout >= totalCost) {
      setTimeout(() => { playLevelUp(); hapticHeavy(); }, 400);
    }
  }, [result, feeRate]);

  if (!result) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
      <p style={{ fontSize: '16px', color: theme.text.secondary }}>Round result not available</p>
      <button
        onClick={() => { resetRound(); go('lobby'); }}
        style={{ padding: '10px 24px', background: theme.bg.secondary, border: `1px solid ${theme.border.medium}`, borderRadius: '8px', color: theme.text.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600 }}
      >
        Back to Lobby
      </button>
    </div>
  );

  // M1+M2: Account for fee in victory determination and display
  const fee = Math.floor(result.playerState.betAmount * feeRate);
  const totalCost = result.playerState.betAmount + fee;
  // Victory = payout exceeds total cost (bet + fee), not just bet
  const isWin = result.payout >= totalCost;
  const profit = result.payout - totalCost;
  const profitPercent = totalCost > 0 ? ((result.payout / totalCost - 1) * 100).toFixed(0) : '0';
  const resultColor = isWin ? theme.game.multiplier : theme.game.divider;
  const totalNodes = result.nodesHit.length + result.nodesMissed.length;
  const hitRate = totalNodes > 0 ? Math.round((result.nodesHit.length / totalNodes) * 100) : 0;

  return (
    <div style={{
      ...s.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      <div style={{
        ...s.columns,
        ...(isMobile ? { gridTemplateColumns: '1fr', gap: '10px' } : {}),
      }}>
        {/* Left: Hero result */}
        <div style={s.heroCol}>
          <div style={{
            ...s.heroBanner,
            borderColor: `${resultColor}30`,
            background: `linear-gradient(180deg, ${resultColor}08, transparent 60%)`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            <ConfettiCanvas active={isWin && revealed} />

            {/* Result badge */}
            <div style={{
              ...s.resultBadge,
              background: `${resultColor}15`,
              border: `1px solid ${resultColor}30`,
              color: resultColor,
            }}>
              {isWin ? <><TrophyIcon size={22} color={resultColor} /> VICTORY</> : <><ExplosionIcon size={22} color={resultColor} /> DEFEAT</>}
            </div>

            {/* Animated multiplier */}
            <div
              style={{
                ...s.heroMultiplier,
                color: resultColor,
                textShadow: `0 0 40px ${resultColor}60, 0 0 80px ${resultColor}20`,
                ...(isMobile ? { fontSize: '56px' } : {}),
                opacity: revealed ? 1 : 0,
                transform: revealed ? 'scale(1)' : 'scale(0.5)',
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              className="mono"
            >
              {formatMultiplier(result.finalMultiplier)}
            </div>

            {/* P&L */}
            <div style={{
              ...s.heroPnl,
              color: resultColor,
              opacity: revealed ? 1 : 0,
              transition: 'opacity 0.4s ease 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              justifyContent: 'center',
            }} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '28px', height: '28px' }} />
              {profit >= 0 ? '+' : ''}{formatSol(profit)} SOL
              <span style={{ fontSize: '16px', color: resultColor, opacity: 0.8 }}>({profit >= 0 ? '+' : ''}{profitPercent}%)</span>
            </div>
          </div>

          {/* Quick stats row */}
          <div style={s.statsRow}>
            <SharedStatCard label="Hit Rate" value={`${hitRate}%`} color={hitRate >= 50 ? theme.game.multiplier : theme.game.divider} />
            <SharedStatCard label="Nodes Hit" value={`${result.nodesHit.length}/${totalNodes}`} color={theme.accent.purple} />
            <SharedStatCard label="XP Earned" value={`+${result.xpGained}`} trend="up" color={theme.accent.purple} />
          </div>

          {/* Round summary */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Round Summary</span>
            </div>
            <div style={s.panelBody}>
              <SummaryRow label="Bet" value={`${formatSol(result.playerState.betAmount)} SOL`} icon />
              <SummaryRow label={`Fee (${(feeRate * 100).toFixed(0)}%)`} value={`${formatSol(fee)} SOL`} color={theme.text.muted} icon />
              <SummaryRow label="Total Cost" value={`${formatSol(totalCost)} SOL`} icon />
              <SummaryRow label="Payout" value={`${formatSol(result.payout)} SOL`} color={resultColor} icon />
              <SummaryRow label="P&L" value={`${profit >= 0 ? '+' : ''}${formatSol(profit)} SOL`} color={resultColor} icon />
              <SummaryRow label="Risk" value={result.playerState.riskTier} color={
                result.playerState.riskTier === 'aggressive' ? theme.danger :
                result.playerState.riskTier === 'conservative' ? theme.success : theme.warning
              } />
            </div>
          </div>

          {/* Actions */}
          <div style={s.actions}>
            <button
              onClick={() => { playAgain(); go('setup'); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '3px', padding: '14px 24px', fontSize: '16px', width: '100%',
                background: theme.gradient.primary,
                border: 'none',
                borderRadius: theme.radius.md,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={s.primaryBtnText}>Play again</span>
              <span style={s.primaryBtnSub} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />
                {formatSol(betAmount)} · {riskTier}
              </span>
            </button>
            <button onClick={() => { resetRound(); go('lobby'); }} style={s.ghostBtn}>
              Back to lobby
            </button>
          </div>
        </div>

        {/* Right: Breakdown */}
        <div style={s.detailCol}>
          {/* Multiplier waterfall */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Multiplier Breakdown</span>
              <span style={{ ...s.panelBadge, color: resultColor }} className="mono">
                {formatMultiplier(result.finalMultiplier)}
              </span>
            </div>
            <div style={s.waterfallWrap}>
              {/* Starting base */}
              <WaterfallStep label="Base" value="1.0x" color={theme.text.secondary} isFirst />
              {result.nodesHit.map((node, i) => (
                <WaterfallStep
                  key={node.id}
                  icon={nodeIcon(node)}
                  label={nodeLabel(node)}
                  value={node.type === 'multiplier'
                    ? `×${node.value}`
                    : `÷${node.value}`}
                  color={nodeColor(node)}
                  delay={i * 80}
                />
              ))}
              {result.nodesMissed.map((node, i) => (
                <WaterfallStep
                  key={node.id}
                  icon={nodeIcon(node)}
                  label={nodeLabel(node)}
                  value="MISS"
                  color={theme.text.muted}
                  missed
                  delay={(result.nodesHit.length + i) * 80}
                />
              ))}
              {totalNodes === 0 && (
                <div style={s.emptyNode}>No nodes encountered</div>
              )}
            </div>
          </div>

          {/* Progression */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Progression</span>
            </div>
            <div style={s.panelBody}>
              <SummaryRow label="Level" value={`${profile.level}`} />
              <SummaryRow label="VIP" value={profile.vipTier} color={theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary} />
              <div style={s.xpBarWrap}>
                <div style={s.xpBarMeta}>
                  <span style={s.xpLabel}>XP</span>
                  <span style={s.xpValues} className="mono">{profile.xp}/{profile.xpToNext}</span>
                </div>
                <div style={s.xpBarTrack}>
                  <div style={{
                    ...s.xpBarFill,
                    width: `${(profile.xp / profile.xpToNext) * 100}%`,
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* Balance */}
          <div style={s.balancePanel}>
            <span style={s.balanceLabel}>Balance</span>
            <span style={s.balanceValue} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '28px', height: '28px', marginRight: '5px', verticalAlign: 'middle' }} />
              {formatSol(profile.balance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub Components ──────────────────────────────────────────────────────────

function WaterfallStep({ icon, label, value, color, isFirst, missed, delay = 0 }: {
  icon?: React.ReactNode; label: string; value: string; color: string; isFirst?: boolean; missed?: boolean; delay?: number;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      borderLeft: `2px solid ${missed ? theme.text.muted + '30' : color}`,
      opacity: missed ? 0.45 : 1,
      animation: `slideUp 0.3s ease ${delay}ms both`,
    }}>
      {!isFirst && (
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: color, flexShrink: 0,
          boxShadow: missed ? 'none' : `0 0 6px ${color}60`,
        }} />
      )}
      {isFirst && (
        <div style={{
          width: '6px', height: '6px', borderRadius: '2px',
          background: theme.text.muted, flexShrink: 0,
        }} />
      )}
      <span style={{
        flex: 1, fontSize: '13px', fontWeight: 600,
        color: missed ? theme.text.muted : theme.text.primary,
        textDecoration: missed ? 'line-through' : 'none',
        display: 'flex', alignItems: 'center', gap: '5px',
      }}>
        {icon}{label}
      </span>
      <span style={{
        fontSize: '13px', fontWeight: 700, color,
        fontFamily: "'JetBrains Mono', monospace",
      }} className="mono">
        {value}
      </span>
    </div>
  );
}

function SummaryRow({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: boolean }) {
  return (
    <div style={summaryRowStyles.row}>
      <span style={summaryRowStyles.label}>{label}</span>
      <span style={{ ...summaryRowStyles.value, color: color || theme.text.primary }} className="mono">
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />}
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
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
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

  // Hero
  heroBanner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '40px 24px 32px',
    borderRadius: '14px',
    border: '1px solid transparent',
  },
  resultBadge: {
    fontSize: '13px',
    fontWeight: 800,
    padding: '6px 18px',
    borderRadius: '20px',
    letterSpacing: '1.5px',
    fontFamily: "inherit",
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    animation: 'glowPulse 2s ease-in-out infinite',
  },
  heroMultiplier: {
    fontSize: '80px',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-2px',
    position: 'relative' as const,
    zIndex: 3,
  },
  heroPnl: {
    fontSize: '26px',
    fontWeight: 800,
    marginTop: '4px',
    position: 'relative' as const,
    zIndex: 3,
  },

  // Stats row
  statsRow: {
    display: 'flex',
    gap: '8px',
  },

  // Panels
  panel: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.secondary,
    flex: 1,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  panelBadge: {
    fontSize: '14px',
    fontWeight: 800,
  },
  panelBody: {
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  // Waterfall
  waterfallWrap: {
    display: 'flex',
    flexDirection: 'column',
    padding: '4px 0',
  },
  emptyNode: {
    padding: '16px',
    fontSize: '14px',
    color: theme.text.muted,
    textAlign: 'center',
  },

  // XP
  xpBarWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  xpBarMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  xpValues: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  xpBarTrack: {
    height: '4px',
    background: theme.bg.primary,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    background: '#8b5cf6',
    borderRadius: '2px',
    transition: 'width 0.8s ease',
  },

  // Actions
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  primaryBtnText: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'inherit',
  },
  primaryBtnSub: {
    fontSize: '13px',
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
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.muted,
  },

  // Balance
  balancePanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
  },
  balanceLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.accent.blue,
    display: 'flex',
    alignItems: 'center',
  },
};
