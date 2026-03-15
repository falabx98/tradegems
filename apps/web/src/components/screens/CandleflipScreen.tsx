import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { playBetPlaced, playRoundEnd, hapticMedium } from '../../utils/sounds';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BetPanel } from '../ui/BetPanel';
import { RecentGames } from '../ui/RecentGames';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface RoundBet {
  userId: string;
  username: string;
  avatarUrl: string | null;
  pick: 'bullish' | 'bearish';
  betAmount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost';
}

interface CandleflipState {
  roundId: string;
  roundNumber: number;
  status: 'waiting' | 'flipping' | 'resolved';
  seedHash: string;
  seed: string | null;
  result: 'bullish' | 'bearish' | null;
  resultMultiplier: number | null;
  candles: Candle[];
  bets: RoundBet[];
  waitEndsAt: number | null;
  flipStartedAt: number | null;
  flipEndsAt: number | null;
  resolvedAt: number | null;
}

// ─── Candlestick Chart Component ────────────────────────────

function FlipCandleChart({ candles, status, result, resultMultiplier, flipStartedAt, isMobile }: {
  candles: Candle[];
  status: string;
  result: 'bullish' | 'bearish' | null;
  resultMultiplier: number | null;
  flipStartedAt: number | null;
  isMobile: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  // Progressive reveal during flipping
  useEffect(() => {
    if (status !== 'flipping' || candles.length === 0 || !flipStartedAt) {
      if (status === 'resolved') setVisibleCount(candles.length);
      if (status === 'waiting') setVisibleCount(0);
      return;
    }

    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount(prev => {
        if (prev >= candles.length) {
          clearInterval(interval);
          return candles.length;
        }
        return prev + 1;
      });
    }, 450); // Reveal 1 candle every 450ms

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

    ctx.fillStyle = '#0a0c10';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    const pad = { top: 36, bottom: 20, left: 10, right: isMobile ? 48 : 56 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    if (status === 'waiting' || candles.length === 0) {
      // Grid
      for (let i = 0; i < 5; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      }
      // 1.0x line
      const midY = pad.top + chartH * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, midY); ctx.lineTo(w - pad.right, midY); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#8b5cf6';
      ctx.font = `900 ${isMobile ? 20 : 28}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(139,92,246,0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('NEXT FLIP', w / 2, h * 0.4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Over / Under 1.00x', w / 2, h * 0.4 + 24);
      return;
    }

    // Determine which candles to show
    const shown = status === 'flipping' ? candles.slice(0, visibleCount) : candles;
    if (shown.length === 0) return;

    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) { pMin = Math.min(pMin, c.low); pMax = Math.max(pMax, c.high); }
    pMin -= 0.03; pMax += 0.03;
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // Grid + labels
    for (let i = 0; i <= 4; i++) {
      const val = pMin + (pRange / 4) * (4 - i);
      const y = toY(val);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 4, y + 3);
    }

    // 1.0x line
    if (pMin < 1.0 && pMax > 1.0) {
      const refY = toY(1.0);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, refY); ctx.lineTo(w - pad.right, refY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('1.00x', pad.left + 4, refY - 4);
    }

    // Draw candles
    const spacing = chartW / candles.length;
    const cw = Math.max(4, spacing * 0.6);
    for (let i = 0; i < shown.length; i++) {
      const c = shown[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - cw / 2, bTop, cw, Math.max(2, bBot - bTop));
    }

    // Status text
    if (status === 'flipping') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `700 ${isMobile ? 14 : 16}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Flipping...', w / 2, pad.top - 6);
    }

    // Result overlay
    if (status === 'resolved' && result && resultMultiplier !== null) {
      const resColor = result === 'bullish' ? '#2ecc71' : '#f87171';
      ctx.fillStyle = resColor;
      ctx.font = `900 ${isMobile ? 28 : 36}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = `${resColor}80`;
      ctx.shadowBlur = 16;
      ctx.fillText(`${resultMultiplier.toFixed(2)}x`, w / 2, pad.top - 4);
      ctx.shadowBlur = 0;
      ctx.font = `700 ${isMobile ? 14 : 16}px 'JetBrains Mono', monospace`;
      ctx.fillText(result === 'bullish' ? 'BULLISH' : 'BEARISH', w / 2, h - 6);
    }
  }, [candles, status, result, resultMultiplier, visibleCount, isMobile]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const chartHeight = isMobile ? 200 : 280;
  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${chartHeight}px`, display: 'block', borderRadius: '12px' }}
    />
  );
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
  const fetchingRef = useRef(false);

  const fetchRound = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api.getCandleflipRound();
      setRound(data?.round || null);
    } catch { /* ignore */ }
    finally { fetchingRef.current = false; }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const data = await api.getCandleflipRecentRounds(10);
      setRecentRounds(data?.rounds || []);
    } catch { /* ignore */ }
  }, []);

  // Poll every 500ms
  useEffect(() => {
    fetchRound();
    fetchRecent();
    const interval = setInterval(fetchRound, 500);
    const recentInterval = setInterval(fetchRecent, 5000);
    return () => { clearInterval(interval); clearInterval(recentInterval); };
  }, [fetchRound, fetchRecent]);

  const myBet = round?.bets.find(b => b.userId === userId) || null;
  const hasBet = !!myBet;

  const handleBet = async () => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading || !round || round.status !== 'waiting') return;
    setError('');
    setLoading(true);
    playBetPlaced();
    hapticMedium();
    try {
      const result = await api.betCandleflipRound(pick, betAmount);
      if (!result.success) {
        setError(result.message || 'Failed to bet');
        setTimeout(() => setError(''), 3000);
      } else {
        fetchRound();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to bet');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // When round resolves, sync profile (only once per roundId)
  const lastResolvedRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (round?.status === 'resolved' && myBet && round.roundId !== lastResolvedRoundRef.current) {
      lastResolvedRoundRef.current = round.roundId;
      syncProfile();
      playRoundEnd(myBet.status === 'won');
    }
  }, [round?.status, round?.roundId]);

  const waitRemaining = round?.status === 'waiting' && round.waitEndsAt
    ? Math.max(0, Math.ceil((round.waitEndsAt - Date.now()) / 1000))
    : 0;

  const bullCount = round?.bets.filter(b => b.pick === 'bullish').length || 0;
  const bearCount = round?.bets.filter(b => b.pick === 'bearish').length || 0;

  return (
    <div style={s.root} className="screen-enter">
      {/* Header */}
      <div style={s.headerSection}>
        <button style={s.backBtn} onClick={() => go('lobby')} className="hover-bright">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={s.headerText}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ ...s.headerIcon, background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.2)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round">
                <rect x="4" y="8" width="16" height="8" rx="2" /><path d="M12 4v4" /><path d="M12 16v4" />
              </svg>
            </div>
            <h1 style={s.title}>Candleflip</h1>
          </div>
          <p style={s.subtitle}>Over/Under 1.00x — Pick Bullish or Bearish</p>
        </div>
        {round && (
          <div style={{
            padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
            background: round.status === 'waiting' ? 'rgba(139,92,246,0.12)' : round.status === 'flipping' ? 'rgba(139,92,246,0.12)' : 'rgba(46,204,113,0.12)',
            color: round.status === 'waiting' ? '#8b5cf6' : round.status === 'flipping' ? '#8b5cf6' : '#2ecc71',
            border: `1px solid ${round.status === 'waiting' ? 'rgba(139,92,246,0.2)' : round.status === 'flipping' ? 'rgba(139,92,246,0.2)' : 'rgba(46,204,113,0.2)'}`,
            letterSpacing: '1px',
          }}>
            {round.status === 'waiting' ? `BET ${waitRemaining}s` : round.status === 'flipping' ? 'FLIPPING' : 'RESULT'}
          </div>
        )}
      </div>

      {error && <div style={s.errorMsg} className="screen-enter">{error}</div>}

      {/* Chart */}
      <FlipCandleChart
        candles={round?.candles || []}
        status={round?.status || 'waiting'}
        result={round?.result || null}
        resultMultiplier={round?.resultMultiplier || null}
        flipStartedAt={round?.flipStartedAt || null}
        isMobile={isMobile}
      />

      {/* Result for user */}
      {round?.status === 'resolved' && myBet && (
        <div style={{
          padding: '14px', textAlign: 'center', borderRadius: '12px',
          background: myBet.status === 'won' ? 'rgba(46,204,113,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${myBet.status === 'won' ? 'rgba(46,204,113,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <div style={{ fontSize: '18px', fontWeight: 900, color: myBet.status === 'won' ? '#2ecc71' : '#ef4444' }}>
            {myBet.status === 'won' ? 'YOU WON!' : 'YOU LOST'}
          </div>
          <div className="mono" style={{ fontSize: '22px', fontWeight: 900, color: myBet.status === 'won' ? '#2ecc71' : '#ef4444', marginTop: '2px' }}>
            {myBet.status === 'won' ? `+${formatSol(myBet.payout - myBet.betAmount)}` : `-${formatSol(myBet.betAmount)}`} SOL
          </div>
        </div>
      )}

      {/* Players */}
      {round && round.bets.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {round.bets.map(bet => {
            const isMe = bet.userId === userId;
            const pickColor = bet.pick === 'bullish' ? '#2ecc71' : '#f87171';
            return (
              <div key={bet.userId} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
                borderRadius: '10px', flexShrink: 0,
                background: isMe ? 'rgba(139,92,246,0.1)' : theme.bg.secondary,
                border: `1px solid ${isMe ? 'rgba(139,92,246,0.3)' : theme.border.subtle}`,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: getAvatarGradient(bet.avatarUrl, bet.username),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '8px', fontWeight: 700, color: '#fff',
                }}>
                  {getInitials(bet.username)}
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: theme.text.primary }}>{bet.username}</span>
                <span style={{ fontSize: '9px', fontWeight: 800, color: pickColor, padding: '1px 5px', background: `${pickColor}15`, borderRadius: '4px' }}>
                  {bet.pick === 'bullish' ? 'BULL' : 'BEAR'}
                </span>
                <span className="mono" style={{ fontSize: '10px', fontWeight: 700, color: '#8b5cf6' }}>
                  {formatSol(bet.betAmount)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent results strip */}
      {recentRounds.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {recentRounds.slice(0, 12).map((r: any) => {
            const isBull = r.result === 'bullish';
            const mult = parseFloat(r.resultMultiplier || '1');
            return (
              <div key={r.id} style={{
                padding: '4px 10px', borderRadius: '8px', flexShrink: 0,
                background: isBull ? 'rgba(46,204,113,0.1)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${isBull ? 'rgba(46,204,113,0.2)' : 'rgba(248,113,113,0.2)'}`,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: isBull ? '#2ecc71' : '#f87171' }}>
                  {isBull ? '\u25B2' : '\u25BC'}
                </span>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 800, color: isBull ? '#2ecc71' : '#f87171' }}>
                  {mult.toFixed(2)}x
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Betting Controls — only during waiting and not already bet */}
      {round?.status === 'waiting' && !hasBet && (
        <BetPanel
          presets={[
            { label: '0.01', lamports: 10_000_000 },
            { label: '0.05', lamports: 50_000_000 },
            { label: '0.1', lamports: 100_000_000 },
            { label: '0.25', lamports: 250_000_000 },
            { label: '0.5', lamports: 500_000_000 },
            { label: '1', lamports: 1_000_000_000 },
          ]}
          selectedAmount={betAmount}
          onAmountChange={setBetAmount}
          balance={profile.balance}
          choices={[
            { id: 'bullish', label: 'BULLISH', color: '#2ecc71', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>, payout: '1.9x' },
            { id: 'bearish', label: 'BEARISH', color: '#f87171', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>, payout: '1.9x' },
          ]}
          selectedChoice={pick}
          onChoiceSelect={(id) => setPick(id as 'bullish' | 'bearish')}
          submitLabel="BET"
          onSubmit={handleBet}
          submitDisabled={!pick || betAmount <= 0}
          submitLoading={loading}
        />
      )}

      <RecentGames
        title="Recent Flips"
        fetchGames={async () => {
          const res = await api.getCandleflipRecentRounds(10);
          return (res.rounds || []).map((r: any) => ({
            id: r.id,
            result: r.result === 'bullish' ? 'win' : 'loss',
            multiplier: r.multiplier || 1.9,
            amount: r.totalPool ? r.totalPool / 2 : 0,
            payout: r.totalPool || 0,
            time: r.createdAt || r.resolvedAt,
          }));
        }}
      />

      {/* Already bet, waiting */}
      {round?.status === 'waiting' && hasBet && (
        <div style={{
          padding: '16px', textAlign: 'center', borderRadius: '12px',
          background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#8b5cf6' }}>
            Bet placed: {formatSol(myBet!.betAmount)} SOL on {myBet!.pick.toUpperCase()}
          </div>
          <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '4px' }}>
            Flipping in {waitRemaining}s...
          </div>
        </div>
      )}

      {/* No active round — waiting state */}
      {!round && (
        <div style={{
          padding: '24px', textAlign: 'center', borderRadius: '14px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text.secondary }}>
            Waiting for next round...
          </div>
          <div style={{ fontSize: '13px', color: theme.text.muted, marginTop: '6px' }}>
            A new flip starts automatically every 30 seconds
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: '18px', fontWeight: 800, color: '#2ecc71' }}>▲ BULL</div>
              <div style={{ fontSize: '11px', color: theme.text.muted }}>Over 1.00x</div>
            </div>
            <div style={{ width: '1px', background: theme.border.subtle }} />
            <div style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: '18px', fontWeight: 800, color: '#f87171' }}>▼ BEAR</div>
              <div style={{ fontSize: '11px', color: theme.text.muted }}>Under 1.00x</div>
            </div>
          </div>
        </div>
      )}

      {/* Not authenticated */}
      {!isAuthenticated && round?.status === 'waiting' && (
        <div style={{
          padding: '16px', textAlign: 'center', borderRadius: '12px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>
            Sign in to play
          </div>
          <button style={{ ...s.betBtn2, marginTop: '8px', padding: '12px' }} onClick={() => go('auth')}>
            Sign In
          </button>
        </div>
      )}

      {/* Round info */}
      {round && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', borderRadius: '10px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
          fontSize: '11px', color: theme.text.muted,
        }}>
          <span>Round #{round.roundNumber}</span>
          <span>{round.bets.length} player{round.bets.length !== 1 ? 's' : ''}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}>
            {round.seedHash.slice(0, 12)}...
          </span>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: '10px',
    padding: '12px', minHeight: '100%', boxSizing: 'border-box',
    maxWidth: '900px', margin: '0 auto', width: '100%',
  },
  headerSection: { display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: {
    width: 38, height: 38, borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerIcon: {
    width: 36, height: 36, borderRadius: '10px',
    border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: '22px', fontWeight: 800, color: '#fff', margin: 0 },
  subtitle: { fontSize: '13px', color: theme.text.muted, margin: '4px 0 0' },
  errorMsg: {
    padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: '10px', color: '#f87171', fontSize: '14px', fontWeight: 600, textAlign: 'center',
  },
  betBtn2: {
    width: '100%', padding: '16px',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    border: 'none', borderRadius: '14px', color: '#fff',
    fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.3)', letterSpacing: '1px',
  },
};
