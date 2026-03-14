import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { playButtonClick, playBetPlaced, playRoundEnd, hapticLight, hapticMedium } from '../../utils/sounds';
import { useIsMobile } from '../../hooks/useIsMobile';

const BET_AMOUNTS = [
  { lamports: 10_000_000, label: '0.01' },
  { lamports: 50_000_000, label: '0.05' },
  { lamports: 100_000_000, label: '0.1' },
  { lamports: 250_000_000, label: '0.25' },
  { lamports: 500_000_000, label: '0.5' },
  { lamports: 1_000_000_000, label: '1' },
];

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
  betAmount: number;
  cashOutMultiplier: number | null;
  status: 'active' | 'cashed_out' | 'rugged';
}

interface RoundState {
  roundId: string;
  roundNumber: number;
  status: 'waiting' | 'active' | 'resolved';
  seedHash: string;
  seed: string | null;
  rugMultiplier: number | null;
  currentMultiplier: number;
  candles: Candle[];
  bets: RoundBet[];
  waitEndsAt: number | null;
  activeStartedAt: number | null;
  resolvedAt: number | null;
}

// ─── OHLC Candlestick Chart Component ───────────────────────

function RugCandleChart({ candles, currentMultiplier, status, rugMultiplier, isMobile }: {
  candles: Candle[];
  currentMultiplier: number;
  status: string;
  rugMultiplier: number | null;
  isMobile: boolean;
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

    // Background
    ctx.fillStyle = '#0a0c10';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    const pad = { top: 36, bottom: 20, left: 10, right: isMobile ? 48 : 56 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    if (status === 'waiting' || candles.length === 0) {
      // Empty grid during waiting
      for (let i = 0; i < 5; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }

      // 1.0x reference line
      const midY = pad.top + chartH * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, midY);
      ctx.lineTo(w - pad.right, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 ${isMobile ? 20 : 28}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(251,191,36,0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('PRESALE', w / 2, h * 0.38);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Place your bets before launch!', w / 2, h * 0.38 + 26);
      return;
    }

    // Calculate price range from candles
    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) {
      pMin = Math.min(pMin, c.low);
      pMax = Math.max(pMax, c.high);
    }
    pMin = Math.max(0.8, pMin - (pMax - pMin) * 0.1);
    pMax += (pMax - pMin) * 0.1;
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // Grid lines and labels
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
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 4, y + 3);
    }

    // 1.0x reference line
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

    // Draw candles
    const maxVisible = isMobile ? 40 : 60;
    const visibleCandles = candles.length > maxVisible ? candles.slice(candles.length - maxVisible) : candles;
    const spacing = chartW / Math.max(visibleCandles.length, 10);
    const candleW = Math.max(3, spacing * 0.55);

    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.close >= c.open;
      const isCrash = status === 'resolved' && i >= visibleCandles.length - 3 && rugMultiplier !== null;
      const color = isCrash ? '#ef4444' : isGreen ? '#22c55e' : '#ef4444';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      // Body
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(2, bBot - bTop));
    }

    // Current multiplier overlay
    if (status === 'active') {
      const multColor = currentMultiplier >= 2 ? '#34d399' : currentMultiplier >= 1.5 ? '#22c55e' : '#fbbf24';
      ctx.fillStyle = multColor;
      ctx.font = `900 ${isMobile ? 28 : 36}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = `${multColor}80`;
      ctx.shadowBlur = 20;
      ctx.fillText(`${currentMultiplier.toFixed(2)}x`, w / 2, pad.top - 6);
      ctx.shadowBlur = 0;
    }

    // Resolved overlay
    if (status === 'resolved' && rugMultiplier !== null) {
      // Semi-transparent overlay
      ctx.fillStyle = 'rgba(10, 12, 16, 0.6)';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ef4444';
      ctx.font = `900 ${isMobile ? 32 : 42}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(239,68,68,0.5)';
      ctx.shadowBlur = 24;
      ctx.fillText('RUGGED', w / 2, h * 0.4);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fbbf24';
      ctx.font = `800 ${isMobile ? 20 : 26}px 'JetBrains Mono', monospace`;
      ctx.fillText(`at ${rugMultiplier.toFixed(2)}x`, w / 2, h * 0.4 + (isMobile ? 30 : 36));
    }
  }, [candles, currentMultiplier, status, rugMultiplier, isMobile]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const chartHeight = isMobile ? 220 : 300;
  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${chartHeight}px`, display: 'block', borderRadius: '12px' }}
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

  const [round, setRound] = useState<RoundState | null>(null);
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [customBet, setCustomBet] = useState('0.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentRounds, setRecentRounds] = useState<any[]>([]);
  const [cashOutDone, setCashOutDone] = useState<{ multiplier: number; payout: number } | null>(null);

  // Track which round we cashed out of (so we keep watching)
  const cashedRoundRef = useRef<string | null>(null);

  // Fetch current round from server
  const fetchRound = useCallback(async () => {
    try {
      const data = await api.getRugGameRound();
      setRound(data?.round || null);

      // If we transitioned to a new round, reset cashout state
      if (cashedRoundRef.current && data?.round?.roundId !== cashedRoundRef.current) {
        cashedRoundRef.current = null;
        setCashOutDone(null);
      }
    } catch { /* ignore polling errors */ }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const data = await api.getRugGameRecentRounds(10);
      setRecentRounds(data?.rounds || []);
    } catch { /* ignore */ }
  }, []);

  // Poll every 500ms for smooth updates
  useEffect(() => {
    fetchRound();
    fetchRecent();
    const interval = setInterval(fetchRound, 500);
    const recentInterval = setInterval(fetchRecent, 5000);
    return () => { clearInterval(interval); clearInterval(recentInterval); };
  }, [fetchRound, fetchRecent]);

  // Get my bet in the current round
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
    try {
      const result = await api.joinRugGameRound(betAmount);
      if (!result.success) {
        setError(result.message || 'Failed to join');
        setTimeout(() => setError(''), 3000);
      } else {
        fetchRound();
      }
    } catch (err: any) {
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

  // Countdown for waiting phase
  const waitRemaining = round?.status === 'waiting' && round.waitEndsAt
    ? Math.max(0, Math.ceil((round.waitEndsAt - Date.now()) / 1000))
    : 0;

  return (
    <div style={s.root} className="screen-enter">
      {/* Header */}
      <div style={s.headerSection}>
        <button style={s.backBtn} onClick={() => go('lobby')} className="hover-bright">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={s.headerText}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ ...s.headerIcon, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h1 style={s.title}>Rug Game</h1>
          </div>
          <p style={s.subtitle}>Cash out before the rug pull!</p>
        </div>
        {round && (
          <div style={{
            padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
            background: round.status === 'waiting' ? 'rgba(251,191,36,0.12)' : round.status === 'active' ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
            color: round.status === 'waiting' ? '#fbbf24' : round.status === 'active' ? '#34d399' : '#ef4444',
            border: `1px solid ${round.status === 'waiting' ? 'rgba(251,191,36,0.2)' : round.status === 'active' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
            letterSpacing: '1px',
          }}>
            {round.status === 'waiting' ? `PRESALE ${waitRemaining}s` : round.status === 'active' ? 'LIVE' : 'RUGGED'}
          </div>
        )}
      </div>

      {error && <div style={s.errorMsg} className="screen-enter">{error}</div>}

      {/* Candlestick Chart */}
      <RugCandleChart
        candles={round?.candles || []}
        currentMultiplier={round?.currentMultiplier || 1.0}
        status={round?.status || 'waiting'}
        rugMultiplier={round?.rugMultiplier || null}
        isMobile={isMobile}
      />

      {/* Cash Out Notification */}
      {isCashedOut && cashOutDone && round?.status === 'active' && (
        <div style={{
          padding: '12px 16px', borderRadius: '12px',
          background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Cashed Out!
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }} className="mono">
              {cashOutDone.multiplier.toFixed(2)}x — +{formatSol(cashOutDone.payout)} SOL
            </div>
          </div>
          <div style={{ fontSize: '11px', color: theme.text.muted }}>Watching round...</div>
        </div>
      )}

      {/* Players Strip */}
      {round && round.bets.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {round.bets.map((bet) => {
            const isMe = bet.userId === userId;
            const statusColor = bet.status === 'cashed_out' ? '#34d399' : bet.status === 'rugged' ? '#ef4444' : '#fbbf24';
            return (
              <div key={bet.userId} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
                borderRadius: '10px', flexShrink: 0,
                background: isMe ? 'rgba(119,23,255,0.1)' : theme.bg.secondary,
                border: `1px solid ${isMe ? 'rgba(119,23,255,0.3)' : theme.border.subtle}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: getAvatarGradient(bet.avatarUrl, bet.username),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 700, color: '#fff',
                }}>
                  {getInitials(bet.username)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: theme.text.primary }}>{bet.username}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="mono" style={{ fontSize: '10px', fontWeight: 700, color: '#fbbf24' }}>
                      {formatSol(bet.betAmount)}
                    </span>
                    {bet.cashOutMultiplier && (
                      <span className="mono" style={{ fontSize: '9px', fontWeight: 700, color: statusColor }}>
                        {bet.cashOutMultiplier.toFixed(2)}x
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
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {recentRounds.slice(0, 12).map((r: any) => {
            const mult = parseFloat(r.rugMultiplier || '1');
            const color = mult >= 3 ? '#34d399' : mult >= 1.5 ? '#fbbf24' : '#ef4444';
            return (
              <div key={r.id} style={{
                padding: '4px 10px', borderRadius: '8px', flexShrink: 0,
                background: `${color}10`, border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', gap: '2px',
              }}>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 800, color }}>
                  {mult.toFixed(2)}x
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Betting Controls */}
      {round?.status === 'waiting' && !hasBet && (
        <>
          <div style={s.sectionLabel}>Bet Amount</div>
          <div style={s.betGrid}>
            {BET_AMOUNTS.map(b => (
              <button
                key={b.lamports}
                style={{ ...s.betBtn, ...(betAmount === b.lamports ? s.betBtnActive : {}) }}
                onClick={() => { setBetAmount(b.lamports); setCustomBet(b.label); playButtonClick(); }}
              >
                <span className="mono" style={{ fontSize: '14px', fontWeight: 700 }}>{b.label}</span>
                <span style={{ fontSize: '10px', color: theme.text.muted }}>SOL</span>
              </button>
            ))}
          </div>

          <div style={s.customBetRow}>
            <input
              type="number"
              value={customBet}
              onChange={e => {
                setCustomBet(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) setBetAmount(Math.floor(val * 1_000_000_000));
              }}
              style={s.customBetInput}
              placeholder="Custom SOL"
              className="mono"
            />
          </div>

          <button
            style={s.buyBtn}
            onClick={handleJoin}
            disabled={loading || betAmount <= 0}
            className="hover-scale"
          >
            {loading ? 'Joining...' : 'BUY NOW'}
          </button>
        </>
      )}

      {/* Already joined waiting */}
      {round?.status === 'waiting' && hasBet && (
        <div style={{
          padding: '16px', textAlign: 'center', borderRadius: '12px',
          background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
            You're in! Bet: {formatSol(myBet!.betAmount)} SOL
          </div>
          <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '4px' }}>
            Launching in {waitRemaining}s...
          </div>
        </div>
      )}

      {/* Cash Out Button during active */}
      {round?.status === 'active' && hasBet && !isCashedOut && (
        <button
          style={s.cashOutBtn}
          onClick={handleCashOut}
          disabled={loading}
          className="hover-scale"
        >
          <span style={{ fontSize: '20px', fontWeight: 900 }}>
            CASH OUT
          </span>
          <span style={{ fontSize: '14px', fontWeight: 600, opacity: 0.8 }} className="mono">
            {round.currentMultiplier.toFixed(2)}x — {formatSol(Math.floor((myBet?.betAmount || 0) * round.currentMultiplier))} SOL
          </span>
        </button>
      )}

      {/* Resolved result for user */}
      {round?.status === 'resolved' && hasBet && (
        <div style={{
          padding: '16px', textAlign: 'center', borderRadius: '12px',
          background: isCashedOut ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${isCashedOut ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <div style={{
            fontSize: '18px', fontWeight: 900,
            color: isCashedOut ? '#34d399' : '#ef4444',
          }}>
            {isCashedOut ? 'YOU WON!' : 'RUGGED!'}
          </div>
          <div style={{
            fontSize: '24px', fontWeight: 900, marginTop: '4px',
            color: isCashedOut ? '#34d399' : '#ef4444',
          }} className="mono">
            {isCashedOut && cashOutDone
              ? `+${formatSol(cashOutDone.payout - (myBet?.betAmount || 0))} SOL`
              : `-${formatSol(myBet?.betAmount || 0)} SOL`
            }
          </div>
          {round.seed && (
            <div style={{
              marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
              background: 'rgba(119,23,255,0.06)', fontSize: '10px', color: theme.text.muted,
              fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all',
            }}>
              Seed: {round.seed.slice(0, 16)}...
            </div>
          )}
        </div>
      )}

      {/* Not authenticated + active round */}
      {round?.status === 'active' && !hasBet && !isAuthenticated && (
        <div style={{
          padding: '16px', textAlign: 'center', borderRadius: '12px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>
            Sign in to play in the next round
          </div>
          <button style={{ ...s.buyBtn, marginTop: '8px', padding: '12px' }} onClick={() => go('auth')}>
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
  sectionLabel: {
    fontSize: '12px', fontWeight: 700, color: theme.text.muted,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  betGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  betBtn: {
    padding: '12px 8px', borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px',
    transition: 'all 0.15s', color: theme.text.primary,
  },
  betBtnActive: {
    background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24',
  },
  customBetRow: { display: 'flex', gap: '10px' },
  customBetInput: {
    flex: 1, padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, color: theme.text.primary, fontSize: '15px', fontWeight: 700,
    outline: 'none', fontFamily: "'JetBrains Mono', monospace", minWidth: 0,
  },
  buyBtn: {
    width: '100%', padding: '16px',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    border: 'none', borderRadius: '14px', color: '#fff',
    fontSize: '18px', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)', letterSpacing: '2px',
  },
  cashOutBtn: {
    width: '100%', padding: '16px',
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    border: 'none', borderRadius: '14px', color: '#fff',
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(239, 68, 68, 0.4)',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px',
  },
};
