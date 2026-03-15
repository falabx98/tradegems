import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { api, getServerConfig } from '../../utils/api';
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
import { toast } from '../../stores/toastStore';
import { BetPanel } from '../ui/BetPanel';
import { RecentGames } from '../ui/RecentGames';

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

    const colors = ['#2ecc71', '#8b5cf6', '#a78bfa', '#3b82f6', '#5b8def', '#f472b6'];
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
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
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
    return () => { cancelled = true; };
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
  const [lockRef, setLockRef] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [feeRate, setFeeRate] = useState(0.03);

  // Generate round & fetch config on mount
  useEffect(() => {
    setRoundConfig(generatePredictionRound());
    getServerConfig().then(cfg => setFeeRate(cfg.feeRate));
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

  // Map frontend direction names to backend enum
  const DIR_MAP: Record<PredictionDirection, 'up' | 'down' | 'sideways'> = {
    long: 'up',
    short: 'down',
    range: 'sideways',
  };

  async function handlePrediction(dir: PredictionDirection) {
    if (!roundConfig || locking) return;
    // Balance pre-check: prevent betting more than available
    if (isAuthenticated && betAmount > profile.balance) {
      toast.error('Insufficient Balance', 'You don\'t have enough SOL for this bet');
      return;
    }

    // Pre-lock funds on server before starting the game (server determines outcome)
    if (isAuthenticated) {
      setLocking(true);
      try {
        const lockResult = await api.lockPrediction(betAmount, DIR_MAP[dir]);
        setLockRef(lockResult.lockRef);
        // Deduct from local balance immediately for UI feedback
        const fee = Math.floor(betAmount * feeRate);
        const totalCost = betAmount + fee;
        useGameStore.setState((s) => ({
          profile: { ...s.profile, balance: Math.max(0, s.profile.balance - totalCost) },
        }));

        // Server returns chartDirection (the direction the chart should animate).
        // Map backend directions to frontend: 'up' → 'long', 'down' → 'short', 'sideways' → 'range'
        if (lockResult.chartDirection && roundConfig) {
          const REVERSE_DIR_MAP: Record<string, PredictionDirection> = {
            up: 'long',
            down: 'short',
            sideways: 'range',
          };
          const targetOutcome = REVERSE_DIR_MAP[lockResult.chartDirection] || 'long';
          if (roundConfig.outcome !== targetOutcome) {
            setRoundConfig(regenerateWithOutcome(roundConfig, targetOutcome));
          }
        }
      } catch (err: any) {
        setLocking(false);
        toast.error('Bet Failed', err?.message || 'Could not lock funds for prediction');
        // Sync real balance in case it's stale
        syncProfile();
        return;
      }
      setLocking(false);
    }

    setPrediction(dir);
    playBetPlaced();
    hapticMedium();

    setPhase('countdown');
  }

  function resolveRound() {
    if (!roundConfig || !prediction) return;

    if (isAuthenticated && lockRef) {
      // ── Server-authoritative flow: ask server for result, then show it ──
      (async () => {
        try {
          const saveResponse = await api.savePredictionRound({
            lockRef,
            direction: DIR_MAP[prediction],
            result: 'loss', // placeholder — server ignores this
          });

          const isWin = saveResponse.result === 'win';

          // Chart was already generated to match the outcome before animation started
          const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
          setResult(predResult);
          setPhase('result');

          if (isWin) {
            playLevelUp();
            hapticHeavy();
          } else {
            playRoundEnd(false);
          }

          // Update local balance with server-confirmed payout
          if (saveResponse.payout > 0) {
            useGameStore.setState((s) => ({
              profile: { ...s.profile, balance: s.profile.balance + saveResponse.payout },
            }));
          }
        } catch (err: any) {
          console.warn('Failed to save prediction round:', err);
          toast.error('Save Failed', err?.message || 'Prediction could not be saved to server');
          // Fallback: show client-calculated result
          const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
          setResult(predResult);
          setPhase('result');
          playRoundEnd(false);
        } finally {
          await syncProfile();
          setLockRef(null);
        }
      })();
    } else {
      // ── Guest/unauthenticated: use client-side chart outcome ──
      const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
      setResult(predResult);
      setPhase('result');

      if (predResult.correct) {
        playLevelUp();
        hapticHeavy();
      } else {
        playRoundEnd(false);
      }
    }
  }

  function handlePlayAgain() {
    setPhase('setup');
    setPrediction(null);
    setResult(null);
    setRevealProgress(0);
    setCountdown(3);
    setLockRef(null);
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
          <span className="mono" style={{ fontWeight: 700, color: theme.accent.purple }}>
            {formatSol(betAmount)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ ...s.chartWrap, height: isMobile ? 280 : 400, position: 'relative' }}>
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
              {prediction === 'long' && <><ArrowUpIcon size={24} color="#2ecc71" /> LONG</>}
              {prediction === 'short' && <><ArrowDownIcon size={24} color="#f87171" /> SHORT</>}
              {prediction === 'range' && <><ArrowSidewaysIcon size={24} color="#00dc82" /> RANGE</>}
            </span>
          </div>
        )}

        {/* Confetti on win */}
        <ConfettiCanvas active={phase === 'result' && !!result?.correct} />
      </div>

      {/* Controls / Result */}
      {phase === 'setup' && (
        <div style={s.setupPanel}>
          <BetPanel
            presets={[
              { label: '0.01', lamports: 10_000_000 },
              { label: '0.05', lamports: 50_000_000 },
              { label: '0.1', lamports: 100_000_000 },
              { label: '0.25', lamports: 250_000_000 },
              { label: '0.5', lamports: 500_000_000 },
              { label: '1', lamports: 1_000_000_000 },
              { label: '2', lamports: 2_000_000_000 },
              { label: '5', lamports: 5_000_000_000 },
            ]}
            selectedAmount={betAmount}
            onAmountChange={setBetAmount}
            balance={profile.balance}
            feeRate={feeRate}
            choices={[
              { id: 'long', label: 'LONG', color: '#2ecc71', icon: <ArrowUpIcon size={28} color="#2ecc71" />, payout: '1.9x' },
              { id: 'range', label: 'RANGE', color: '#00dc82', icon: <ArrowSidewaysIcon size={28} color="#00dc82" />, payout: '3.0x' },
              { id: 'short', label: 'SHORT', color: '#f87171', icon: <ArrowDownIcon size={28} color="#f87171" />, payout: '1.9x' },
            ]}
            selectedChoice={null}
            onChoiceSelect={(id) => handlePrediction(id as PredictionDirection)}
            submitLabel="SELECT A DIRECTION"
            onSubmit={() => {}}
            submitDisabled={true}
            submitLoading={locking}
            compact
          />
        </div>
      )}

      <RecentGames
        title="Recent Predictions"
        fetchGames={async () => {
          const res = await api.getRecentPredictions(10);
          return (res.data || []).map((r: any) => ({
            id: r.id,
            result: r.result === 'win' ? 'win' : 'loss',
            multiplier: parseFloat(r.multiplier) || 0,
            amount: r.betAmount || 0,
            payout: r.payout || 0,
            time: r.createdAt,
          }));
        }}
      />

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
            background: result.correct ? 'rgba(46, 204, 113, 0.12)' : 'rgba(248, 113, 113, 0.12)',
            borderColor: result.correct ? 'rgba(46, 204, 113, 0.3)' : 'rgba(248, 113, 113, 0.3)',
          }}>
            {result.correct ? <TrophyIcon size={32} color="#2ecc71" /> : <ExplosionIcon size={32} color="#f87171" />}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '22px',
                fontWeight: 800,
                color: result.correct ? '#2ecc71' : '#f87171',
                fontFamily: "inherit",
              }}>
                {result.correct ? 'CORRECT!' : 'WRONG'}
              </div>
              <div style={{ fontSize: '14px', color: theme.text.secondary }}>
                Price went <span style={{
                  color: result.outcome === 'long' ? '#2ecc71' : result.outcome === 'short' ? '#f87171' : '#00dc82',
                  fontWeight: 700,
                }}>
                  {result.outcome === 'long' ? 'UP' : result.outcome === 'short' ? 'DOWN' : 'SIDEWAYS'}
                </span>
                {' '}({result.priceChangePercent >= 0 ? '+' : ''}{result.priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: '24px', fontWeight: 800, color: result.correct ? '#2ecc71' : '#f87171' }}>
                {result.correct ? result.multiplier + 'x' : '0x'}
              </div>
              <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', fontSize: '16px', fontWeight: 700, color: result.correct ? '#2ecc71' : '#f87171' }}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px' }} />
                {result.correct ? '+' : '-'}{formatSol(result.correct ? result.payout - result.betAmount : result.betAmount)} SOL
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={s.statsRow}>
            <div style={s.statItem}>
              <span style={s.statLabel}>Predicted</span>
              <span style={{
                ...s.statValue,
                color: prediction === 'long' ? '#2ecc71' : prediction === 'short' ? '#f87171' : '#00dc82',
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
                color: result.priceChangePercent >= 0 ? '#2ecc71' : '#f87171',
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
    padding: '16px 24px',
    width: '100%',
    minHeight: '100%',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '24px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "inherit",
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
    background: 'rgba(139, 92, 246, 0.1)',
    border: `1px solid ${theme.border.subtle}`,
  },
  chartWrap: {
    flexShrink: 0,
    overflow: 'hidden',
  },

  // Setup
  setupPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
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
    fontFamily: "inherit",
    textShadow: '0 0 30px rgba(139, 92, 246, 0.6)',
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
    flexShrink: 0,
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
    background: '#8b5cf6',
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
    gap: '10px',
    flexShrink: 0,
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
    fontFamily: "inherit",
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
    fontFamily: "inherit",
  },
};
