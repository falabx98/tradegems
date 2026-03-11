import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatMultiplier } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';
import { GameNode } from '../../types/game';
import { formatSol } from '../../utils/sol';

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

function nodeIcon(node: GameNode): string {
  switch (node.type) {
    case 'multiplier': return '💎';
    case 'divider': return '💣';
    case 'shield': return '🛡';
    case 'fake_breakout': return '⚡';
    case 'volatility_spike': return '🌊';
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

    const colors = ['#34d399', '#14F195', '#9945FF', '#c084fc', '#fbbf24', '#5b8def', '#fff'];

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

// ─── Animated Counter ────────────────────────────────────────────────────────

function AnimatedValue({ value, prefix, suffix, duration = 800 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(eased * value);
      if (t < 1) start = requestAnimationFrame(tick);
    }
    start = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(start);
  }, [value, duration]);

  const formatted = Math.abs(display) < 10 ? display.toFixed(2) : display.toFixed(0);
  return <>{prefix}{formatted}{suffix}</>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ResultScreen() {
  const isMobile = useIsMobile();
  const { result, profile, playAgain, resetRound, betAmount, riskTier } = useGameStore();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!result) return null;

  const isWin = result.finalMultiplier >= 1;
  const profit = result.payout - result.playerState.betAmount;
  const profitPercent = ((result.finalMultiplier - 1) * 100).toFixed(0);
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
              {isWin ? '🏆 VICTORY' : '💥 DEFEAT'}
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
            }} className="mono">
              {profit >= 0 ? '+' : ''}{formatSol(profit)} SOL ({profit >= 0 ? '+' : ''}{profitPercent}%)
            </div>
          </div>

          {/* Quick stats row */}
          <div style={s.statsRow}>
            <StatCard label="Hit Rate" value={`${hitRate}%`} accent={hitRate >= 50 ? theme.game.multiplier : theme.game.divider} />
            <StatCard label="Nodes Hit" value={`${result.nodesHit.length}/${totalNodes}`} accent={theme.accent.purple} />
            <StatCard label="XP Earned" value={`+${result.xpGained}`} accent={theme.accent.cyan} />
          </div>

          {/* Round summary */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Round Summary</span>
            </div>
            <div style={s.panelBody}>
              <SummaryRow label="Bet" value={`${formatSol(result.playerState.betAmount)} SOL`} icon />
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
              onClick={playAgain}
              className="btn-3d btn-3d-primary"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '3px', padding: '14px 24px', fontSize: '16px', width: '100%',
              }}
            >
              <span style={s.primaryBtnText}>Play again</span>
              <span style={s.primaryBtnSub} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />
                {formatSol(betAmount)} · {riskTier}
              </span>
            </button>
            <button onClick={resetRound} style={s.ghostBtn}>
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
                  label={`${nodeIcon(node)} ${nodeLabel(node)}`}
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
                  label={`${nodeIcon(node)} ${nodeLabel(node)}`}
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

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      padding: '10px 8px',
      background: `${accent}08`,
      border: `1px solid ${accent}20`,
      borderRadius: '10px',
    }}>
      <span style={{ fontSize: '18px', fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
      <span style={{ fontSize: '11px', fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
    </div>
  );
}

function WaterfallStep({ label, value, color, isFirst, missed, delay = 0 }: {
  label: string; value: string; color: string; isFirst?: boolean; missed?: boolean; delay?: number;
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
      }}>
        {label}
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
    padding: '4px 14px',
    borderRadius: '20px',
    letterSpacing: '1.5px',
    fontFamily: "'Orbitron', sans-serif",
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
    fontSize: '20px',
    fontWeight: 600,
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
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
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
    fontFamily: "'Orbitron', sans-serif",
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
    background: 'linear-gradient(90deg, #9945FF, #c084fc)',
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
    fontFamily: 'Rajdhani, sans-serif',
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
    fontFamily: 'Rajdhani, sans-serif',
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
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  balanceLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },
};
