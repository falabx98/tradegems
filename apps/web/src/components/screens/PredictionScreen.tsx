import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { formatSol, solToLamports } from '../../utils/sol';
import { api } from '../../utils/api';
import {
  generatePredictionRound,
  regenerateWithOutcome,
  calculatePredictionResult,
  type PredictionDirection,
  type PredictionPhase,
  type PredictionRoundConfig,
  type PredictionResult,
} from '../../engine/predictionEngine';
import { CandlestickChart } from '../arena/CandlestickChart';
import { playBetPlaced, playCountdownBeep, playLevelUp, playRoundEnd, hapticMedium, hapticHeavy } from '../../utils/sounds';
import { ArrowUpIcon, ArrowDownIcon, ArrowSidewaysIcon, TrophyIcon, ExplosionIcon } from '../ui/GameIcons';
import { useAppNavigate } from '../../hooks/useAppNavigate';

const BET_OPTIONS = [
  { label: '0.01', lamports: 10_000_000 },
  { label: '0.05', lamports: 50_000_000 },
  { label: '0.1',  lamports: 100_000_000 },
  { label: '0.25', lamports: 250_000_000 },
  { label: '0.5',  lamports: 500_000_000 },
  { label: '1',    lamports: 1_000_000_000 },
  { label: '2',    lamports: 2_000_000_000 },
  { label: '5',    lamports: 5_000_000_000 },
];

// ─── Confetti (lightweight version) ──────────────────────────────────────────

function ConfettiCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const colors = ['#34d399', '#9945FF', '#fbbf24', '#c084fc', '#5b8def', '#f472b6'];
    const particles = Array.from({ length: 80 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 8 - 2,
      size: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      alpha: 1,
    }));

    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.alpha = Math.max(0, p.alpha - 0.006);
        if (p.alpha <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      frame++;
      if (alive && frame < 200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PredictionScreen() {
  const { betAmount, setBetAmount, profile, syncProfile } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const go = useAppNavigate();

  const [phase, setPhase] = useState<PredictionPhase>('setup');
  const [roundConfig, setRoundConfig] = useState<PredictionRoundConfig | null>(null);
  const [prediction, setPrediction] = useState<PredictionDirection | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [revealProgress, setRevealProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [serverRoundId, setServerRoundId] = useState<string | null>(null);
  const [customBet, setCustomBet] = useState('');

  const handleCustomBet = () => {
    const val = parseFloat(customBet);
    if (isNaN(val) || val <= 0) return;
    const lamports = solToLamports(val);
    if (isAuthenticated && lamports > profile.balance) return;
    setBetAmount(lamports);
    setCustomBet('');
  };

  const isCustomBetActive = betAmount > 0 && !BET_OPTIONS.some(o => o.lamports === betAmount);

  // Generate round on mount
  useEffect(() => {
    setRoundConfig(generatePredictionRound());
  }, []);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'countdown') return;
    playCountdownBeep(3);
    setCountdown(3);

    const id = setInterval(() => {
      setCountdown((c) => {
        const next = c - 1;
        if (next > 0) playCountdownBeep(next);
        if (next <= 0) {
          clearInterval(id);
          setPhase('revealing');
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Reveal animation
  useEffect(() => {
    if (phase !== 'revealing' || !roundConfig) return;
    const start = performance.now();
    const TOTAL_DURATION = 10 * 1500; // 10 candles * 1.5s each

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      setRevealProgress(elapsed);

      if (elapsed * 1000 >= TOTAL_DURATION) {
        resolveRound();
        return;
      }
      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, roundConfig]);

  const WIN_PROBABILITY = 0.45;

  function handlePrediction(dir: PredictionDirection) {
    if (!roundConfig) return;
    setPrediction(dir);
    playBetPlaced();
    hapticMedium();

    // Apply 45% win rate: decide if player should win, then adjust reveal candles
    const shouldWin = Math.random() < WIN_PROBABILITY;
    if (shouldWin && roundConfig.outcome !== dir) {
      // Player should win but current outcome doesn't match — regenerate to match
      setRoundConfig(regenerateWithOutcome(roundConfig, dir));
    } else if (!shouldWin && roundConfig.outcome === dir) {
      // Player should lose but current outcome matches — regenerate to a different outcome
      const alternatives: PredictionDirection[] = (['long', 'short', 'range'] as const).filter(d => d !== dir);
      const altTarget = alternatives[Math.floor(Math.random() * alternatives.length)];
      setRoundConfig(regenerateWithOutcome(roundConfig, altTarget));
    }
    // Otherwise the current outcome already aligns with the desired result

    setPhase('countdown');

    // Place bet on server in background
    if (isAuthenticated) {
      (async () => {
        try {
          const round = await api.scheduleRound() as any;
          const roundId = round.id || round.roundId;
          if (roundId) {
            await api.placeBet(roundId, {
              amount: betAmount,
              riskTier: 'balanced',
              idempotencyKey: `${roundId}-pred-${Date.now()}`,
            });
            setServerRoundId(roundId);
          }
        } catch {
          // Silent — game continues locally
        }
      })();
    }
  }

  function resolveRound() {
    if (!roundConfig || !prediction) return;

    const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
    setResult(predResult);
    setPhase('result');

    if (predResult.correct) {
      playLevelUp();
      hapticHeavy();
    } else {
      playRoundEnd(false);
    }

    // Server settlement
    if (serverRoundId) {
      (async () => {
        try {
          await api.devResolveRound(serverRoundId);
          await syncProfile();
        } catch { /* silent */ }
      })();
    }
  }

  function handlePlayAgain() {
    setPhase('setup');
    setPrediction(null);
    setResult(null);
    setRevealProgress(0);
    setCountdown(3);
    setServerRoundId(null);
    setRoundConfig(generatePredictionRound());
  }

  if (!roundConfig) return null;

  return (
    <div style={{ ...s.container, ...(isMobile ? { padding: '10px' } : {}) }}>
      {/* Header */}
      <div style={s.header}>
        <h2 style={s.title}>Price Prediction</h2>
        <div style={s.betBadge}>
          <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px' }} />
          <span className="mono" style={{ fontWeight: 700, color: theme.accent.cyan }}>
            {formatSol(betAmount)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ ...s.chartWrap, height: isMobile ? '280px' : '400px', position: 'relative' }}>
        <CandlestickChart
          historicalCandles={roundConfig.historicalCandles}
          revealCandles={roundConfig.revealCandles}
          revealProgress={revealProgress}
          entryPrice={roundConfig.entryPrice}
          phase={phase}
          prediction={prediction}
          isMobile={isMobile}
        />

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div style={s.countdownOverlay}>
            <span style={s.countdownNum}>{countdown}</span>
            <span style={{ ...s.countdownLabel, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {prediction === 'long' && <><ArrowUpIcon size={24} color="#34d399" /> LONG</>}
              {prediction === 'short' && <><ArrowDownIcon size={24} color="#f87171" /> SHORT</>}
              {prediction === 'range' && <><ArrowSidewaysIcon size={24} color="#fbbf24" /> RANGE</>}
            </span>
          </div>
        )}

        {/* Confetti on win */}
        <ConfettiCanvas active={phase === 'result' && !!result?.correct} />
      </div>

      {/* Controls / Result */}
      {phase === 'setup' && (
        <div style={s.setupPanel}>
          {/* Position Size Selector */}
          <div style={s.betSection}>
            <div style={s.betSectionHeader}>
              <span style={s.betSectionLabel}>POSITION SIZE</span>
              <div style={s.betBadge}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px' }} />
                <span className="mono" style={{ fontWeight: 700, color: theme.accent.cyan, fontSize: '13px' }}>
                  {formatSol(betAmount)}
                </span>
              </div>
            </div>
            <div style={s.betPills}>
              {BET_OPTIONS.map((opt) => {
                const active = betAmount === opt.lamports;
                const disabled = isAuthenticated && opt.lamports > profile.balance;
                return (
                  <button
                    key={opt.lamports}
                    onClick={() => { setBetAmount(opt.lamports); setCustomBet(''); }}
                    disabled={disabled}
                    className="bet-pill"
                    style={{
                      ...s.betPill,
                      ...(active ? s.betPillActive : {}),
                      ...(disabled ? { opacity: 0.3, cursor: 'not-allowed' } : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={s.customBetRow}>
              <span style={s.customBetLabel}>Custom</span>
              <div style={s.customBetInputWrap}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <input
                  type="number"
                  placeholder="0.00"
                  value={customBet}
                  onChange={(e) => setCustomBet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomBet(); }}
                  style={{
                    ...s.customBetInput,
                    ...(isCustomBetActive ? { color: '#c084fc' } : {}),
                  }}
                  className="mono"
                  step="0.01"
                  min="0"
                />
                <button
                  onClick={handleCustomBet}
                  disabled={!customBet || parseFloat(customBet) <= 0}
                  style={{
                    ...s.customBetBtn,
                    opacity: !customBet || parseFloat(customBet) <= 0 ? 0.35 : 1,
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          <p style={s.instruction}>CALL IT</p>
          <div style={{ ...s.dirRow, ...(isMobile ? { gap: '8px' } : {}) }}>
            <button onClick={() => handlePrediction('long')} className="dir-btn dir-long" style={s.dirBtn}>
              <ArrowUpIcon size={28} color="#34d399" />
              <span style={s.dirLabel}>LONG</span>
              <span style={s.dirPayout}>1.9x</span>
            </button>
            <button onClick={() => handlePrediction('range')} className="dir-btn dir-range" style={s.dirBtn}>
              <ArrowSidewaysIcon size={28} color="#fbbf24" />
              <span style={s.dirLabel}>RANGE</span>
              <span style={s.dirPayout}>3.0x</span>
            </button>
            <button onClick={() => handlePrediction('short')} className="dir-btn dir-short" style={s.dirBtn}>
              <ArrowDownIcon size={28} color="#f87171" />
              <span style={s.dirLabel}>SHORT</span>
              <span style={s.dirPayout}>1.9x</span>
            </button>
          </div>
          <p style={s.hint}>
            Entry: <span className="mono" style={{ color: '#c084fc' }}>${roundConfig.entryPrice.toFixed(2)}</span>
            {' '} | Range threshold: ±1.5%
          </p>
        </div>
      )}

      {phase === 'revealing' && (
        <div style={s.revealPanel}>
          <div style={s.revealBar}>
            <div style={{
              ...s.revealFill,
              width: `${Math.min(100, (revealProgress / 15) * 100)}%`,
            }} />
          </div>
          <p style={s.revealText}>
            Revealing candles... {Math.min(10, Math.floor(revealProgress / 1.5) + 1)} / 10
          </p>
        </div>
      )}

      {phase === 'result' && result && (
        <div style={s.resultPanel}>
          <div style={{
            ...s.resultBadge,
            background: result.correct ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)',
            borderColor: result.correct ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)',
          }}>
            {result.correct ? <TrophyIcon size={28} color="#34d399" /> : <ExplosionIcon size={28} color="#f87171" />}
            <div>
              <div style={{
                fontSize: '20px',
                fontWeight: 800,
                color: result.correct ? '#34d399' : '#f87171',
                fontFamily: "'Orbitron', sans-serif",
              }}>
                {result.correct ? 'CORRECT!' : 'WRONG'}
              </div>
              <div style={{ fontSize: '13px', color: theme.text.muted }}>
                Price went <span style={{
                  color: result.outcome === 'long' ? '#34d399' : result.outcome === 'short' ? '#f87171' : '#fbbf24',
                  fontWeight: 700,
                }}>
                  {result.outcome === 'long' ? 'UP' : result.outcome === 'short' ? 'DOWN' : 'SIDEWAYS'}
                </span>
                {' '}({result.priceChangePercent >= 0 ? '+' : ''}{result.priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            {result.correct && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: '22px', fontWeight: 800, color: '#34d399' }}>
                  {result.multiplier}x
                </div>
                <div className="mono" style={{ fontSize: '13px', color: theme.text.muted }}>
                  +{formatSol(result.payout - result.betAmount)} SOL
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={s.statsRow}>
            <div style={s.statItem}>
              <span style={s.statLabel}>Predicted</span>
              <span style={{
                ...s.statValue,
                color: prediction === 'long' ? '#34d399' : prediction === 'short' ? '#f87171' : '#fbbf24',
              }}>
                {prediction === 'long' ? 'LONG' : prediction === 'short' ? 'SHORT' : 'RANGE'}
              </span>
            </div>
            <div style={s.statItem}>
              <span style={s.statLabel}>Entry</span>
              <span className="mono" style={s.statValue}>${result.entryPrice.toFixed(2)}</span>
            </div>
            <div style={s.statItem}>
              <span style={s.statLabel}>Exit</span>
              <span className="mono" style={s.statValue}>${result.exitPrice.toFixed(2)}</span>
            </div>
            <div style={s.statItem}>
              <span style={s.statLabel}>Change</span>
              <span className="mono" style={{
                ...s.statValue,
                color: result.priceChangePercent >= 0 ? '#34d399' : '#f87171',
              }}>
                {result.priceChangePercent >= 0 ? '+' : ''}{result.priceChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={s.actionRow}>
            <button onClick={handlePlayAgain} className="btn-3d btn-3d-primary" style={s.playAgainBtn}>
              Predict Again
            </button>
            <button onClick={() => go('lobby')} style={s.backBtn}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '20px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    margin: 0,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  },
  betBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    background: 'rgba(153, 69, 255, 0.1)',
    border: `1px solid ${theme.border.subtle}`,
  },
  chartWrap: {
    flexShrink: 0,
  },

  // Bet selector
  betSection: {
    width: '100%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  betSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  betSectionLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.muted,
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: '1px',
  },
  betPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  betPill: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: theme.text.secondary,
    background: 'rgba(153, 69, 255, 0.06)',
    border: '1px solid rgba(153, 69, 255, 0.12)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  betPillActive: {
    background: 'rgba(153, 69, 255, 0.2)',
    borderColor: 'rgba(153, 69, 255, 0.5)',
    color: '#c084fc',
    boxShadow: '0 0 10px rgba(153, 69, 255, 0.2)',
  },
  customBetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  customBetLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    flexShrink: 0,
  },
  customBetInputWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: theme.bg.tertiary,
    borderRadius: '6px',
    padding: '0 8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  customBetInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    padding: '7px 0',
    width: '60px',
    minWidth: 0,
  },
  customBetBtn: {
    padding: '5px 10px',
    background: 'rgba(153, 69, 255, 0.12)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '5px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '13px',
    fontWeight: 700,
    color: '#c084fc',
    transition: 'all 0.12s ease',
  },

  // Setup
  setupPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  instruction: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.secondary,
    fontFamily: "'Rajdhani', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  dirRow: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    maxWidth: '500px',
  },
  dirBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '18px 8px',
    fontFamily: "'Rajdhani', sans-serif",
    border: 'none',
    background: 'transparent',
  },
  dirEmoji: {
    fontSize: '24px',
  },
  dirLabel: {
    fontSize: '16px',
    fontWeight: 800,
    color: theme.text.primary,
    letterSpacing: '1px',
  },
  dirPayout: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.muted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  hint: {
    margin: 0,
    fontSize: '12px',
    color: theme.text.muted,
  },

  // Countdown
  countdownOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '12px',
    zIndex: 10,
  },
  countdownNum: {
    fontSize: '72px',
    fontWeight: 900,
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
    textShadow: '0 0 30px rgba(153, 69, 255, 0.6)',
  },
  countdownLabel: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.secondary,
    marginTop: '8px',
  },

  // Reveal
  revealPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  revealBar: {
    width: '100%',
    maxWidth: '400px',
    height: '6px',
    background: theme.bg.secondary,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  revealFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #9945FF, #c084fc)',
    borderRadius: '3px',
    transition: 'width 0.3s',
  },
  revealText: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // Result
  resultPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  resultBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    borderRadius: '14px',
    border: '1px solid',
  },
  statsRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  statItem: {
    flex: 1,
    minWidth: '80px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '10px',
    borderRadius: '10px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
  },
  playAgainBtn: {
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: "'Rajdhani', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  backBtn: {
    padding: '12px 20px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    color: theme.text.secondary,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'Rajdhani', sans-serif",
  },
};
