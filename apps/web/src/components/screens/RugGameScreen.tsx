import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { playBetPlaced, playRoundEnd, hapticMedium } from '../../utils/sounds';
import { SolIcon } from '../ui/SolIcon';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BetPanel } from '../ui/BetPanel';
import { WinCard } from '../ui/WinCard';
import { GameHeader } from '../game/GameHeader';
import { StatusBadge } from '../game/StatusBadge';
import { RoundInfoFooter } from '../game/RoundInfoFooter';
import { HowToPlayInline } from '../game/HowToPlayInline';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { EmptyState } from '../primitives/EmptyState';
import { ResultOverlay } from '../game/ResultOverlay';
import { CountUpNumber } from '../game/CountUpNumber';
import { WinConfetti } from '../game/WinConfetti';
import { MultiplierPulse } from '../game/MultiplierPulse';
import { gameTrack } from '../../utils/analytics';
import { toast } from '../../stores/toastStore';

// ─── Types ───────────────────────────────────────────────────

interface Candle {
  open: number; high: number; low: number; close: number;
  volume: number; timestamp: number;
}

interface RoundBet {
  userId: string; username: string; avatarUrl: string | null;
  betAmount: number; cashOutMultiplier: number | null;
  status: 'active' | 'cashed_out' | 'rugged';
}

interface RoundState {
  roundId: string; roundNumber: number;
  status: 'waiting' | 'active' | 'resolved';
  seedHash: string; seed: string | null;
  rugMultiplier: number | null; currentMultiplier: number;
  candles: Candle[]; bets: RoundBet[];
  waitEndsAt: number | null; activeStartedAt: number | null;
  resolvedAt: number | null;
}

// ─── Amber atmosphere for Rug Game identity ─────────────────
const RUG_ATMOSPHERE = 'radial-gradient(ellipse at 50% 60%, rgba(245,158,11,0.04) 0%, transparent 70%)';

// ─── Candlestick Chart ──────────────────────────────────────

function RugCandleChart({ candles, currentMultiplier, status, rugMultiplier, isMobile }: {
  candles: Candle[]; currentMultiplier: number; status: string;
  rugMultiplier: number | null; isMobile: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Background — transparent (atmosphere handled by GameCanvas)
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 30, bottom: 20, left: 10, right: isMobile ? 48 : 56 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    if (status === 'waiting' || candles.length === 0) {
      // Grid
      for (let i = 0; i < 5; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }

      // 1.0x ref line
      const midY = pad.top + chartH * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, midY);
      ctx.lineTo(w - pad.right, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waiting text
      ctx.fillStyle = '#8b5cf6';
      ctx.font = `700 ${isMobile ? 20 : 28}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(139,92,246,0.3)';
      ctx.shadowBlur = 12;
      ctx.fillText('BETTING OPEN', w / 2, h * 0.38);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Place your bets before launch', w / 2, h * 0.38 + 26);
      return;
    }

    // Price range
    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) {
      pMin = Math.min(pMin, c.low);
      pMax = Math.max(pMax, c.high);
    }
    const rawRange = pMax - pMin;
    const mid = (pMax + pMin) / 2;
    const minRange = Math.max(0.3, mid * 0.15);
    if (rawRange < minRange) {
      const expand = (minRange - rawRange) / 2;
      pMax += expand;
      pMin = Math.max(0.5, pMin - expand);
    }
    pMin = Math.max(0.5, pMin - rawRange * 0.08);
    pMax += rawRange * 0.08;
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // Grid + labels
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = pMin + (pRange / gridSteps) * (gridSteps - i);
      const y = toY(val);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 10 : 11}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 4, y + 3);
    }

    // 1.0x ref
    if (pMin < 1.0 && pMax > 1.0) {
      const refY = toY(1.0);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, refY);
      ctx.lineTo(w - pad.right, refY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Candles
    const maxVisible = isMobile ? 40 : 60;
    const visibleCandles = candles.length > maxVisible ? candles.slice(candles.length - maxVisible) : candles;
    const spacing = chartW / Math.max(visibleCandles.length, 10);
    const candleW = Math.max(3, spacing * 0.55);

    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.close >= c.open;
      const isCrash = status === 'resolved' && i >= visibleCandles.length - 3 && rugMultiplier !== null;
      const color = isCrash ? '#FF3333' : isGreen ? '#22c55e' : '#FF3333';

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(2, bBot - bTop));
    }

    // NO multiplier overlay on canvas during active phase (hero is external now)
    // NO resolved overlay on canvas (handled by ResultOverlay component)
  }, [candles, currentMultiplier, status, rugMultiplier, isMobile]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1 }}
    />
  );
}

// ─── Main Screen ────────────────────────────────────────────

export function RugGameScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const profile = useGameStore((s) => s.profile);

  const [round, setRound] = useState<RoundState | null>(null);
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentRounds, setRecentRounds] = useState<any[]>([]);
  const [cashOutDone, setCashOutDone] = useState<{ multiplier: number; payout: number } | null>(null);
  const [showWinCard, setShowWinCard] = useState(false);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const cashedRoundRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const lastSyncedRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const fetchRound = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api.getRugGameRound();
      if (!data) return;
      const r = data.round || null;
      setRound(r);
      if (cashedRoundRef.current && r?.roundId !== cashedRoundRef.current) {
        cashedRoundRef.current = null;
        setCashOutDone(null);
      }
      if (r?.status === 'resolved' && r.roundId !== lastSyncedRef.current) {
        lastSyncedRef.current = r.roundId;
        syncProfile();
      }
    } catch {}
    finally { fetchingRef.current = false; }
  }, [syncProfile]);

  const fetchRecent = useCallback(async () => {
    try {
      const data = await api.getRugGameRecentRounds(12);
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
    if (round?.status === 'resolved' && prevStatusRef.current === 'active') {
      setTimeout(() => setShowResultOverlay(true), 400);
      // Settlement toast for rug loss (cashout wins are toasted immediately in handleCashOut)
      if (hasBet && !isCashedOut && myBet) {
        toast.info('Rugged', `${(myBet.betAmount / 1e9).toFixed(4)} SOL lost`);
      }
    }
    if (round?.status === 'waiting') {
      setShowResultOverlay(false);
    }
    prevStatusRef.current = round?.status || null;
  }, [round?.status]);

  const myBet = round?.bets.find(b => b.userId === userId) || null;
  const hasBet = !!myBet;
  const isCashedOut = myBet?.status === 'cashed_out' || !!cashOutDone;

  const handleJoin = async () => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading || !round || round.status !== 'waiting') return;
    setError('');
    setLoading(true);
    playBetPlaced();
    hapticMedium();
    gameTrack.start('rug', betAmount);

    // Optimistic UI
    if (round) {
      setRound({
        ...round,
        bets: [...round.bets, {
          userId: userId || '',
          username: profile.username || 'You',
          avatarUrl: profile.avatarUrl || null,
          betAmount,
          cashOutMultiplier: null,
          status: 'active' as const,
        }],
      });
    }

    try {
      const result = await api.joinRugGameRound(betAmount);
      if (!result.success) {
        fetchRound();
        setError(result.message || 'Failed to join');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err: any) {
      fetchRound();
      setError(err.message || 'Failed to join');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleCashOut = async () => {
    if (loading || !round || round.status !== 'active' || !hasBet || isCashedOut) return;
    setLoading(true);
    hapticMedium();
    try {
      const result = await api.cashOutRugGameRound(round.roundId);
      if (result.success && result.multiplier && result.payout !== undefined) {
        setCashOutDone({ multiplier: result.multiplier, payout: result.payout });
        cashedRoundRef.current = round.roundId;
        playRoundEnd(true);
        gameTrack.cashout('rug', result.multiplier);
        const profit = result.payout - (myBet?.betAmount || 0);
        if (profit > 0) {
          toast.success('Cashed Out!', `+${(profit / 1e9).toFixed(4)} SOL added to balance`);
        }
        syncProfile();
      } else {
        setError(result.message || 'Cash out failed');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Cash out failed');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const waitRemaining = round?.status === 'waiting' && round.waitEndsAt
    ? Math.max(0, Math.ceil((round.waitEndsAt - Date.now()) / 1000))
    : 0;

  const projectedPayout = hasBet && round?.status === 'active'
    ? Math.floor((myBet?.betAmount || 0) * round.currentMultiplier)
    : 0;

  const phase = !round ? undefined
    : round.status === 'waiting' ? 'waiting' as const
    : round.status === 'active' ? 'active' as const
    : 'result' as const;

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  // Result state for overlay
  const isResolved = round?.status === 'resolved' && hasBet;
  const resolvedProfit = isCashedOut && cashOutDone
    ? cashOutDone.payout - (myBet?.betAmount || 0)
    : -(myBet?.betAmount || 0);

  /* ─── HEADER ─── */
  const header = (
    <GameHeader
      title="Rug Game"
      subtitle="Cash out before the rug pull"
      icon={
        <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      }
      rightSlot={phase && <StatusBadge phase={phase} countdown={phase === 'waiting' ? waitRemaining : undefined} label={phase === 'result' ? 'RUGGED' : undefined} />}
      howToPlay={
        <HowToPlayInline steps={[
          { icon: '💰', label: 'Place your bet', desc: 'Join during the betting window' },
          { icon: '📈', label: 'Watch the multiplier rise', desc: 'The chart climbs until the rug pull' },
          { icon: '🏃', label: 'Cash out in time', desc: 'Take profit before it crashes to zero' },
        ]} />
      }
    />
  );

  /* ─── CONTROL RAIL ─── */
  const railContent = (
    <GameControlRail>
      {/* Error */}
      {error && <div style={errorMsg}>{error}</div>}

      {/* Multiplier Hero (active round) */}
      {round?.status === 'active' && (
        <div style={{
          textAlign: 'center',
          padding: `${gap.md}px`,
          background: theme.bg.secondary,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.border.subtle}`,
        }}>
          <MultiplierPulse value={round.currentMultiplier}>
            <div style={{
              fontSize: isMobile ? ts('hero') : 32,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '-0.02em',
              color: theme.accent.neonGreen,
              textShadow: `0 0 ${Math.min(24, round.currentMultiplier * 4)}px rgba(0, 231, 1, ${Math.min(0.5, round.currentMultiplier * 0.06)})`,
              transition: 'text-shadow 0.3s ease',
            }}>
              {Number(round.currentMultiplier).toFixed(2)}x
            </div>
          </MultiplierPulse>
          {hasBet && !isCashedOut && (
            <div style={{ fontSize: ts('sm'), color: theme.text.secondary, marginTop: gap.xs, fontFamily: "'JetBrains Mono', monospace" }}>
              Payout: {formatSol(projectedPayout)} <SolIcon size="0.9em" />
            </div>
          )}
          {isCashedOut && cashOutDone && (
            <div style={{ fontSize: ts('sm'), color: theme.accent.neonGreen, marginTop: gap.xs, fontFamily: "'JetBrains Mono', monospace" }}>
              Cashed out at {Number(cashOutDone.multiplier).toFixed(2)}x
            </div>
          )}
        </div>
      )}

      {/* Cash Out Button */}
      {round?.status === 'active' && hasBet && !isCashedOut && (
        <button style={cashOutBtn} onClick={handleCashOut} disabled={loading}>
          CASH OUT  ·  {Number(round.currentMultiplier).toFixed(2)}x  ·  {formatSol(projectedPayout)} <SolIcon size="0.9em" />
        </button>
      )}

      {/* Disabled Cash Out Preview */}
      {round?.status === 'waiting' && hasBet && (
        <button style={cashOutBtnDisabled} disabled>
          CASH OUT — Available when round starts
        </button>
      )}

      {/* Cashout Success Banner */}
      {isCashedOut && cashOutDone && round?.status === 'active' && (
        <div style={{
          padding: `${gap.md}px`,
          background: 'rgba(0,231,1,0.04)',
          border: '1px solid rgba(0,231,1,0.15)',
          borderRadius: theme.radius.lg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.accent.neonGreen, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Cashed Out
            </div>
            <div style={{ fontSize: ts('lg'), fontWeight: 700, color: theme.accent.neonGreen, marginTop: 2 }} className="mono">
              {Number(cashOutDone.multiplier).toFixed(2)}x — +{formatSol(cashOutDone.payout - (myBet?.betAmount || 0))} <SolIcon size="0.9em" />
            </div>
          </div>
          <Badge variant="success" size="sm">Watching</Badge>
        </div>
      )}

      {/* Betting Panel (waiting, no bet) */}
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
          submitLabel="Join Round"
          onSubmit={handleJoin}
          submitDisabled={betAmount <= 0}
          submitLoading={loading}
        />
      )}

      {/* Already Joined (waiting) */}
      {round?.status === 'waiting' && hasBet && (
        <Card variant="panel" style={{ textAlign: 'center', background: 'rgba(0,231,1,0.03)', borderColor: 'rgba(0,231,1,0.10)' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.neonGreen }}>
            You're in! Bet: {formatSol(myBet!.betAmount)} <SolIcon size="0.9em" />
          </div>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
            Launching in {waitRemaining}s...
          </div>
        </Card>
      )}

      {/* Spectator: logged in but missed betting window */}
      {round?.status === 'active' && !hasBet && isAuthenticated && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 600, color: theme.text.secondary }}>
            Round in progress
          </div>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
            You can join the next round when betting opens
          </div>
        </Card>
      )}

      {/* Spectator: not logged in */}
      {round?.status === 'active' && !hasBet && !isAuthenticated && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 600, color: theme.text.secondary, marginBottom: gap.sm }}>
            Sign in to play in the next round
          </div>
          <Button variant="primary" size="md" onClick={() => go('auth')}>
            Sign In
          </Button>
        </Card>
      )}

      {/* Post-round: resolved, waiting for next */}
      {round?.status === 'resolved' && !hasBet && (
        <Card variant="panel" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: ts('sm'), color: theme.text.muted }}>
            Next round starts automatically...
          </div>
        </Card>
      )}

      {/* No round available */}
      {!round && (
        <Card variant="panel">
          <EmptyState
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="1.5" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            }
            title="Waiting for next round..."
            subtitle="A new rug game starts automatically every 30 seconds"
          />
        </Card>
      )}

      {/* Players Strip */}
      {round && round.bets.length > 0 && (
        <div style={playersStrip}>
          {round.bets.map((bet) => {
            const isMe = bet.userId === userId;
            const statusColor = bet.status === 'cashed_out' ? theme.accent.neonGreen : bet.status === 'rugged' ? theme.accent.red : theme.accent.purple;
            return (
              <div key={bet.userId} style={{
                ...playerChip,
                background: isMe ? 'rgba(139,92,246,0.06)' : theme.bg.secondary,
                borderColor: isMe ? 'rgba(139,92,246,0.20)' : theme.border.subtle,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: getAvatarGradient(bet.avatarUrl, bet.username),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '8px', fontWeight: 700, color: '#fff',
                }}>
                  {getInitials(bet.username)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.primary }}>{bet.username}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: gap.xs }}>
                    <span className="mono" style={{ fontSize: ts('xs'), fontWeight: 700, color: theme.accent.purple }}>
                      {formatSol(bet.betAmount)}
                    </span>
                    {bet.cashOutMultiplier && (
                      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>
                        {Number(bet.cashOutMultiplier).toFixed(2)}x
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Rounds Strip */}
      {recentRounds.length > 0 && (
        <div>
          <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: gap.sm }}>
            Recent Rounds
          </div>
          <div style={recentStrip}>
            {recentRounds.slice(0, 12).map((r: any) => {
              const mult = parseFloat(r.rugMultiplier || '1');
              const variant = mult >= 3 ? 'success' : mult >= 1.5 ? 'purple' : 'danger';
              return (
                <Badge key={r.id} variant={variant as any} size="md" style={{ flexShrink: 0 }}>
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
    <GameStage atmosphere={RUG_ATMOSPHERE}>
      {/* Desktop header inside stage */}
      {!isMobile && (
        <div style={{ padding: `${gap.sm}px ${gap.md}px 0` }}>
          {header}
        </div>
      )}

      {/* Chart fills the stage */}
      <div style={{ position: 'relative', flex: isMobile ? undefined : 1, height: isMobile ? 240 : undefined, minHeight: isMobile ? undefined : 200 }}>
        <RugCandleChart
          candles={round?.candles || []}
          currentMultiplier={round?.currentMultiplier || 1.0}
          status={round?.status || 'waiting'}
          rugMultiplier={round?.rugMultiplier || null}
          isMobile={isMobile}
        />
      </div>

      {/* Confetti on win result */}
      <WinConfetti active={showResultOverlay && isCashedOut} zIndex={8} />

      {/* Result Overlay */}
      <ResultOverlay
        visible={showResultOverlay && isResolved === true}
        variant={isCashedOut ? 'win' : 'loss'}
        actionsDelay={isCashedOut ? 1500 : 800}
        actions={
          isCashedOut && cashOutDone && resolvedProfit > 0 ? (
            <button onClick={() => setShowWinCard(true)} style={btnGhost}>
              Share Win
            </button>
          ) : undefined
        }
      >
        {isCashedOut && cashOutDone ? (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.neonGreen, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>
              CASHED OUT
            </div>
            <CountUpNumber value={cashOutDone.multiplier} from={1} duration={1000} decimals={2} suffix="x" style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 24px rgba(0, 231, 1, 0.4)' }} />
            <CountUpNumber value={resolvedProfit / 1e9} from={0} duration={1200} decimals={resolvedProfit >= 1e9 ? 2 : 4} prefix={resolvedProfit >= 0 ? '+' : ''} suffix={<> <SolIcon size="0.9em" /></>} style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.neonGreen, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.accent.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: gap.xs }}>
              RUGGED
            </div>
            <div style={{ fontSize: ts('hero'), fontWeight: 800, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }}>
              {round?.rugMultiplier ? `${Number(round.rugMultiplier).toFixed(2)}x` : '0.00x'}
            </div>
            <div style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.accent.red, fontFamily: "'JetBrains Mono', monospace", marginTop: gap.xs, opacity: 0.7 }}>
              -{formatSol(myBet?.betAmount || 0)} <SolIcon size="0.9em" />
            </div>
          </>
        )}
      </ResultOverlay>
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = round ? (
    <GameFooterBar>
      <RoundInfoFooter roundNumber={round.roundNumber} seedHash={round.seedHash} />
      <span style={{ fontSize: ts('xs'), color: theme.text.muted }}>
        {round.bets.length} player{round.bets.length !== 1 ? 's' : ''}
      </span>
    </GameFooterBar>
  ) : <GameFooterBar><span /></GameFooterBar>;

  return (
    <>
      {/* Mobile header above layout */}
      {isMobile && <div style={{ padding: `${gap.sm}px 12px` }}>{header}</div>}

      <CasinoGameLayout
        rail={railContent}
        stage={stageContent}
        footer={footerContent}
      />

      {/* Win Card Modal */}
      {showWinCard && cashOutDone && myBet && (
        <WinCard
          gameType="rug-game"
          multiplier={Number(cashOutDone.multiplier)}
          betAmount={myBet.betAmount}
          payout={cashOutDone.payout}
          profit={cashOutDone.payout - myBet.betAmount}
          timestamp={new Date()}
          username={profile.username || 'Player'}
          level={profile.level}
          vipTier={profile.vipTier || 'bronze'}
          onClose={() => setShowWinCard(false)}
        />
      )}
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

const cashOutBtn: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: 'linear-gradient(135deg, #FF3333, #dc2626)',
  border: 'none',
  borderRadius: theme.radius.lg,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: '0.01em',
  transition: 'all 0.15s ease',
  minHeight: 48,
  boxShadow: '0 0 20px rgba(255, 51, 51, 0.2), 0 4px 12px rgba(255, 51, 51, 0.15)',
};

const cashOutBtnDisabled: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: theme.bg.secondary,
  border: `1px solid ${theme.border.medium}`,
  borderRadius: theme.radius.lg,
  color: theme.text.muted,
  cursor: 'not-allowed',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  fontWeight: 600,
  opacity: 0.5,
  minHeight: 48,
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

const btnGhost: CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: theme.text.secondary,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${theme.border.medium}`,
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  minHeight: 40,
};
