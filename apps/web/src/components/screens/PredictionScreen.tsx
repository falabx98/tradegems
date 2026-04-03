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
import { WinCard } from '../ui/WinCard';
import { GameHeader } from '../game/GameHeader';
import { StatusBadge, type GamePhase } from '../game/StatusBadge';
import { RoundInfoFooter } from '../game/RoundInfoFooter';
import { HowToPlayInline } from '../game/HowToPlayInline';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { gameTrack } from '../../utils/analytics';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { ResultOverlay } from '../game/ResultOverlay';
import { CountUpNumber } from '../game/CountUpNumber';
import { WinConfetti } from '../game/WinConfetti';
import { SolIcon } from '../ui/SolIcon';

// ─── Predictions atmosphere ─────────────────────────────────
const PRED_ATMOSPHERE = 'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.04) 0%, transparent 70%)';

// ─── Direction descriptions ─────────────────────────────────

const DIRECTION_INFO: Record<PredictionDirection, { label: string; desc: string; color: string; icon: React.ReactNode }> = {
  long: { label: 'Up', desc: 'Price closes higher', color: theme.accent.neonGreen, icon: <ArrowUpIcon size={24} color={theme.accent.neonGreen} /> },
  range: { label: 'Range', desc: 'Price stays within range', color: theme.accent.green, icon: <ArrowSidewaysIcon size={24} color={theme.accent.green} /> },
  short: { label: 'Down', desc: 'Price closes lower', color: theme.accent.red, icon: <ArrowDownIcon size={24} color={theme.accent.red} /> },
};

// ─── Main Component ─────────────────────────────────────────

export function PredictionScreen() {
  const { betAmount, setBetAmount, profile, syncProfile } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const go = useAppNavigate();

  const [phase, setPhase] = useState<PredictionPhase>('setup');
  const [roundConfig, setRoundConfig] = useState<PredictionRoundConfig | null>(null);
  const [selectedDir, setSelectedDir] = useState<PredictionDirection | null>(null);
  const [prediction, setPrediction] = useState<PredictionDirection | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [showWinCard, setShowWinCard] = useState(false);
  const [revealProgress, setRevealProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [lockRef, setLockRef] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [feeRate, setFeeRate] = useState(0.03);

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
        if (next <= 0) { clearInterval(id); setPhase('revealing'); }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Reveal animation
  useEffect(() => {
    if (phase !== 'revealing' || !roundConfig) return;
    const start = performance.now();
    const TOTAL_DURATION = 10 * 1500;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      setRevealProgress(elapsed);
      if (elapsed * 1000 >= TOTAL_DURATION) { resolveRound(); return; }
      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, roundConfig]);

  const DIR_MAP: Record<PredictionDirection, 'up' | 'down' | 'sideways'> = {
    long: 'up', short: 'down', range: 'sideways',
  };

  async function handleConfirmPrediction() {
    if (!roundConfig || !selectedDir || locking) return;

    if (isAuthenticated && betAmount > profile.balance) {
      toast.error('Insufficient Balance', "You don't have enough SOL for this bet");
      return;
    }

    if (isAuthenticated) {
      setLocking(true);
      let lockSuccess = false;
      try {
        const lockResult = await api.lockPrediction(betAmount, DIR_MAP[selectedDir]);
        setLockRef(lockResult.lockRef);
        const fee = Math.floor(betAmount * feeRate);
        const totalCost = betAmount + fee;
        useGameStore.setState((s) => ({
          profile: { ...s.profile, balance: Math.max(0, s.profile.balance - totalCost) },
        }));

        if (lockResult.chartDirection && roundConfig) {
          const REVERSE_DIR_MAP: Record<string, PredictionDirection> = { up: 'long', down: 'short', sideways: 'range' };
          const targetOutcome = REVERSE_DIR_MAP[lockResult.chartDirection] || 'long';
          if (roundConfig.outcome !== targetOutcome) {
            setRoundConfig(regenerateWithOutcome(roundConfig, targetOutcome));
          }
        }
        lockSuccess = true;
      } catch (err: any) {
        toast.error('Bet Failed', err?.message || 'Could not lock funds for prediction');
        syncProfile();
      } finally {
        setLocking(false);
      }
      if (!lockSuccess) return;
    }

    setPrediction(selectedDir);
    playBetPlaced();
    hapticMedium();
    gameTrack.start('predictions', betAmount);
    setPhase('countdown');
  }

  function resolveRound() {
    if (!roundConfig || !prediction) return;

    if (isAuthenticated && lockRef) {
      (async () => {
        try {
          const saveResponse = await api.savePredictionRound({
            lockRef,
            direction: DIR_MAP[prediction],
            result: 'loss',
          });
          const isWin = saveResponse.result === 'win';
          const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
          setResult(predResult);
          setPhase('result');
          if (isWin) { playLevelUp(); hapticHeavy(); }
          else { playRoundEnd(false); }
          // Settlement toast
          if (isWin && saveResponse.payout > betAmount) {
            toast.success('Prediction Correct!', `+${((saveResponse.payout - betAmount) / 1e9).toFixed(4)} SOL added`);
          } else if (!isWin) {
            toast.info('Wrong Prediction', `${(betAmount / 1e9).toFixed(4)} SOL lost`);
          }
          if (saveResponse.payout > 0) {
            useGameStore.setState((s) => ({
              profile: { ...s.profile, balance: s.profile.balance + saveResponse.payout },
            }));
          }
        } catch (err: any) {
          console.warn('Failed to save prediction round:', err);
          toast.error('Save Failed', err?.message || 'Prediction could not be saved to server');
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
      const predResult = calculatePredictionResult(prediction, roundConfig, betAmount);
      setResult(predResult);
      setPhase('result');
      if (predResult.correct) { playLevelUp(); hapticHeavy(); }
      else { playRoundEnd(false); }
    }
  }

  function handlePlayAgain() {
    setPhase('setup');
    setPrediction(null);
    setSelectedDir(null);
    setResult(null);
    setRevealProgress(0);
    setCountdown(3);
    setLockRef(null);
    setRoundConfig(generatePredictionRound());
  }

  if (!roundConfig) return null;

  const fee = Math.floor(betAmount * feeRate);
  const totalCost = betAmount + fee;

  // Phase mapping for StatusBadge
  const badgePhase: GamePhase | null =
    phase === 'setup' ? 'waiting' :
    phase === 'countdown' || phase === 'revealing' ? 'active' :
    phase === 'result' ? 'result' : null;

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  /* ─── HEADER ─── */
  const headerEl = (
    <GameHeader
      title="Predictions"
      subtitle="Predict the price direction"
      icon={
        <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
      }
      rightSlot={badgePhase && <StatusBadge phase={badgePhase} label={
        phase === 'setup' ? undefined :
        phase === 'countdown' ? `${countdown}s` :
        phase === 'revealing' ? `${Math.min(10, Math.floor(revealProgress / 1.5) + 1)}/10` :
        'RESULT'
      } />}
      howToPlay={
        <HowToPlayInline steps={[
          { icon: '💰', label: 'Set your bet amount', desc: 'Choose how much SOL to wager' },
          { icon: '📊', label: 'Pick a direction', desc: 'Up, Down, or Range (price stays flat)' },
          { icon: '⏳', label: 'Watch 10 candles reveal', desc: 'The chart animates the real price movement' },
          { icon: '✅', label: 'Win if your prediction was correct', desc: 'Up/Down pay 1.9x, Range pays 3.0x' },
        ]} />
      }
    />
  );

  /* ─── CONTROL RAIL ─── */
  const railContent = (
    <GameControlRail>
      {/* Setup: Direction + Bet */}
      {phase === 'setup' && (
        <>
          <Card variant="panel">
            <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: gap.sm }}>
              Select Direction
            </div>
            <div style={{ display: 'flex', gap: gap.sm }}>
              {(['long', 'range', 'short'] as PredictionDirection[]).map((dir) => {
                const info = DIRECTION_INFO[dir];
                const isActive = selectedDir === dir;
                return (
                  <button key={dir} onClick={() => setSelectedDir(dir)} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: gap.sm,
                    padding: `${gap.md}px ${gap.sm}px`, borderRadius: theme.radius.md,
                    border: `1.5px solid ${isActive ? info.color : theme.border.medium}`,
                    background: isActive ? `${info.color}0F` : theme.bg.card,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease', minHeight: 44,
                  }}>
                    {info.icon}
                    <span style={{ fontSize: ts('md'), fontWeight: 700, color: isActive ? info.color : theme.text.primary, letterSpacing: '0.5px' }}>{info.label}</span>
                    <span style={{ fontSize: ts('xs'), color: theme.text.muted, lineHeight: 1.3, textAlign: 'center' }}>{info.desc}</span>
                    <Badge variant={dir === 'range' ? 'success' : 'default'} size="sm">{dir === 'range' ? '3.0x' : '1.9x'}</Badge>
                  </button>
                );
              })}
            </div>
          </Card>
          <BetPanel
            presets={[
              { label: '0.1', lamports: 100_000_000 },
              { label: '0.5', lamports: 500_000_000 },
              { label: '1', lamports: 1_000_000_000 },
              { label: '5', lamports: 5_000_000_000 },
              { label: '10', lamports: 10_000_000_000 },
              { label: '50', lamports: 50_000_000_000 },
              { label: '100', lamports: 100_000_000_000 },
            ]}
            selectedAmount={betAmount}
            onAmountChange={setBetAmount}
            balance={profile.balance}
            feeRate={feeRate}
            submitLabel={selectedDir ? `Confirm ${DIRECTION_INFO[selectedDir].label}` : 'Select a Direction'}
            onSubmit={handleConfirmPrediction}
            submitDisabled={!selectedDir || betAmount <= 0 || totalCost > profile.balance}
            submitLoading={locking}
          />
          <RecentGames
            title="Recent Predictions"
            fetchGames={async () => {
              const res = await api.getRecentPredictions(10);
              return (res.data || []).map((r: any) => ({
                id: r.id,
                result: r.result === 'win' ? 'win' as const : 'loss' as const,
                multiplier: parseFloat(r.multiplier) || 0,
                amount: r.betAmount || 0,
                payout: r.payout || 0,
                time: r.createdAt,
              }));
            }}
          />
        </>
      )}

      {/* Reveal progress */}
      {phase === 'revealing' && (
        <Card variant="panel" padding={`${gap.md}px ${gap.lg}px`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: gap.md }}>
            <div style={revealBar}>
              <div style={{ ...revealFill, width: `${Math.min(100, (revealProgress / 15) * 100)}%` }} />
            </div>
            <span className="mono" style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.text.muted, flexShrink: 0 }}>
              {Math.min(10, Math.floor(revealProgress / 1.5) + 1)}/10
            </span>
          </div>
        </Card>
      )}

      {/* Result: stats + actions */}
      {phase === 'result' && result && (
        <>
          <div style={{ display: 'flex', gap: gap.sm, flexWrap: 'wrap' }}>
            <Card variant="stat" style={{ flex: '1 1 70px' }}>
              <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Predicted</div>
              <div style={{ fontSize: ts('md'), fontWeight: 700, color: prediction ? DIRECTION_INFO[prediction].color : theme.text.primary, marginTop: 2 }}>{prediction ? DIRECTION_INFO[prediction].label : '—'}</div>
            </Card>
            <Card variant="stat" style={{ flex: '1 1 70px' }}>
              <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Entry</div>
              <div className="mono" style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary, marginTop: 2 }}>${result.entryPrice.toFixed(2)}</div>
            </Card>
            <Card variant="stat" style={{ flex: '1 1 70px' }}>
              <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Exit</div>
              <div className="mono" style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary, marginTop: 2 }}>${result.exitPrice.toFixed(2)}</div>
            </Card>
            <Card variant="stat" style={{ flex: '1 1 70px' }}>
              <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Change</div>
              <div className="mono" style={{ fontSize: ts('md'), fontWeight: 700, color: result.priceChangePercent >= 0 ? theme.accent.neonGreen : theme.accent.red, marginTop: 2 }}>
                {result.priceChangePercent >= 0 ? '+' : ''}{result.priceChangePercent.toFixed(2)}%
              </div>
            </Card>
          </div>
          <div style={{ display: 'flex', gap: gap.sm }}>
            <Button variant="primary" size="lg" fullWidth onClick={handlePlayAgain}>Predict Again</Button>
            <Button variant="ghost" size="lg" onClick={() => go('lobby')} style={{ flexShrink: 0 }}>Lobby</Button>
          </div>
          {result.correct && (
            <Button variant="ghost-accent" size="sm" fullWidth onClick={() => setShowWinCard(true)}>Share Win</Button>
          )}
        </>
      )}
    </GameControlRail>
  );

  /* ─── GAME STAGE ─── */
  const stageContent = (
    <GameStage atmosphere={PRED_ATMOSPHERE} style={{ position: 'relative' }}>
      {!isMobile && <div style={{ padding: `${gap.sm}px ${gap.md}px 0` }}>{headerEl}</div>}
      <div style={{ position: 'relative', flex: isMobile ? undefined : 1, height: isMobile ? 240 : undefined, minHeight: isMobile ? undefined : 200 }}>
        <CandlestickChart
          historicalCandles={roundConfig.historicalCandles}
          revealCandles={roundConfig.revealCandles}
          revealProgress={revealProgress}
          entryPrice={roundConfig.entryPrice}
          phase={phase}
          prediction={prediction}
          isMobile={isMobile}
        />
      </div>
      {phase === 'countdown' && (
        <div style={countdownOverlay}>
          <span className="mono" style={countdownNum}>{countdown}</span>
          <span style={countdownLabel}>
            {prediction && DIRECTION_INFO[prediction] && (
              <span style={{ display: 'flex', alignItems: 'center', gap: gap.sm, color: DIRECTION_INFO[prediction].color }}>
                {DIRECTION_INFO[prediction].icon}
                {DIRECTION_INFO[prediction].label.toUpperCase()}
              </span>
            )}
          </span>
        </div>
      )}
      <WinConfetti active={phase === 'result' && !!result?.correct} zIndex={8} />
      <ResultOverlay visible={phase === 'result' && !!result} variant={result?.correct ? 'win' : 'loss'} actionsDelay={result?.correct ? 1500 : 800}>
        {result?.correct ? (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.neonGreen, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>CORRECT — {DIRECTION_INFO[result.outcome]?.label.toUpperCase()}</div>
            <CountUpNumber value={result.multiplier} from={1} duration={1000} decimals={1} suffix="x" style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 24px rgba(0, 231, 1, 0.4)' }} />
            <CountUpNumber value={(result.payout - result.betAmount) / 1e9} from={0} duration={1200} decimals={(result.payout - result.betAmount) >= 1e9 ? 2 : 4} prefix="+" suffix={<> <SolIcon size="0.9em" /></>} style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs }} />
          </>
        ) : result ? (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>WRONG — Price went {DIRECTION_INFO[result.outcome]?.label}</div>
            <div style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }}>0x</div>
            <div style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs, opacity: 0.7 }}>-{formatSol(result.betAmount)} <SolIcon size="0.9em" /></div>
          </>
        ) : null}
      </ResultOverlay>
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = (
    <GameFooterBar>
      <RoundInfoFooter seedHash={roundConfig.seed || undefined} />
    </GameFooterBar>
  );

  return (
    <>
      {isMobile && <div style={{ padding: `${gap.sm}px 12px` }}>{headerEl}</div>}
      <CasinoGameLayout rail={railContent} stage={stageContent} footer={footerContent} />
      {showWinCard && result && result.correct && (
        <WinCard
          gameType="prediction"
          multiplier={result.multiplier}
          betAmount={result.betAmount}
          payout={result.payout}
          profit={result.payout - result.betAmount}
          timestamp={new Date()}
          username={profile?.username || 'Player'}
          level={profile?.level || 1}
          vipTier={profile?.vipTier || 'bronze'}
          direction={result.outcome}
          entryPrice={result.entryPrice}
          exitPrice={result.exitPrice}
          priceChangePercent={result.priceChangePercent}
          onClose={() => setShowWinCard(false)}
        />
      )}
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const countdownOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(10, 10, 10, 0.45)',
  zIndex: 10,
};

const countdownNum: CSSProperties = {
  fontSize: 56,
  fontWeight: 900,
  color: '#fff',
  textShadow: '0 0 24px rgba(139, 92, 246, 0.6), 0 0 60px rgba(139, 92, 246, 0.2)',
  lineHeight: 1,
};

const countdownLabel: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: theme.text.secondary,
  marginTop: theme.gap.sm,
};

const revealBar: CSSProperties = {
  flex: 1,
  height: 4,
  background: theme.bg.primary,
  borderRadius: 2,
  overflow: 'hidden',
};

const revealFill: CSSProperties = {
  height: '100%',
  background: theme.accent.purple,
  borderRadius: 2,
  transition: 'width 0.3s',
};
