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
import { LiveDot, MultiplierBadge, StatusBadge, LiveRoundBanner, WinAmountDisplay, timeAgo } from '../ui/LiveIndicators';

interface Lobby {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorAvatar: string | null;
  betAmount: number;
  creatorPick: 'bullish' | 'bearish';
  status: string;
  seedHash: string;
  createdAt: string;
}

interface GameResult {
  id: string;
  result: 'bullish' | 'bearish';
  resultMultiplier: string;
  winnerId: string;
  prizeAmount: number;
  betAmount: number;
  creatorPick: string;
  seed?: string;
  seedHash?: string;
}

type Tab = 'play' | 'history';

const BET_AMOUNTS = [
  { lamports: 10_000_000, label: '0.01' },
  { lamports: 50_000_000, label: '0.05' },
  { lamports: 100_000_000, label: '0.1' },
  { lamports: 250_000_000, label: '0.25' },
  { lamports: 500_000_000, label: '0.5' },
  { lamports: 1_000_000_000, label: '1' },
];

// Generate synthetic OHLC candles for candleflip chart
function generateFlipCandles(mult: number, isBull: boolean, count: number): Array<{ o: number; h: number; l: number; c: number }> {
  const candles: Array<{ o: number; h: number; l: number; c: number }> = [];
  let price = 1.0;
  const drift = isBull ? 0.02 : -0.015;
  for (let i = 0; i < count; i++) {
    const open = price;
    const noise = (Math.random() - 0.45) * 0.06;
    const close = Math.max(0.7, open + drift + noise);
    const wickUp = Math.abs(close - open) * (0.3 + Math.random() * 0.6);
    const wickDn = Math.abs(close - open) * (0.2 + Math.random() * 0.5);
    candles.push({ o: open, h: Math.max(open, close) + wickUp, l: Math.max(0.6, Math.min(open, close) - wickDn), c: close });
    price = close;
  }
  const last = candles[candles.length - 1];
  if (isBull) { last.c = mult; last.h = Math.max(last.h, mult * 1.02); }
  else { last.c = mult; last.l = Math.min(last.l, mult * 0.98); }
  return candles;
}

// Candlestick chart canvas for candleflip results
function CandleflipChart({ multiplier, isBullish, width, height }: { multiplier: number; isBullish: boolean; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }> | null>(null);
  const keyRef = useRef('');
  const key = `${multiplier}-${isBullish}`;
  if (keyRef.current !== key) {
    candlesRef.current = generateFlipCandles(multiplier, isBullish, 10);
    keyRef.current = key;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const w = width, h = height;
    const candles = candlesRef.current!;

    ctx.fillStyle = '#0c0e12';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    const pad = { top: 6, bottom: 6, left: 4, right: 4 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) { pMin = Math.min(pMin, c.l); pMax = Math.max(pMax, c.h); }
    pMin -= 0.02; pMax += 0.02;
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // 1.0x reference line
    const refY = toY(1.0);
    ctx.strokeStyle = 'rgba(34,197,94,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(pad.left, refY); ctx.lineTo(w - pad.right, refY); ctx.stroke();
    ctx.setLineDash([]);

    const spacing = chartW / candles.length;
    const candleW = Math.max(3, spacing * 0.55);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
      const bTop = toY(Math.max(c.o, c.c));
      const bBot = toY(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(2, bBot - bTop));
    }
  }, [multiplier, isBullish, width, height]);

  return <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px`, flexShrink: 0, borderRadius: '8px' }} />;
}

// ─── LIVE SPECTATOR: Auto-cycling candleflip chart ───
function LiveFlipChart({ recentResults }: { recentResults: any[] }) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<'waiting' | 'flipping' | 'result'>('waiting');
  const [phase, setPhase] = useState<'waiting' | 'flipping' | 'result'>('waiting');
  const [flipResult, setFlipResult] = useState<{ mult: number; isBull: boolean } | null>(null);
  const [flipCountdown, setFlipCountdown] = useState(3);
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }>>([]);

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
    const currentPhase = phaseRef.current;

    ctx.fillStyle = '#0a0c10';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    const pad = { top: 30, bottom: 20, left: 10, right: isMobile ? 44 : 52 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    if (currentPhase === 'waiting') {
      // Grid
      for (let i = 0; i < 4; i++) {
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

      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 ${isMobile ? 18 : 24}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(251,191,36,0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('NEXT FLIP', w / 2, h * 0.4);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Over / Under 1.00x', w / 2, h * 0.4 + 24);
      return;
    }

    if (currentPhase === 'flipping') {
      // Animated flipping state - show building candles
      const candles = candlesRef.current;
      if (candles.length === 0) return;

      let pMin = Infinity, pMax = -Infinity;
      for (const c of candles) { pMin = Math.min(pMin, c.l); pMax = Math.max(pMax, c.h); }
      pMin -= 0.03; pMax += 0.03;
      const pRange = pMax - pMin || 0.1;
      const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

      const refY = toY(1.0);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, refY); ctx.lineTo(w - pad.right, refY); ctx.stroke();
      ctx.setLineDash([]);

      const spacing = chartW / Math.max(candles.length, 10);
      const cw = Math.max(4, spacing * 0.6);
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const x = pad.left + (i + 0.5) * spacing;
        const isGreen = c.c >= c.o;
        const color = isGreen ? '#22c55e' : '#ef4444';
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
        const bTop = toY(Math.max(c.o, c.c));
        const bBot = toY(Math.min(c.o, c.c));
        ctx.fillStyle = color;
        ctx.fillRect(x - cw / 2, bTop, cw, Math.max(2, bBot - bTop));
      }

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `700 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Flipping...', w / 2, pad.top - 6);
      return;
    }

    // RESULT phase - show full chart
    const candles = candlesRef.current;
    if (candles.length === 0 || !flipResult) return;

    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) { pMin = Math.min(pMin, c.l); pMax = Math.max(pMax, c.h); }
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
    const refY = toY(1.0);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, refY); ctx.lineTo(w - pad.right, refY); ctx.stroke();
    ctx.setLineDash([]);

    const spacing = chartW / candles.length;
    const cw = Math.max(4, spacing * 0.6);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
      const bTop = toY(Math.max(c.o, c.c));
      const bBot = toY(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - cw / 2, bTop, cw, Math.max(2, bBot - bTop));
    }

    // Result text
    const resColor = flipResult.isBull ? '#34d399' : '#f87171';
    ctx.fillStyle = resColor;
    ctx.font = `900 ${isMobile ? 24 : 32}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = `${resColor}80`;
    ctx.shadowBlur = 16;
    ctx.fillText(`${flipResult.mult.toFixed(2)}x`, w / 2, pad.top - 4);
    ctx.shadowBlur = 0;

    ctx.font = `700 ${isMobile ? 12 : 14}px 'JetBrains Mono', monospace`;
    ctx.fillText(flipResult.isBull ? 'BULLISH' : 'BEARISH', w / 2, h - 6);
  }, [isMobile]);

  // Auto-cycle flips
  useEffect(() => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const runFlip = () => {
      if (cancelled) return;

      // WAITING
      phaseRef.current = 'waiting';
      setPhase('waiting');
      candlesRef.current = [];
      setFlipResult(null);
      draw();

      const flipTO = setTimeout(() => {
        if (cancelled) return;

        // FLIPPING - generate result
        const isBull = Math.random() > 0.48;
        const mult = isBull
          ? 1.0 + Math.random() * 0.5
          : 0.5 + Math.random() * 0.5;

        const candles = generateFlipCandles(mult, isBull, 10);
        phaseRef.current = 'flipping';
        setPhase('flipping');

        // Build candles incrementally
        let idx = 0;
        const buildInt = setInterval(() => {
          if (cancelled || idx >= candles.length) {
            clearInterval(buildInt);
            if (cancelled) return;

            // RESULT
            candlesRef.current = candles;
            phaseRef.current = 'result';
            setPhase('result');
            setFlipResult({ mult, isBull });
            draw();

            // After 3s, next flip
            const nextTO = setTimeout(() => {
              if (!cancelled) runFlip();
            }, 3000);
            timeouts.push(nextTO);
            return;
          }

          candlesRef.current = candles.slice(0, idx + 1);
          idx++;
          draw();
        }, 200);

        return () => clearInterval(buildInt);
      }, 3000 + Math.random() * 2000);
      timeouts.push(flipTO);
    };

    runFlip();

    return () => {
      cancelled = true;
      timeouts.forEach(t => clearTimeout(t));
    };
  }, []);

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

export function CandleflipScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const balance = profile?.balance ?? 0;

  const [tab, setTab] = useState<Tab>('play');
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [pick, setPick] = useState<'bullish' | 'bearish'>('bullish');
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [customBet, setCustomBet] = useState('0.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeGame, setActiveGame] = useState<GameResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [animating, setAnimating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchLobbies = async () => {
    try {
      const res = await api.getCandleflipLobbies();
      setLobbies(res.lobbies || []);
    } catch { /* ignore */ }
  };

  const fetchRecent = async () => {
    try {
      const res = await api.getCandleflipRecent(15);
      setRecentResults(res.results || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchLobbies();
    fetchRecent();
    const interval = setInterval(() => { fetchLobbies(); fetchRecent(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === 'history' && userId) {
      api.getCandleflipHistory(20).then(r => setHistory(r.games || [])).catch(() => {});
    }
  }, [tab, userId]);

  const handleCreate = async () => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading) return;
    setError(''); setLoading(true);
    playButtonClick(); hapticLight();
    try {
      await api.createCandleflipGame(betAmount, pick);
      fetchLobbies();
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
      setTimeout(() => setError(''), 3000);
    } finally { setLoading(false); }
  };

  const handleJoin = async (gameId: string) => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading) return;
    setError(''); setLoading(true);
    playBetPlaced(); hapticMedium();
    try {
      const res = await api.joinCandleflipGame(gameId);
      const game = res.game as GameResult;
      setActiveGame(game);
      setAnimating(true);
      setTimeout(() => {
        setAnimating(false);
        setShowResult(true);
        syncProfile();
        playRoundEnd(game.winnerId === userId);
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to join');
      setTimeout(() => setError(''), 3000);
    } finally { setLoading(false); }
  };

  const handleCancel = async (gameId: string) => {
    try {
      await api.cancelCandleflipGame(gameId);
      fetchLobbies(); syncProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Candle animation for result
  const drawCandle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeGame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const multiplier = parseFloat(activeGame.resultMultiplier);
    const isBullish = activeGame.result === 'bullish';
    const color = isBullish ? '#34d399' : '#f87171';

    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(0, 0, w, h);

    const midY = h * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.textAlign = 'right';
    ctx.fillText('1.00x', w - 8, midY - 6);

    const candleW = w * 0.35;
    const candleX = (w - candleW) / 2;
    const range = 0.5;
    const openY = midY;
    const closeY = midY - ((multiplier - 1.0) / range) * (h * 0.4);
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.abs(closeY - openY);

    const wickExtend = bodyH * 0.4 + 10;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w / 2, bodyTop - wickExtend); ctx.lineTo(w / 2, bodyTop + bodyH + wickExtend); ctx.stroke();

    ctx.shadowColor = color; ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.fillRect(candleX, bodyTop, candleW, Math.max(4, bodyH));
    ctx.shadowBlur = 0;

    ctx.fillStyle = color;
    ctx.font = "900 32px 'JetBrains Mono', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(`${multiplier.toFixed(2)}x`, w / 2, h - 24);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = "700 14px system-ui";
    ctx.fillText(isBullish ? 'BULLISH' : 'BEARISH', w / 2, h - 6);
  }, [activeGame]);

  useEffect(() => { if (animating || showResult) drawCandle(); }, [animating, showResult, drawCandle]);

  const resetGame = () => {
    setActiveGame(null);
    setShowResult(false);
    setAnimating(false);
    fetchLobbies();
  };

  // ─── RESULT OVERLAY ───
  if (showResult && activeGame) {
    const won = activeGame.winnerId === userId;
    return (
      <div style={s.root} className="screen-enter">
        <button style={s.backBtn} onClick={resetGame} className="hover-bright">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '2px' }}>
            {won ? 'YOU WON!' : 'YOU LOST'}
          </div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: won ? '#34d399' : '#f87171', marginTop: '4px' }}>
            {won ? `+${formatSol(activeGame.prizeAmount - activeGame.betAmount)}` : `-${formatSol(activeGame.betAmount)}`} SOL
          </div>
        </div>
        <canvas ref={canvasRef} style={{ width: '100%', height: '200px', borderRadius: '12px' }} />
        <div style={{ ...s.resultCard, borderColor: activeGame.result === 'bullish' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: theme.text.muted }}>Result</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: activeGame.result === 'bullish' ? '#34d399' : '#f87171' }}>
              {parseFloat(activeGame.resultMultiplier).toFixed(2)}x {activeGame.result === 'bullish' ? 'BULLISH' : 'BEARISH'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: theme.text.muted }}>Bet</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary }} className="mono">{formatSol(activeGame.betAmount)} SOL</span>
          </div>
          {activeGame.seed && (
            <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(119,23,255,0.06)', borderRadius: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: theme.text.muted, display: 'block', marginBottom: '4px' }}>SEED (Provably Fair)</span>
              <span style={{ fontSize: '10px', color: theme.text.muted, wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>{activeGame.seed}</span>
            </div>
          )}
        </div>
        <button style={s.playAgainBtn} onClick={resetGame} className="hover-scale">Play Again</button>
      </div>
    );
  }

  // ─── ANIMATING OVERLAY ───
  if (animating && activeGame) {
    return (
      <div style={s.root} className="screen-enter">
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>Flipping...</div>
          <div style={{ fontSize: '14px', color: theme.text.muted, marginTop: '4px' }}>Over/Under 1.00x</div>
        </div>
        <canvas ref={canvasRef} style={{ width: '100%', height: '260px', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <div style={s.root} className="screen-enter">
      {/* Header */}
      <div style={s.headerSection}>
        <button style={s.backBtn} onClick={() => go('lobby')} className="hover-bright">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={s.headerText}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ ...s.headerIcon, background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.2)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
                <rect x="4" y="8" width="16" height="8" rx="2" /><path d="M12 4v4" /><path d="M12 16v4" />
              </svg>
            </div>
            <h1 style={s.title}>Candleflip</h1>
          </div>
          <p style={s.subtitle}>Over/Under 1.00x — Pick Bullish or Bearish</p>
        </div>
      </div>

      {error && <div style={s.errorMsg} className="screen-enter">{error}</div>}

      {/* LIVE SPECTATOR CHART */}
      <LiveFlipChart recentResults={recentResults} />

      {/* Recent results strip */}
      {recentResults.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {recentResults.slice(0, 12).map((r: any) => {
            const mult = parseFloat(r.resultMultiplier || '1');
            const isBull = r.result === 'bullish';
            return (
              <div key={r.id} style={{
                padding: '4px 10px', borderRadius: '8px', flexShrink: 0,
                background: isBull ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${isBull ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: isBull ? '#34d399' : '#f87171' }}>
                  {isBull ? '\u25B2' : '\u25BC'}
                </span>
                <span className="mono" style={{
                  fontSize: '11px', fontWeight: 800,
                  color: isBull ? '#34d399' : '#f87171',
                }}>
                  {mult.toFixed(2)}x
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabRow}>
        {(['play', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
            onClick={() => { setTab(t); playButtonClick(); }}
          >
            {t === 'play' ? 'Play' : 'My History'}
          </button>
        ))}
      </div>

      {tab === 'play' && (
        <>
          {/* Pick */}
          <div style={s.sectionLabel}>Pick Your Trend</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{ ...s.pickBtn, ...(pick === 'bullish' ? { background: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.4)', color: '#34d399' } : {}) }}
              onClick={() => { setPick('bullish'); playButtonClick(); }}
              className="hover-scale"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
              BULLISH
            </button>
            <button
              style={{ ...s.pickBtn, ...(pick === 'bearish' ? { background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.4)', color: '#f87171' } : {}) }}
              onClick={() => { setPick('bearish'); playButtonClick(); }}
              className="hover-scale"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
              BEARISH
            </button>
          </div>

          {/* Bet */}
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
            style={s.createBtn}
            onClick={handleCreate}
            disabled={loading || betAmount <= 0}
            className="hover-scale"
          >
            {loading ? 'Creating...' : 'Create Game'}
          </button>

          {/* Open Lobbies */}
          <div style={{ ...s.sectionLabel, marginTop: '4px' }}>
            <span>Open Lobbies</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: theme.text.muted }}>{lobbies.length} open</span>
          </div>

          {lobbies.length === 0 ? (
            <div style={s.emptyState}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>No open lobbies</span>
              <span style={{ fontSize: '12px', color: theme.text.muted }}>Create one and wait for an opponent!</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lobbies.map(lobby => {
                const isOwn = lobby.creatorId === userId;
                const pickColor = lobby.creatorPick === 'bullish' ? '#34d399' : '#f87171';
                return (
                  <div key={lobby.id} style={s.lobbyCard} className="card-enter">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: getAvatarGradient(lobby.creatorAvatar, lobby.creatorUsername || '?'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {getInitials(lobby.creatorUsername || '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lobby.creatorUsername || 'Player'}</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: pickColor, padding: '2px 6px', background: `${pickColor}15`, borderRadius: '4px', flexShrink: 0 }}>
                            {lobby.creatorPick === 'bullish' ? 'BULL' : 'BEAR'}
                          </span>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24' }} className="mono">{formatSol(lobby.betAmount)} SOL</span>
                      </div>
                    </div>
                    {isOwn ? (
                      <button style={s.cancelBtn} onClick={() => handleCancel(lobby.id)} className="hover-bright">Cancel</button>
                    ) : (
                      <button style={s.joinBtn} onClick={() => handleJoin(lobby.id)} disabled={loading} className="hover-scale">JOIN</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!isAuthenticated ? (
            <div style={s.emptyState}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>Sign in to see your history</span>
              <button style={{ ...s.joinBtn, marginTop: '8px' }} onClick={() => go('auth')}>Sign In</button>
            </div>
          ) : history.length === 0 ? (
            <div style={s.emptyState}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>No games yet</span>
            </div>
          ) : history.map(g => {
            const won = g.winnerId === userId;
            const mult = parseFloat(g.resultMultiplier || '1');
            return (
              <div key={g.id} style={s.historyCard}>
                <CandleflipChart multiplier={mult} isBullish={g.result === 'bullish'} width={60} height={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: g.result === 'bullish' ? '#34d399' : '#f87171' }}>
                      {mult.toFixed(2)}x {g.result === 'bullish' ? 'BULLISH' : 'BEARISH'}
                    </span>
                    <span style={{ fontSize: '11px', color: theme.text.muted }}>{new Date(g.resolvedAt).toLocaleDateString()}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: theme.text.muted }} className="mono">{formatSol(g.betAmount)} SOL bet</span>
                </div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: won ? '#34d399' : '#f87171' }} className="mono">
                  {won ? `+${formatSol(g.prizeAmount - g.betAmount)}` : `-${formatSol(g.betAmount)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: '12px',
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
  tabRow: { display: 'flex', gap: '6px' },
  tabBtn: {
    flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '13px', fontWeight: 700, color: theme.text.muted, transition: 'all 0.15s',
  },
  tabBtnActive: {
    background: 'rgba(119,23,255,0.12)', borderColor: 'rgba(119,23,255,0.4)', color: '#c084fc',
  },
  sectionLabel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: '12px', fontWeight: 700, color: theme.text.muted,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  pickBtn: {
    flex: 1, padding: '16px 14px', borderRadius: '12px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    fontSize: '16px', fontWeight: 800, color: theme.text.muted, transition: 'all 0.15s',
    letterSpacing: '1px', minHeight: '56px',
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
  createBtn: {
    width: '100%', padding: '16px',
    background: 'linear-gradient(135deg, #7717ff, #886cff)',
    border: 'none', borderRadius: '14px', color: '#fff',
    fontSize: '16px', fontWeight: 800, cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 20px rgba(119, 23, 255, 0.3)',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px',
    padding: '32px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  lobbyCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`, gap: '10px',
  },
  joinBtn: {
    padding: '10px 24px', background: theme.accent.purple, border: 'none', borderRadius: '10px',
    color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s', letterSpacing: '1px', flexShrink: 0,
  },
  cancelBtn: {
    padding: '10px 18px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: '10px', color: '#f87171', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  },
  resultCard: {
    padding: '16px', borderRadius: '12px', background: theme.bg.secondary,
    border: '1px solid',
  },
  playAgainBtn: {
    padding: '14px', background: theme.accent.purple, border: 'none', borderRadius: '12px',
    color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s', marginTop: '8px',
  },
  historyCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
    padding: '12px 14px', background: theme.bg.secondary, borderRadius: '10px',
    border: `1px solid ${theme.border.subtle}`,
  },
};
