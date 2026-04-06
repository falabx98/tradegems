import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { playBetPlaced, playRoundEnd, hapticMedium } from '../../utils/sounds';
import { toast } from '../../stores/toastStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BetPanel } from '../ui/BetPanel';
import { GameHeader } from '../game/GameHeader';
import { StatusBadge, type GamePhase } from '../game/StatusBadge';
import { RoundInfoFooter } from '../game/RoundInfoFooter';
import { HowToPlayInline } from '../game/HowToPlayInline';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { gameTrack } from '../../utils/analytics';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { EmptyState } from '../primitives/EmptyState';
import { ResultOverlay } from '../game/ResultOverlay';
import { CountUpNumber } from '../game/CountUpNumber';
import { WinConfetti } from '../game/WinConfetti';
import { SolIcon } from '../ui/SolIcon';

// ─── Types ───────────────────────────────────────────────────

interface Candle {
  open: number; high: number; low: number; close: number;
  volume: number; timestamp: number;
}

interface RoundBet {
  userId: string; username: string; avatarUrl: string | null;
  pick: 'bullish' | 'bearish'; betAmount: number; payout: number;
  status: 'pending' | 'won' | 'lost';
}

interface CandleflipState {
  roundId: string; roundNumber: number;
  status: 'waiting' | 'flipping' | 'resolved';
  seedHash: string; seed: string | null;
  result: 'bullish' | 'bearish' | null;
  resultMultiplier: number | null;
  candles: Candle[]; bets: RoundBet[];
  waitEndsAt: number | null;
  flipStartedAt: number | null; flipEndsAt: number | null;
  resolvedAt: number | null;
}

// ─── Candleflip atmosphere ──────────────────────────────────
const FLIP_ATMOSPHERE = 'radial-gradient(ellipse at 50% 50%, rgba(6,182,212,0.04) 0%, transparent 70%)';

// ─── Candlestick Chart ──────────────────────────────────────

function FlipCandleChart({ candles, status, result, resultMultiplier, flipStartedAt, isMobile }: {
  candles: Candle[]; status: string;
  result: 'bullish' | 'bearish' | null;
  resultMultiplier: number | null;
  flipStartedAt: number | null; isMobile: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (status !== 'flipping' || candles.length === 0 || !flipStartedAt) {
      if (status === 'resolved') setVisibleCount(candles.length);
      if (status === 'waiting') setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount(prev => {
        if (prev >= candles.length) { clearInterval(interval); return candles.length; }
        return prev + 1;
      });
    }, 380);
    return () => clearInterval(interval);
  }, [status, candles.length, flipStartedAt]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Transparent background — atmosphere handled by GameCanvas wrapper
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 30, bottom: 20, left: 10, right: isMobile ? 48 : 56 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    if (status === 'waiting' || candles.length === 0) {
      for (let i = 0; i < 5; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      }
      const midY = pad.top + chartH * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, midY); ctx.lineTo(w - pad.right, midY); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = theme.accent.purple;
      ctx.font = `700 ${isMobile ? 20 : 28}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(139,92,246,0.3)';
      ctx.shadowBlur = 12;
      ctx.fillText('NEXT FLIP', w / 2, h * 0.4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Bull or Bear — over or under 1.00x', w / 2, h * 0.4 + 24);
      return;
    }

    const shown = status === 'flipping' ? candles.slice(0, visibleCount) : candles;
    if (shown.length === 0) return;

    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) { pMin = Math.min(pMin, c.low); pMax = Math.max(pMax, c.high); }
    pMin -= 0.03; pMax += 0.03;
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    for (let i = 0; i <= 4; i++) {
      const val = pMin + (pRange / 4) * (4 - i);
      const y = toY(val);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 10 : 11}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 4, y + 3);
    }

    if (pMin < 1.0 && pMax > 1.0) {
      const refY = toY(1.0);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, refY); ctx.lineTo(w - pad.right, refY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `500 ${isMobile ? 10 : 11}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('1.00x', pad.left + 4, refY - 4);
    }

    const spacing = chartW / candles.length;
    const cw = Math.max(4, spacing * 0.6);
    for (let i = 0; i < shown.length; i++) {
      const c = shown[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#22c55e' : '#FF3333';
      const isNewest = status === 'flipping' && i === shown.length - 1;
      ctx.globalAlpha = isNewest ? 0.7 : 1.0;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - cw / 2, bTop, cw, Math.max(2, bBot - bTop));
      ctx.globalAlpha = 1.0;
    }

    // Flipping progress text on canvas
    if (status === 'flipping') {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${isMobile ? 13 : 15}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`Revealing... ${visibleCount}/${candles.length}`, w / 2, pad.top - 8);
    }

    // NO resolved overlay on canvas (handled by ResultOverlay component)
  }, [candles, status, result, resultMultiplier, visibleCount, isMobile]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1 }} />;
}

// ─── Main Screen ────────────────────────────────────────────

export function CandleflipScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const profile = useGameStore((s) => s.profile);

  const [round, setRound] = useState<CandleflipState | null>(null);
  const [pick, setPick] = useState<'bullish' | 'bearish'>('bullish');
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentRounds, setRecentRounds] = useState<any[]>([]);
  const [showResultOverlay, setShowResultOverlay] = useState(false);
  const fetchingRef = useRef(false);
  const prevStatusRef = useRef<string | null>(null);

  const fetchRound = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api.getCandleflipRound();
      if (!data) return;
      setRound(data.round || null);
    } catch {}
    finally { fetchingRef.current = false; }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const data = await api.getCandleflipRecentRounds(12);
      setRecentRounds(data?.rounds || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchRound();
    fetchRecent();
    const interval = setInterval(fetchRound, isMobile ? 1500 : 1000);
    const recentInterval = setInterval(fetchRecent, 15000);
    return () => { clearInterval(interval); clearInterval(recentInterval); };
  }, [fetchRound, fetchRecent]);

  // Show result overlay when round transitions to resolved
  useEffect(() => {
    if (round?.status === 'resolved' && prevStatusRef.current === 'flipping') {
      setTimeout(() => setShowResultOverlay(true), 300);
    }
    if (round?.status === 'waiting') {
      setShowResultOverlay(false);
    }
    prevStatusRef.current = round?.status || null;
  }, [round?.status]);

  const myBet = round?.bets.find(b => b.userId === userId) || null;
  const hasBet = !!myBet;

  const handleBet = async () => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading || !round || round.status !== 'waiting') return;
    setError('');
    setLoading(true);
    playBetPlaced();
    hapticMedium();
    gameTrack.start('candleflip', betAmount);

    // Optimistic UI
    if (round) {
      setRound({
        ...round,
        bets: [...round.bets, {
          userId: userId || '',
          username: profile.username || 'You',
          avatarUrl: profile.avatarUrl || null,
          pick,
          betAmount,
          payout: 0,
          status: 'pending' as const,
        }],
      });
    }

    try {
      const result = await api.betCandleflipRound(pick, betAmount);
      if (!result.success) {
        fetchRound();
        setError(result.message || 'Failed to bet');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err: any) {
      fetchRound();
      setError(err.message || 'Failed to bet');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const lastResolvedRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (round?.status === 'resolved' && myBet && round.roundId !== lastResolvedRoundRef.current) {
      lastResolvedRoundRef.current = round.roundId;
      syncProfile();
      playRoundEnd(myBet.status === 'won');
      // Settlement toast
      if (myBet.status === 'won' && myBet.payout > myBet.betAmount) {
        toast.success('You Won!', `+${((myBet.payout - myBet.betAmount) / 1e9).toFixed(4)} SOL added`);
      } else if (myBet.status === 'lost') {
        toast.info('Round Settled', `${(myBet.betAmount / 1e9).toFixed(4)} SOL lost`);
      }
    }
  }, [round?.status, round?.roundId]);

  const waitRemaining = round?.status === 'waiting' && round.waitEndsAt
    ? Math.max(0, Math.ceil((round.waitEndsAt - Date.now()) / 1000))
    : 0;

  const phase: GamePhase | undefined = !round ? undefined
    : round.status === 'waiting' ? 'waiting'
    : round.status === 'flipping' ? 'active'
    : 'result';

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  // Result data
  const isWin = myBet?.status === 'won';
  const profit = isWin ? (myBet?.payout || 0) - (myBet?.betAmount || 0) : -(myBet?.betAmount || 0);

  /* ─── HEADER ─── */
  const headerEl = (
    <GameHeader
      title="Candleflip"
      subtitle="Bull or Bear — over or under 1.00x"
      icon={
        <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="8" width="16" height="8" rx="2" /><path d="M12 4v4" /><path d="M12 16v4" />
          </svg>
        </div>
      }
      rightSlot={phase && <StatusBadge phase={phase} countdown={phase === 'waiting' ? waitRemaining : undefined} label={phase === 'active' ? 'FLIPPING' : phase === 'result' ? 'RESULT' : undefined} />}
      howToPlay={
        <HowToPlayInline steps={[
          { icon: '🎯', label: 'Pick Bull or Bear', desc: 'Bull = candle closes above 1.00x, Bear = below' },
          { icon: '💰', label: 'Set your bet amount', desc: 'Both sides pay 1.9x if correct' },
          { icon: '📊', label: 'Watch candles flip', desc: 'Candles reveal one by one until the result' },
          { icon: '✅', label: 'Win if your side was right', desc: 'Payout hits your balance instantly' },
        ]} />
      }
    />
  );

  /* ─── CONTROL RAIL ─── */
  const railContent = (
    <GameControlRail>
      {error && <div style={errorMsg}>{error}</div>}

      {/* Betting panel */}
      {round?.status === 'waiting' && !hasBet && (
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
          choices={[
            { id: 'bullish', label: 'BULL', color: theme.accent.neonGreen, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.accent.neonGreen} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>, payout: '1.9x' },
            { id: 'bearish', label: 'BEAR', color: theme.accent.red, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.accent.red} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>, payout: '1.9x' },
          ]}
          selectedChoice={pick}
          onChoiceSelect={(id) => setPick(id as 'bullish' | 'bearish')}
          submitLabel={`Confirm ${pick === 'bullish' ? 'Bull' : 'Bear'}`}
          onSubmit={handleBet}
          submitDisabled={!pick || betAmount <= 0}
          submitLoading={loading}
        />
      )}

      {/* Already bet, waiting */}
      {round?.status === 'waiting' && hasBet && (
        <Card variant="panel" style={{ textAlign: 'center', background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.12)' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.purple }}>
            Bet placed: {formatSol(myBet!.betAmount)} <SolIcon size="0.9em" /> on {myBet!.pick === 'bullish' ? 'Bull' : 'Bear'}
          </div>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
            Flipping in {waitRemaining}s...
          </div>
        </Card>
      )}

      {/* No round */}
      {!round && (
        <Card variant="panel">
          <EmptyState
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="8" width="16" height="8" rx="2" /><path d="M12 4v4" /><path d="M12 16v4" /></svg>}
            title="Waiting for next round..."
            subtitle="A new flip starts automatically every 30 seconds"
          />
        </Card>
      )}

      {/* Spectator: logged in but missed betting */}
      {round?.status === 'flipping' && !hasBet && isAuthenticated && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 600, color: theme.text.secondary }}>
            Flip in progress
          </div>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
            You can join the next flip when betting opens
          </div>
        </Card>
      )}

      {/* Spectator: not logged in */}
      {round?.status === 'flipping' && !hasBet && !isAuthenticated && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 600, color: theme.text.secondary, marginBottom: gap.sm }}>
            Sign in to play in the next round
          </div>
          <Button variant="primary" size="md" onClick={() => go('auth')}>Sign In</Button>
        </Card>
      )}

      {/* Post-round: resolved, next round coming */}
      {round?.status === 'resolved' && !hasBet && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted }}>
            Next flip starts automatically...
          </div>
        </Card>
      )}

      {/* Players strip */}
      {round && round.bets.length > 0 && (
        <div style={playersStrip}>
          {round.bets.map(bet => {
            const isMe = bet.userId === userId;
            return (
              <div key={bet.userId} style={{ ...playerChip, background: isMe ? 'rgba(139,92,246,0.06)' : theme.bg.secondary, borderColor: isMe ? 'rgba(139,92,246,0.20)' : theme.border.subtle }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: getAvatarGradient(bet.avatarUrl, bet.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#fff' }}>
                  {getInitials(bet.username)}
                </div>
                <span style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.primary }}>{bet.username}</span>
                <Badge variant={bet.pick === 'bullish' ? 'success' : 'danger'} size="sm">{bet.pick === 'bullish' ? 'BULL' : 'BEAR'}</Badge>
                <span className="mono" style={{ fontSize: ts('xs'), fontWeight: 700, color: theme.accent.purple }}>{formatSol(bet.betAmount)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent rounds */}
      {recentRounds.length > 0 && (
        <div>
          <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: gap.sm }}>Recent Flips</div>
          <div style={recentStrip}>
            {recentRounds.slice(0, 12).map((r: any) => {
              const isBull = r.result === 'bullish';
              const mult = parseFloat(r.resultMultiplier || '1');
              return (
                <Badge key={r.id} variant={isBull ? 'success' : 'danger'} size="md" style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 10 }}>{isBull ? '▲' : '▼'}</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{mult.toFixed(2)}x</span>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </GameControlRail>
  );

  /* ─── GAME STAGE ─── */
  const stageContent = (
    <GameStage atmosphere={FLIP_ATMOSPHERE}>
      {!isMobile && <div style={{ padding: `${gap.sm}px ${gap.md}px 0` }}>{headerEl}</div>}
      <div style={{ position: 'relative', flex: isMobile ? undefined : 1, height: isMobile ? 240 : undefined, minHeight: isMobile ? undefined : 200 }}>
        <FlipCandleChart
          candles={round?.candles || []}
          status={round?.status || 'waiting'}
          result={round?.result || null}
          resultMultiplier={round?.resultMultiplier || null}
          flipStartedAt={round?.flipStartedAt || null}
          isMobile={isMobile}
        />
      </div>
      <WinConfetti active={showResultOverlay && hasBet && isWin === true} zIndex={8} />
      <ResultOverlay visible={showResultOverlay && round?.status === 'resolved' && hasBet} variant={isWin ? 'win' : 'loss'} actionsDelay={isWin ? 1500 : 800}>
        {isWin ? (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.neonGreen, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>{round?.result === 'bullish' ? '▲ BULL WINS' : '▼ BEAR WINS'}</div>
            <CountUpNumber value={Number(round?.resultMultiplier || 0)} from={1} duration={1000} decimals={2} suffix="x" style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 24px rgba(0, 231, 1, 0.4)' }} />
            <CountUpNumber value={profit / 1e9} from={0} duration={1200} decimals={profit >= 1e9 ? 2 : 4} prefix="+" suffix={<> <SolIcon size="0.9em" /></>} style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>{round?.result === 'bullish' ? '▲ BULL WINS' : '▼ BEAR WINS'}</div>
            <div style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }}>{Number(round?.resultMultiplier || 0).toFixed(2)}x</div>
            <div style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs, opacity: 0.7 }}>-{formatSol(myBet?.betAmount || 0)} <SolIcon size="0.9em" /></div>
          </>
        )}
      </ResultOverlay>
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = round ? (
    <GameFooterBar>
      <RoundInfoFooter roundNumber={round.roundNumber} seedHash={round.seedHash} />
      <span style={{ fontSize: ts('xs'), color: theme.text.muted }}>{round.bets.length} player{round.bets.length !== 1 ? 's' : ''}</span>
    </GameFooterBar>
  ) : <GameFooterBar><span /></GameFooterBar>;

  return (
    <>
      {isMobile && <div style={{ padding: `${gap.sm}px 12px` }}>{headerEl}</div>}
      <CasinoGameLayout rail={railContent} stage={stageContent} footer={footerContent} />
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const errorMsg: CSSProperties = {
  padding: `${theme.gap.sm}px ${theme.gap.md}px`,
  background: 'rgba(255,51,51,0.06)',
  border: '1px solid rgba(255,51,51,0.12)',
  borderRadius: theme.radius.md,
  color: theme.accent.red,
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'center',
  animation: 'screenFadeIn 0.15s ease-out',
};

const playersStrip: CSSProperties = {
  display: 'flex',
  gap: theme.gap.sm,
  overflowX: 'auto',
  padding: '2px 0',
  scrollbarWidth: 'none' as any,
};

const playerChip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.gap.sm,
  padding: `${theme.gap.sm}px`,
  borderRadius: theme.radius.md,
  flexShrink: 0,
  border: '1px solid',
};

const recentStrip: CSSProperties = {
  display: 'flex',
  gap: theme.gap.sm,
  overflowX: 'auto',
  padding: '2px 0',
  scrollbarWidth: 'none' as any,
};
