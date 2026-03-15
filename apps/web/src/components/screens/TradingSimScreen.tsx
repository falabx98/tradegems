import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { playButtonClick, playBetPlaced, playRoundEnd, hapticLight, hapticMedium } from '../../utils/sounds';
import { LiveDot, LiveRoundBanner, StatusBadge, WinAmountDisplay, timeAgo } from '../ui/LiveIndicators';
import { BetPanel } from '../ui/BetPanel';

interface Candle { open: number; high: number; low: number; close: number; volume: number; timestamp: number; }
interface Participant { id: string; userId: string; username?: string; startBalance: number; finalBalance?: number; finalPnl?: number; rank?: number; }
interface Room { id: string; entryFee: number; maxPlayers: number; currentPlayers: number; status: string; chartData?: Candle[]; duration: number; startedAt?: string; endedAt?: string; winnerId?: string; prizePool: number; participants?: Participant[]; }
type View = 'list' | 'game' | 'result';

const ENTRY_TIERS = [
  { fee: 100_000_000, label: '0.1', color: '#2ecc71', gradient: 'linear-gradient(135deg, #064e3b, #059669)', icon: '💹' },
  { fee: 250_000_000, label: '0.25', color: '#60a5fa', gradient: 'linear-gradient(135deg, #172554, #1d4ed8)', icon: '📊' },
  { fee: 500_000_000, label: '0.5', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #78350f, #d97706)', icon: '🏆' },
];

// ─── LIVE SPECTATOR CHART: Simulated trading round always running ───
function LiveTradingChart({ rooms, recentRooms }: { rooms: any[]; recentRooms: any[] }) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }>>([]);
  const phaseRef = useRef<'trading' | 'result'>('trading');
  const [phase, setPhase] = useState<'trading' | 'result'>('trading');
  const [timeLeft, setTimeLeft] = useState(60);
  const [pnl, setPnl] = useState(0);

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

    const candles = candlesRef.current;
    if (candles.length === 0) {
      // Waiting state
      ctx.fillStyle = '#2ecc71';
      ctx.font = `900 ${isMobile ? 18 : 24}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(46,204,113,0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('TRADING ARENA', w / 2, h * 0.4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${isMobile ? 12 : 14}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Live PvP Trading Competition', w / 2, h * 0.4 + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 11 : 12}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('60 seconds • Most profit wins', w / 2, h * 0.4 + 48);
      return;
    }

    const pad = { top: 30, bottom: 20, left: 10, right: isMobile ? 44 : 52 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Price range
    const prices = candles.flatMap(c => [c.h, c.l]);
    const pMin = Math.min(...prices) * 0.998;
    const pMax = Math.max(...prices) * 1.002;
    const pRange = pMax - pMin || 1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const val = pMin + (pRange / 4) * (4 - i);
      const y = toY(val);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`$${val.toFixed(1)}`, w - 4, y + 3);
    }

    // Draw candles
    const maxVisible = isMobile ? 40 : 60;
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visible = candles.slice(startIdx);
    const spacing = chartW / Math.max(visible.length, 20);
    const cw = Math.max(3, spacing * 0.6);

    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#2ecc71' : '#f87171';
      ctx.strokeStyle = color; ctx.lineWidth = isMobile ? 1 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
      const bTop = toY(Math.max(c.o, c.c));
      const bBot = toY(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - cw / 2, bTop, cw, Math.max(2, bBot - bTop));
    }

    // Current price line
    if (candles.length > 0) {
      const lastC = candles[candles.length - 1];
      const priceY = toY(lastC.c);
      const isUp = lastC.c >= candles[0].o;
      const lineColor = isUp ? '#2ecc71' : '#f87171';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, priceY); ctx.lineTo(w - pad.right, priceY); ctx.stroke();
      ctx.setLineDash([]);

      // Price tag
      ctx.fillStyle = lineColor;
      ctx.font = `700 ${isMobile ? 10 : 11}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`$${lastC.c.toFixed(2)}`, w - 4, priceY - 4);
    }

    // Top info
    const currentPhase = phaseRef.current;
    if (currentPhase === 'trading') {
      ctx.fillStyle = '#2ecc71';
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.textAlign = 'left';
      ctx.fillText('\u25CF LIVE ROUND', pad.left + 4, 16);
    } else {
      ctx.fillStyle = '#8b5cf6';
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.textAlign = 'left';
      ctx.fillText('ROUND COMPLETE', pad.left + 4, 16);
    }
  }, [isMobile]);

  // Auto-cycle trading rounds
  useEffect(() => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const startRound = () => {
      if (cancelled) return;
      phaseRef.current = 'trading';
      setPhase('trading');
      candlesRef.current = [];
      setTimeLeft(60);
      setPnl(0);
      draw();

      let price = 90 + Math.random() * 20; // $90-$110 start
      let sec = 0;
      const totalSec = 60;
      const drift = (Math.random() - 0.5) * 0.3; // slight trend

      const buildInt = setInterval(() => {
        if (cancelled || sec >= totalSec) {
          clearInterval(buildInt);
          if (cancelled) return;

          // Show result
          phaseRef.current = 'result';
          setPhase('result');
          const startP = candlesRef.current[0]?.o || 100;
          const endP = price;
          setPnl(((endP - startP) / startP) * 100);
          draw();

          // After 5s, next round
          const nextTO = setTimeout(() => {
            if (!cancelled) startRound();
          }, 5000);
          timeouts.push(nextTO);
          return;
        }

        // Generate candle
        const open = price;
        const vol = 0.5 + Math.random() * 1.5;
        const noise = (Math.random() - 0.5) * vol;
        const close = open + drift + noise;
        const high = Math.max(open, close) + Math.random() * vol * 0.5;
        const low = Math.min(open, close) - Math.random() * vol * 0.5;
        candlesRef.current.push({ o: open, h: high, l: low, c: close });
        price = close;
        sec++;
        setTimeLeft(totalSec - sec);
        draw();
      }, 500); // 500ms per candle = 30 seconds for full round visually
      intervals.push(buildInt);
    };

    startRound();
    return () => {
      cancelled = true;
      timeouts.forEach(t => clearTimeout(t));
      intervals.forEach(i => clearInterval(i));
    };
  }, []);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const chartHeight = isMobile ? 200 : 260;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${chartHeight}px`, display: 'block', borderRadius: '12px' }}
        />
        {/* Timer overlay */}
        {phase === 'trading' && (
          <div style={{
            position: 'absolute', top: '6px', right: '8px',
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '8px',
            background: 'rgba(0,0,0,0.6)', backdropFilter: '',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: timeLeft <= 10 ? '#f87171' : '#fff' }}>{timeLeft}s</span>
          </div>
        )}
        {phase === 'result' && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            textAlign: 'center', padding: '12px 24px', borderRadius: '12px',
            background: 'rgba(0,0,0,0.7)', backdropFilter: '',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>Round Complete</div>
            <div className="mono" style={{ fontSize: '22px', fontWeight: 900, color: pnl >= 0 ? '#2ecc71' : '#f87171', marginTop: '2px' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Active rooms indicator */}
      {rooms.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {rooms.slice(0, 6).map((r: any) => {
            const tier = ENTRY_TIERS.find(t => t.fee === Number(r.entryFee)) || ENTRY_TIERS[0];
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '5px 10px', background: theme.bg.secondary, borderRadius: '8px',
                border: `1px solid ${theme.border.subtle}`, flexShrink: 0,
              }}>
                <span style={{ fontSize: '12px' }}>{tier.icon}</span>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: tier.color }}>
                  {tier.label} SOL
                </span>
                <span style={{ fontSize: '10px', color: theme.text.muted }}>{r.currentPlayers}/{r.maxPlayers}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TradingSimScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const syncProfile = useGameStore((s) => s.syncProfile);
  const profile = useGameStore((s) => s.profile);
  const userId = useAuthStore((s) => s.userId);
  const [view, setView] = useState<View>('list');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentRooms, setRecentRooms] = useState<any[]>([]);
  const [entryAmount, setEntryAmount] = useState(0);

  // Game state
  const [position, setPosition] = useState(0);
  const [cash, setCash] = useState(10000);
  const [currentPrice, setCurrentPrice] = useState(100);
  const [elapsed, setElapsed] = useState(0);
  const [visibleCandles, setVisibleCandles] = useState<Candle[]>([]);
  const [buyQty, setBuyQty] = useState(25); // percentage of cash
  const [tradeFlash, setTradeFlash] = useState<'buy' | 'sell' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  const fetchRooms = async () => {
    try {
      const res = await api.getTradingSimRooms();
      setRooms(res.rooms || []);
    } catch { /* ignore */ }
  };

  const fetchRecent = async () => {
    try {
      const res = await api.getTradingSimRecent(15);
      setRecentRooms(res.rooms || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchRooms();
    fetchRecent();
    const interval = setInterval(() => { fetchRooms(); fetchRecent(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (entryFee: number) => {
    if (!userId) { go('auth'); return; }
    setError(''); setLoading(true);
    playButtonClick(); hapticLight();
    try {
      const res = await api.createTradingSimRoom(entryFee, 2);
      setActiveRoom(res.room); setView('game'); startPolling(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
      setTimeout(() => setError(''), 3000);
    } finally { setLoading(false); }
  };

  const handleJoinRoom = async () => {
    await handleCreate(entryAmount);
  };

  const handleJoin = async (roomId: string) => {
    if (!userId) { go('auth'); return; }
    setError(''); setLoading(true);
    playButtonClick(); hapticLight();
    try {
      const res = await api.joinTradingSimRoom(roomId);
      setActiveRoom(res.room); setView('game'); startPolling(roomId);
    } catch (err: any) {
      setError(err.message || 'Failed to join');
      setTimeout(() => setError(''), 3000);
    } finally { setLoading(false); }
  };

  const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const confettiRaf = useRef<number>(0);

  const startPolling = (roomId: string) => {
    // Clear any existing polling interval first
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Clear any existing countdown timers
    countdownTimers.current.forEach(t => clearTimeout(t));
    countdownTimers.current = [];

    let prevStatus = '';
    const poll = async () => {
      try {
        const res = await api.getTradingSimRoom(roomId);
        const room = res.room as Room;
        setActiveRoom(room);

        // Countdown when transitioning to active
        if (room.status === 'active' && prevStatus === 'waiting') {
          setCountdown(3);
          countdownTimers.current = [
            setTimeout(() => setCountdown(2), 1000),
            setTimeout(() => setCountdown(1), 2000),
            setTimeout(() => setCountdown(null), 3000),
          ];
        }
        prevStatus = room.status;

        if (room.status === 'active' && room.chartData) {
          const startTime = new Date(room.startedAt!).getTime();
          const now = Date.now();
          const elapsedSec = Math.floor((now - startTime) / 1000);
          setElapsed(elapsedSec);
          const visible = room.chartData.filter((c: Candle) => c.timestamp <= elapsedSec);
          setVisibleCandles(visible);
          if (visible.length > 0) setCurrentPrice(visible[visible.length - 1].close);
          if (elapsedSec >= room.duration) {
            setView('result'); syncProfile(); playRoundEnd(true);
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          }
        }
        if (room.status === 'finished') {
          setView('result'); syncProfile(); playRoundEnd(room.winnerId === userId);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        }
      } catch { /* ignore */ }
    };
    poll();
    timerRef.current = setInterval(poll, 1000);
  };

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      countdownTimers.current.forEach(t => clearTimeout(t));
      cancelAnimationFrame(confettiRaf.current);
    };
  }, []);

  // Draw chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || visibleCandles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(0, 0, w, h);

    const prices = visibleCandles.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices) * 0.998;
    const maxP = Math.max(...prices) * 1.002;
    const range = maxP - minP || 1;
    const pad = { top: 20, bottom: 30, left: 10, right: 55 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Grid lines
    const gridLines = 5;
    ctx.strokeStyle = 'rgba(0, 220, 130, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      // Y-axis labels
      const price = maxP - (range / gridLines) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`$${price.toFixed(1)}`, w - 6, y + 3);
    }
    ctx.setLineDash([]);

    // Candles
    const totalCandles = activeRoom?.duration ? Math.ceil(activeRoom.duration / 1) : 60;
    const candleW = Math.max(2, (chartW / totalCandles) - 1);
    const gap = (chartW - candleW * visibleCandles.length) / Math.max(1, visibleCandles.length);

    visibleCandles.forEach((c, i) => {
      const x = pad.left + i * (candleW + Math.max(1, gap / visibleCandles.length * i > 0 ? 1 : 0));
      const xPos = pad.left + (chartW / totalCandles) * i;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#2ecc71' : '#f87171';

      const highY = pad.top + ((maxP - c.high) / range) * chartH;
      const lowY = pad.top + ((maxP - c.low) / range) * chartH;
      const openY = pad.top + ((maxP - c.open) / range) * chartH;
      const closeY = pad.top + ((maxP - c.close) / range) * chartH;

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos + candleW / 2, highY);
      ctx.lineTo(xPos + candleW / 2, lowY);
      ctx.stroke();

      // Body with glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.fillStyle = color;
      ctx.fillRect(xPos, Math.min(openY, closeY), candleW, Math.max(1, Math.abs(closeY - openY)));
      ctx.shadowBlur = 0;
    });

    // Current price line
    if (visibleCandles.length > 0) {
      const lastPrice = visibleCandles[visibleCandles.length - 1].close;
      const priceY = pad.top + ((maxP - lastPrice) / range) * chartH;
      const isUp = lastPrice >= visibleCandles[0].open;
      const lineColor = isUp ? '#2ecc71' : '#f87171';

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, priceY);
      ctx.lineTo(w - pad.right, priceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label
      ctx.fillStyle = lineColor;
      ctx.fillRect(w - pad.right, priceY - 9, pad.right, 18);
      ctx.fillStyle = '#000';
      ctx.font = `700 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`$${lastPrice.toFixed(1)}`, w - pad.right / 2, priceY + 4);
    }
  }, [visibleCandles, isMobile, activeRoom]);

  useEffect(() => { drawChart(); }, [drawChart]);

  // Confetti effect
  const runConfetti = useCallback(() => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const colors = ['#2ecc71', '#8b5cf6', '#a78bfa', '#3b82f6', '#5b8def', '#f472b6'];
    const particles: { x: number; y: number; vx: number; vy: number; color: string; alpha: number; size: number; }[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.offsetWidth / 2, y: canvas.offsetHeight / 2,
        vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12 - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1, size: Math.random() * 5 + 2,
      });
    }
    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.alpha -= 0.006;
        if (p.alpha <= 0) return;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });
      ctx.globalAlpha = 1;
      if (++frame < 200) confettiRaf.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  useEffect(() => {
    if (view === 'result' && activeRoom?.winnerId === userId) {
      setTimeout(() => runConfetti(), 300);
    }
  }, [view, activeRoom, userId, runConfetti]);

  const handleBuy = async () => {
    if (!activeRoom) return;
    const spendAmount = cash * (buyQty / 100);
    const qty = Math.floor(spendAmount / currentPrice);
    if (qty <= 0) return;
    setPosition(p => p + qty);
    setCash(c => c - qty * currentPrice);
    setTradeFlash('buy');
    playBetPlaced(); hapticMedium();
    setTimeout(() => setTradeFlash(null), 400);
    try { await api.executeTradingSimTrade(activeRoom.id, 'buy', qty, currentPrice, elapsed); } catch { /* ignore */ }
  };

  const handleSell = async () => {
    if (!activeRoom || position <= 0) return;
    const sellQty = Math.ceil(position * (buyQty / 100));
    if (sellQty <= 0) return;
    setCash(c => c + sellQty * currentPrice);
    setPosition(p => p - sellQty);
    setTradeFlash('sell');
    playBetPlaced(); hapticMedium();
    setTimeout(() => setTradeFlash(null), 400);
    try { await api.executeTradingSimTrade(activeRoom.id, 'sell', sellQty, currentPrice, elapsed); } catch { /* ignore */ }
  };

  const pnl = cash + position * currentPrice - 10000;
  const pnlPercent = (pnl / 10000 * 100).toFixed(1);

  // ─── LIST VIEW ───
  if (view === 'list') {
    return (
      <div style={s.root} className="screen-enter">
        {/* Header */}
        <div style={s.headerSection}>
          <button style={s.backBtn} onClick={() => go('lobby')} className="hover-bright">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div style={s.headerText}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={s.headerIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <h1 style={s.title}>Trading Arena</h1>
            </div>
            <p style={s.subtitle}>Compete in real-time PvP trading • Most profit wins the pot</p>
          </div>
        </div>

        {error && <div style={s.errorMsg} className="screen-enter">{error}</div>}

        {/* LIVE SPECTATOR CHART */}
        <LiveTradingChart rooms={rooms} recentRooms={recentRooms} />

        {/* How it works */}
        <div style={s.howItWorks}>
          <div style={s.howStep}>
            <span style={s.howIcon}>🎮</span>
            <span style={s.howLabel}>Join Room</span>
          </div>
          <div style={s.howDivider} />
          <div style={s.howStep}>
            <span style={s.howIcon}>📈</span>
            <span style={s.howLabel}>Trade 60s</span>
          </div>
          <div style={s.howDivider} />
          <div style={s.howStep}>
            <span style={s.howIcon}>💰</span>
            <span style={s.howLabel}>Win Pot</span>
          </div>
        </div>

        {/* Create Room */}
        <div style={s.sectionLabel}>
          <span>Create Room</span>
          <span style={s.sectionHint}>Choose entry fee</span>
        </div>
        <BetPanel
          presets={[
            { label: '0.1', lamports: 100_000_000 },
            { label: '0.25', lamports: 250_000_000 },
            { label: '0.5', lamports: 500_000_000 },
          ]}
          selectedAmount={entryAmount}
          onAmountChange={setEntryAmount}
          balance={profile.balance}
          allowCustom={false}
          showModifiers={false}
          submitLabel="JOIN ROOM"
          onSubmit={handleJoinRoom}
          submitDisabled={entryAmount <= 0}
          submitLoading={loading}
        />

        {/* Available Rooms */}
        <div style={s.sectionLabel}>
          <span>Available Rooms</span>
          <span style={s.sectionHint}>{rooms.length} open</span>
        </div>
        {rooms.length === 0 ? (
          <div style={s.emptyState}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
            <span style={s.emptyText}>No Active Rooms</span>
            <span style={s.emptyHint}>Be the first! Create a room above and wait for opponents to join.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
            {rooms.map((room) => {
              const tier = ENTRY_TIERS.find(t => t.fee === Number(room.entryFee)) || ENTRY_TIERS[0];
              return (
                <div key={room.id} style={s.roomCard} className="card-enter">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ ...s.roomBadge, background: `${tier.color}15`, borderColor: `${tier.color}30` }}>
                      <span className="mono" style={{ color: tier.color, fontWeight: 700, fontSize: '14px' }}>{tier.label}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px' }}>
                      <span style={s.roomFee} className="mono">{tier.label} SOL Entry</span>
                      {room.status === 'waiting' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <LiveDot size={6} color={tier.color} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: tier.color }}>Waiting for players</span>
                        </div>
                      )}
                      <div style={s.roomPlayersRow}>
                        {Array.from({ length: room.maxPlayers }).map((_, i) => (
                          <div key={i} style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: i < room.currentPlayers ? getAvatarGradient(null, `p${i}`) : 'rgba(255,255,255,0.05)',
                            border: i < room.currentPlayers ? '2px solid rgba(255,255,255,0.2)' : '2px dashed rgba(255,255,255,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '8px', fontWeight: 700, color: '#fff', marginLeft: i > 0 ? '-4px' : '0',
                          }}>
                            {i < room.currentPlayers ? '•' : ''}
                          </div>
                        ))}
                        <span style={s.roomPlayerCount}>{room.currentPlayers}/{room.maxPlayers}</span>
                      </div>
                    </div>
                  </div>
                  <button style={{ ...s.joinBtn, boxShadow: `0 0 12px ${tier.color}30` }} onClick={() => handleJoin(room.id)} disabled={loading} className="hover-scale">
                    JOIN
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Finished Games — prominent */}
        <div style={{
          background: theme.bg.secondary, borderRadius: '12px',
          border: `1px solid ${theme.border.subtle}`, overflow: 'hidden',
        }}>
          <LiveRoundBanner title="Recent Games" accentColor="#0d9488" count={recentRooms.length} />
          {recentRooms.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center' as const }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>No finished games yet</span>
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {recentRooms.map((room: any) => {
                const tier = ENTRY_TIERS.find(t => t.fee === Number(room.entryFee)) || ENTRY_TIERS[0];
                return (
                  <div key={room.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', borderBottom: `1px solid ${theme.border.subtle}`,
                    borderLeft: '3px solid #0d9488',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '8px', flexShrink: 0,
                      background: tier.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px',
                    }}>
                      {tier.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {room.winnerUsername ? (
                          <>
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                              background: getAvatarGradient(null, room.winnerUsername),
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '7px', fontWeight: 700, color: '#fff',
                            }}>{getInitials(room.winnerUsername)}</div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {room.winnerUsername}
                            </span>
                            <StatusBadge status="winner" />
                          </>
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text.muted }}>No winner</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.text.muted, marginTop: '2px' }}>
                        {room.currentPlayers} players
                        {room.endedAt ? ` · ${timeAgo(room.endedAt)}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#00dc82' }} className="mono">
                        {formatSol(room.prizePool)}
                      </div>
                      <div style={{ fontSize: '10px', color: theme.text.muted }}>SOL pot</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── GAME VIEW ───
  if (view === 'game' && activeRoom) {
    const timeLeft = Math.max(0, activeRoom.duration - elapsed);
    const isWaiting = activeRoom.status === 'waiting';
    const timeProgress = activeRoom.duration > 0 ? (elapsed / activeRoom.duration) * 100 : 0;

    return (
      <div style={s.gameRoot}>
        {/* Countdown Overlay */}
        {countdown !== null && (
          <div style={s.countdownOverlay}>
            <span style={s.countdownNumber}>{countdown}</span>
            <span style={s.countdownLabel}>Get Ready!</span>
          </div>
        )}

        {/* Trade flash */}
        {tradeFlash && (
          <div style={{
            ...s.tradeFlashOverlay,
            background: tradeFlash === 'buy' ? 'rgba(46,204,113,0.08)' : 'rgba(248,113,113,0.08)',
            borderColor: tradeFlash === 'buy' ? 'rgba(46,204,113,0.3)' : 'rgba(248,113,113,0.3)',
          }} />
        )}

        {/* Top HUD */}
        <div style={s.hud}>
          <div style={s.hudLeft}>
            {isWaiting ? (
              <div style={s.waitingPill}>
                <div style={s.waitingDot} />
                <span style={s.waitingText}>Waiting {activeRoom.currentPlayers}/{activeRoom.maxPlayers}</span>
              </div>
            ) : (
              <div style={s.timerPill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span className="mono" style={{ color: timeLeft <= 10 ? '#f87171' : '#fff', fontWeight: 700, fontSize: '15px' }}>{timeLeft}s</span>
              </div>
            )}
          </div>

          <div style={s.hudCenter}>
            <span style={{ ...s.pnlHero, color: pnl >= 0 ? '#2ecc71' : '#f87171', textShadow: `0 0 20px ${pnl >= 0 ? 'rgba(46,204,113,0.4)' : 'rgba(248,113,113,0.4)'}` }} className="mono">
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: pnl >= 0 ? 'rgba(46,204,113,0.7)' : 'rgba(248,113,113,0.7)' }} className="mono">
              {pnl >= 0 ? '+' : ''}{pnlPercent}%
            </span>
          </div>

          <div style={s.hudRight}>
            <div style={s.prizePill}>
              <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
              <span className="mono" style={{ color: '#00dc82', fontWeight: 700, fontSize: '13px' }}>{formatSol(activeRoom.prizePool)}</span>
            </div>
          </div>
        </div>

        {/* Timer progress bar */}
        {!isWaiting && (
          <div style={s.timerBar}>
            <div style={{ ...s.timerBarFill, width: `${Math.min(100, timeProgress)}%`, background: timeLeft <= 10 ? '#f87171' : '#8b5cf6' }} />
          </div>
        )}

        {/* Chart */}
        <div style={s.chartContainer}>
          <canvas ref={canvasRef} style={s.canvas} />
          {isWaiting && (
            <div style={s.chartWaitingOverlay}>
              <div style={s.waitingSpinner} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Waiting for players...</span>
              <span style={{ fontSize: '13px', color: theme.text.muted }}>{activeRoom.currentPlayers}/{activeRoom.maxPlayers} joined</span>
              <button
                style={{ marginTop: '12px', padding: '10px 28px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={async () => {
                  try {
                    await api.startTradingSimRoom(activeRoom.id);
                    playButtonClick(); hapticLight();
                  } catch { /* will be picked up by polling */ }
                }}
                className="hover-scale"
              >
                Start Now
              </button>
            </div>
          )}
        </div>

        {/* Price + Position bar */}
        <div style={s.infoBar}>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>Price</span>
            <span style={s.infoValue} className="mono">${currentPrice.toFixed(2)}</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>Cash</span>
            <span style={s.infoValue} className="mono">${cash.toFixed(0)}</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>Position</span>
            <span style={s.infoValue} className="mono">{position} u</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>Value</span>
            <span style={{ ...s.infoValue, color: pnl >= 0 ? '#2ecc71' : '#f87171' }} className="mono">${(cash + position * currentPrice).toFixed(0)}</span>
          </div>
        </div>

        {/* Quantity selector */}
        <div style={s.qtyRow}>
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              style={{ ...s.qtyBtn, ...(buyQty === pct ? s.qtyBtnActive : {}) }}
              onClick={() => { setBuyQty(pct); playButtonClick(); }}
            >
              <span className="mono" style={{ fontSize: '13px', fontWeight: 700 }}>{pct}%</span>
            </button>
          ))}
        </div>

        {/* Trade buttons */}
        <div style={s.tradeButtons}>
          <button
            style={{ ...s.buyBtn, opacity: (isWaiting || cash < currentPrice) ? 0.4 : 1 }}
            onClick={handleBuy}
            disabled={isWaiting || cash < currentPrice}
            className="hover-scale"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
            BUY
          </button>
          <button
            style={{ ...s.sellBtn, opacity: (isWaiting || position <= 0) ? 0.4 : 1 }}
            onClick={handleSell}
            disabled={isWaiting || position <= 0}
            className="hover-scale"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
            SELL
          </button>
        </div>

        {/* Live Leaderboard */}
        <div style={s.leaderboard}>
          <span style={s.leaderTitle}>LIVE RANKINGS</span>
          {(activeRoom.participants || []).map((p, i) => {
            const isMe = p.userId === userId;
            return (
              <div key={p.id} style={{ ...s.leaderRow, ...(isMe ? { background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.3)' } : {}) }}>
                <span style={s.leaderRank}>#{i + 1}</span>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: getAvatarGradient(null, p.username || '?'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '8px', fontWeight: 700, color: '#fff',
                  border: isMe ? '2px solid #8b5cf6' : '2px solid transparent',
                }}>{getInitials(p.username || '?')}</div>
                <span style={{ ...s.leaderName, ...(isMe ? { color: '#fff' } : {}) }}>{isMe ? 'You' : (p.username || 'Player')}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── RESULT VIEW ───
  if (view === 'result' && activeRoom) {
    const sorted = [...(activeRoom.participants || [])].sort((a, b) => (b.finalPnl || 0) - (a.finalPnl || 0));
    const isWinner = activeRoom.winnerId === userId;

    return (
      <div style={s.root} className="screen-enter">
        <canvas ref={confettiCanvasRef} style={s.confettiCanvas} />

        {/* Result header */}
        <div style={{ textAlign: 'center' as const, padding: '12px 0' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '2px' }}>
            {isWinner ? '🏆 VICTORY' : 'GAME OVER'}
          </span>
          <div style={{ fontSize: '28px', fontWeight: 800, color: isWinner ? '#00dc82' : theme.text.primary, marginTop: '4px' }}>
            {isWinner ? 'You Won!' : 'Results'}
          </div>
        </div>

        {/* Prize pool */}
        <div style={s.prizeCard}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const }}>Prize Pool</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: 24, height: 24 }} />
            <span className="mono" style={{ fontSize: '32px', fontWeight: 800, color: '#00dc82' }}>{formatSol(activeRoom.prizePool)}</span>
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>SOL</span>
          </div>
        </div>

        {/* Podium */}
        <div style={s.podiumGrid}>
          {sorted.map((p, i) => {
            const isMe = p.userId === userId;
            const rankColors = ['#8b5cf6', '#94a3b8', '#cd7f32'];
            const rankLabels = ['🥇', '🥈', '🥉'];
            return (
              <div key={p.id} style={{
                ...s.podiumCard,
                ...(i === 0 ? { border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.06)' } : {}),
                ...(isMe ? { boxShadow: '0 0 12px rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.3)' } : {}),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: i < 3 ? '20px' : '14px' }}>{i < 3 ? rankLabels[i] : `#${i + 1}`}</span>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: getAvatarGradient(null, p.username || '?'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, color: '#fff',
                    border: `2px solid ${rankColors[i] || theme.border.subtle}`,
                  }}>{getInitials(p.username || '?')}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: isMe ? '#fff' : theme.text.primary }}>
                      {isMe ? 'You' : (p.username || 'Player')}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '16px', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                    color: (p.finalPnl || 0) >= 0 ? '#2ecc71' : '#f87171',
                  }}>
                    {(p.finalPnl || 0) >= 0 ? '+' : ''}{(p.finalPnl || 0).toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            style={s.playAgainBtn}
            onClick={() => { setView('list'); setActiveRoom(null); setPosition(0); setCash(10000); setElapsed(0); setVisibleCandles([]); fetchRooms(); }}
            className="hover-scale"
          >
            Play Again
          </button>
          <button style={s.backLobbyBtn} onClick={() => go('lobby')} className="hover-bright">
            Lobby
          </button>
        </div>
      </div>
    );
  }

  return null;
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: '14px',
    padding: '16px', minHeight: '100%', boxSizing: 'border-box',
    maxWidth: '900px', margin: '0 auto', width: '100%',
    position: 'relative',
  },
  gameRoot: {
    display: 'flex', flexDirection: 'column', gap: '8px',
    padding: '12px', minHeight: '100%', boxSizing: 'border-box',
    maxWidth: '900px', margin: '0 auto', width: '100%',
    position: 'relative',
  },
  // Header
  headerSection: { display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: {
    width: 38, height: 38, borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  headerText: { flex: 1 },
  headerIcon: {
    width: 36, height: 36, borderRadius: '10px', background: 'rgba(46,204,113,0.1)',
    border: '1px solid rgba(46,204,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: '22px', fontWeight: 800, color: '#fff', margin: 0 },
  subtitle: { fontSize: '13px', color: theme.text.muted, margin: '4px 0 0' },
  errorMsg: {
    padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: '10px', color: '#f87171', fontSize: '14px', fontWeight: 600, textAlign: 'center' as const,
  },
  // How it works
  howItWorks: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
    padding: '14px 16px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  howStep: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px' },
  howIcon: { fontSize: '20px' },
  howLabel: { fontSize: '11px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  howDivider: { width: '30px', height: '1px', background: theme.border.subtle },
  // Section
  sectionLabel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: '12px', fontWeight: 700, color: theme.text.muted,
    textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  },
  sectionHint: { fontSize: '11px', fontWeight: 500, color: theme.text.muted, textTransform: 'none' as const },
  // Empty state
  emptyState: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px',
    padding: '32px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  emptyText: { fontSize: '15px', fontWeight: 700, color: theme.text.secondary },
  emptyHint: { fontSize: '13px', color: theme.text.muted },
  // Room card
  roomCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`, transition: 'all 0.15s',
  },
  roomBadge: {
    width: 44, height: 44, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid', flexShrink: 0,
  },
  roomFee: { fontSize: '15px', fontWeight: 700, color: theme.text.primary },
  roomPlayersRow: { display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' },
  roomPlayerCount: { fontSize: '11px', fontWeight: 600, color: theme.text.muted, marginLeft: '4px' },
  joinBtn: {
    padding: '10px 24px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)', border: 'none', borderRadius: '10px',
    color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s', letterSpacing: '1px',
  },
  // Game HUD
  hud: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    padding: '6px 0',
  },
  hudLeft: {},
  hudCenter: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  hudRight: {},
  timerPill: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', borderRadius: '20px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  },
  waitingPill: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 14px', borderRadius: '20px',
    background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
  },
  waitingDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6',
    animation: 'pulse 1.5s ease infinite',
  },
  waitingText: { fontSize: '13px', fontWeight: 600, color: theme.text.secondary },
  pnlHero: { fontSize: '28px', fontWeight: 900, lineHeight: 1 },
  prizePill: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', borderRadius: '20px',
    background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
  },
  // Timer bar
  timerBar: {
    height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden',
  },
  timerBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s linear' },
  // Chart
  chartContainer: {
    flex: 1, minHeight: '200px', position: 'relative' as const, borderRadius: '12px',
    overflow: 'hidden', border: `1px solid rgba(139,92,246,0.12)`,
  },
  canvas: { width: '100%', height: '100%', display: 'block' },
  chartWaitingOverlay: {
    position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: '12px',
    background: 'rgba(8,8,8,0.85)', backdropFilter: '',
  },
  waitingSpinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6',
    animation: 'spin 1s linear infinite',
  },
  // Info bar
  infoBar: {
    display: 'flex', gap: '6px',
  },
  infoItem: {
    flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px',
    padding: '8px 4px', background: theme.bg.secondary, borderRadius: '8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  infoLabel: { fontSize: '9px', fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase' as const },
  infoValue: { fontSize: '14px', fontWeight: 700, color: theme.text.primary },
  // Qty selector
  qtyRow: { display: 'flex', gap: '6px' },
  qtyBtn: {
    flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: theme.text.muted, transition: 'all 0.15s',
  },
  qtyBtnActive: {
    background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.4)', color: '#3b82f6',
  },
  // Trade buttons
  tradeButtons: { display: 'flex', gap: '10px' },
  buyBtn: {
    flex: 1, padding: '14px', background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.3)',
    borderRadius: '12px', color: '#2ecc71', fontSize: '16px', fontWeight: 800,
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '8px', transition: 'all 0.15s', letterSpacing: '1px',
  },
  sellBtn: {
    flex: 1, padding: '14px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: '12px', color: '#f87171', fontSize: '16px', fontWeight: 800,
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '8px', transition: 'all 0.15s', letterSpacing: '1px',
  },
  // Leaderboard
  leaderboard: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  leaderTitle: { fontSize: '10px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '2px' },
  leaderRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 10px', background: theme.bg.secondary, borderRadius: '8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  leaderRank: { fontSize: '11px', fontWeight: 700, color: theme.text.muted, width: '22px' },
  leaderName: { fontSize: '12px', fontWeight: 600, color: theme.text.secondary, flex: 1 },
  // Countdown
  countdownOverlay: {
    position: 'absolute' as const, inset: 0, zIndex: 50,
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '8px',
    background: 'rgba(17,17,20,0.88)', backdropFilter: '',
  },
  countdownNumber: {
    fontSize: '80px', fontWeight: 900, color: '#fff',
    textShadow: '0 0 30px rgba(139,92,246,0.6)',
    animation: 'pulse 1s ease infinite',
  },
  countdownLabel: { fontSize: '16px', fontWeight: 600, color: theme.text.muted },
  // Trade flash
  tradeFlashOverlay: {
    position: 'absolute' as const, inset: 0, zIndex: 40,
    pointerEvents: 'none' as const, border: '2px solid', borderRadius: '12px',
    animation: 'fadeIn 0.1s ease',
    transition: 'opacity 0.3s',
  },
  // Result
  confettiCanvas: {
    position: 'absolute' as const, inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none' as const, zIndex: 10,
  },
  prizeCard: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px',
    padding: '24px', borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(217,119,6,0.04))',
    border: '1px solid rgba(139,92,246,0.2)',
  },
  podiumGrid: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  podiumCard: {
    padding: '14px 16px', borderRadius: '12px',
    background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
  },
  playAgainBtn: {
    flex: 1, padding: '14px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)', border: 'none', borderRadius: '12px',
    color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  backLobbyBtn: {
    padding: '14px 24px', background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px', color: theme.text.secondary, fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
