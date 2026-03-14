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
import { LiveDot, MultiplierBadge, StatusBadge, LiveRoundBanner, timeAgo } from '../ui/LiveIndicators';

type GameStatus = 'idle' | 'playing' | 'cashed_out' | 'rugged';
type SpectatorPhase = 'presale' | 'live' | 'rugged';
interface CandleData { o: number; h: number; l: number; c: number; }

const BET_AMOUNTS = [
  { lamports: 10_000_000, label: '0.01' },
  { lamports: 50_000_000, label: '0.05' },
  { lamports: 100_000_000, label: '0.1' },
  { lamports: 250_000_000, label: '0.25' },
  { lamports: 500_000_000, label: '0.5' },
  { lamports: 1_000_000_000, label: '1' },
];

// Random rug multiplier with realistic distribution
function genRugMult(): number {
  const r = Math.random();
  if (r < 0.30) return 1.01 + Math.random() * 0.49; // 30% quick rug 1.01-1.50
  if (r < 0.55) return 1.50 + Math.random() * 1.50; // 25% 1.50-3.00
  if (r < 0.75) return 3.0 + Math.random() * 5.0;   // 20% 3.00-8.00
  if (r < 0.90) return 8.0 + Math.random() * 12.0;   // 15% 8.00-20.00
  return 20.0 + Math.random() * 30.0;                 // 10% moon 20-50
}

// ─── SPECTATOR CHART: Auto-cycling live candlestick chart ───
function SpectatorChart({ onBuy, liveGames, recentPublic }: {
  onBuy: () => void;
  liveGames: any[];
  recentPublic: any[];
}) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<CandleData[]>([]);
  const phaseRef = useRef<SpectatorPhase>('presale');
  const rugMultRef = useRef(genRugMult());
  const priceRef = useRef(1.0);
  const candleIdxRef = useRef(0);
  const totalCandlesRef = useRef(0);
  const roundHistRef = useRef<{ mult: number; time: number }[]>([]);
  const frameRef = useRef(0);

  const [phase, setPhase] = useState<SpectatorPhase>('presale');
  const [countdown, setCountdown] = useState(5);
  const [currentMult, setCurrentMult] = useState(1.0);
  const [rugMult, setRugMult] = useState(0);
  const [roundHistory, setRoundHistory] = useState<{ mult: number }[]>([]);

  // Draw the chart on canvas
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

    const candles = candlesRef.current;
    const currentPhase = phaseRef.current;
    const rm = rugMultRef.current;

    const pad = { top: 40, bottom: 28, left: 10, right: isMobile ? 48 : 58 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // ─── PRESALE PHASE ───
    if (currentPhase === 'presale') {
      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = pad.top + (chartH / 5) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      }

      // 1.0x line
      const midY = pad.top + chartH * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, midY); ctx.lineTo(w - pad.right, midY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText('1.00x', w - 4, midY + 3);

      // PRESALE text
      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 ${isMobile ? 20 : 28}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(251,191,36,0.4)';
      ctx.shadowBlur = 16;
      ctx.fillText('PRESALE', w / 2, h * 0.38);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `600 ${isMobile ? 13 : 15}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Buy at 1.00x before round starts', w / 2, h * 0.38 + 28);

      // Countdown
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${isMobile ? 36 : 48}px 'JetBrains Mono', monospace`;
      ctx.shadowColor = 'rgba(255,255,255,0.3)';
      ctx.shadowBlur = 12;
      ctx.fillText(`${countdown}`, w / 2, h * 0.65);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `600 ${isMobile ? 11 : 12}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('seconds until round starts', w / 2, h * 0.65 + 22);
      return;
    }

    // ─── LIVE / RUGGED PHASE ───
    if (candles.length === 0) return;

    // Price range
    let pMin = Infinity, pMax = -Infinity;
    for (const c of candles) { pMin = Math.min(pMin, c.l); pMax = Math.max(pMax, c.h); }
    if (currentPhase === 'rugged') { pMin = Math.min(pMin, 0.5); }
    pMin -= 0.02; pMax = Math.max(pMax * 1.08, 1.2);
    const pRange = pMax - pMin || 0.1;
    const toY = (v: number) => pad.top + ((pMax - v) / pRange) * chartH;

    // Grid + Y labels
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = pMin + (pRange / gridSteps) * (gridSteps - i);
      const y = toY(val);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(val >= 10 ? 1 : 2)}x`, w - 4, y + 3);
    }

    // 1.0x baseline
    const baseY = toY(1.0);
    if (baseY > pad.top && baseY < h - pad.bottom) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(w - pad.right, baseY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw candles
    const maxVisible = isMobile ? 40 : 60;
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visible = candles.slice(startIdx);
    const spacing = chartW / Math.max(visible.length, 20);
    const candleW = Math.max(3, spacing * 0.6);

    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      const x = pad.left + (i + 0.5) * spacing;
      const isCrash = currentPhase === 'rugged' && i >= visible.length - 3;
      const isGreen = !isCrash && c.c >= c.o;
      const color = isCrash ? '#ef4444' : (isGreen ? '#22c55e' : '#ef4444');

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = isMobile ? 1 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h));
      ctx.lineTo(x, toY(c.l));
      ctx.stroke();

      // Body
      const bodyTop = toY(Math.max(c.o, c.c));
      const bodyBot = toY(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, Math.max(2, bodyBot - bodyTop));
    }

    // Current multiplier with dashed line (live phase)
    if (currentPhase === 'live' && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const multY = toY(lastCandle.c);

      // Dashed line at current price
      ctx.strokeStyle = 'rgba(52,211,153,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.left, multY); ctx.lineTo(w - pad.right, multY); ctx.stroke();
      ctx.setLineDash([]);

      // Large multiplier text
      ctx.fillStyle = '#34d399';
      ctx.font = `900 ${isMobile ? 32 : 42}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(52,211,153,0.5)';
      ctx.shadowBlur = 16;
      ctx.fillText(`${lastCandle.c.toFixed(4)}x`, w / 2, pad.top - 8);
      ctx.shadowBlur = 0;
    }

    // RUGGED overlay
    if (currentPhase === 'rugged') {
      // Dim overlay
      ctx.fillStyle = 'rgba(10,12,16,0.4)';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ef4444';
      ctx.font = `900 ${isMobile ? 28 : 38}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(239,68,68,0.6)';
      ctx.shadowBlur = 20;
      ctx.fillText('RUGGED!', w / 2, h * 0.42);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ef4444';
      ctx.font = `700 ${isMobile ? 16 : 20}px 'JetBrains Mono', monospace`;
      ctx.fillText(`@ ${rm.toFixed(2)}x`, w / 2, h * 0.42 + 30);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `500 ${isMobile ? 11 : 13}px 'Inter', system-ui, sans-serif`;
      ctx.fillText('Thanks for playing', w / 2, h * 0.42 + 56);
    }

    // Top left label
    ctx.fillStyle = currentPhase === 'rugged' ? '#ef4444' : '#34d399';
    ctx.font = "700 9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = 'left';
    const dot = currentPhase === 'live' ? '\u25CF ' : '';
    ctx.fillText(`${dot}${currentPhase === 'live' ? 'LIVE' : 'ROUND OVER'}`, pad.left + 4, 16);
  }, [isMobile, countdown]);

  // Round lifecycle
  useEffect(() => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const startRound = () => {
      if (cancelled) return;

      // ─── PRESALE PHASE ───
      const rm = genRugMult();
      rugMultRef.current = rm;
      setRugMult(rm);
      phaseRef.current = 'presale';
      setPhase('presale');
      candlesRef.current = [];
      priceRef.current = 1.0;
      setCurrentMult(1.0);

      let cd = 5;
      setCountdown(cd);
      draw();

      const cdInt = setInterval(() => {
        cd--;
        setCountdown(cd);
        draw();
        if (cd <= 0) clearInterval(cdInt);
      }, 1000);
      intervals.push(cdInt);

      // ─── After 5s → LIVE PHASE ───
      const liveTO = setTimeout(() => {
        if (cancelled) return;
        phaseRef.current = 'live';
        setPhase('live');

        const tc = Math.max(20, Math.floor(15 + rm * 4 + Math.random() * 12));
        totalCandlesRef.current = tc;
        candleIdxRef.current = 0;
        const trend = (rm - 1.0) / tc;

        const buildInt = setInterval(() => {
          if (cancelled) return;
          const idx = candleIdxRef.current;

          if (idx >= tc) {
            clearInterval(buildInt);
            // Add 3 crash candles
            const crashStart = priceRef.current;
            const crashes: CandleData[] = [
              { o: crashStart, h: crashStart * 1.02, l: crashStart * 0.55, c: crashStart * 0.55 },
              { o: crashStart * 0.55, h: crashStart * 0.57, l: crashStart * 0.25, c: crashStart * 0.25 },
              { o: crashStart * 0.25, h: crashStart * 0.27, l: crashStart * 0.08, c: crashStart * 0.08 },
            ];
            candlesRef.current = [...candlesRef.current, ...crashes];

            phaseRef.current = 'rugged';
            setPhase('rugged');
            setCurrentMult(0);
            draw();

            // Add to round history
            roundHistRef.current = [{ mult: rm, time: Date.now() }, ...roundHistRef.current].slice(0, 20);
            setRoundHistory([...roundHistRef.current]);

            // After 4s → next round
            const nextTO = setTimeout(() => {
              if (!cancelled) startRound();
            }, 4000);
            timeouts.push(nextTO);
            return;
          }

          // Generate next candle
          const open = priceRef.current;
          const noise = (Math.random() - 0.35) * 0.08 * Math.max(1, rm - 1);
          const bodySize = trend + noise;
          const close = Math.max(0.8, open + bodySize);
          const wickUp = Math.abs(bodySize) * (0.3 + Math.random() * 0.6);
          const wickDn = Math.abs(bodySize) * (0.1 + Math.random() * 0.4);
          const high = Math.max(open, close) + wickUp;
          const low = Math.max(0.7, Math.min(open, close) - wickDn);

          candlesRef.current.push({ o: open, h: high, l: low, c: close });
          priceRef.current = close;
          setCurrentMult(close);
          candleIdxRef.current = idx + 1;
          draw();
        }, 250); // 250ms per candle like rugs.fun
        intervals.push(buildInt);
      }, 5000);
      timeouts.push(liveTO);
    };

    startRound();

    return () => {
      cancelled = true;
      timeouts.forEach(t => clearTimeout(t));
      intervals.forEach(i => clearInterval(i));
    };
  }, []);

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const chartHeight = isMobile ? 260 : 360;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Round history strip */}
      {roundHistory.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px 0',
          scrollbarWidth: 'none',
        }}>
          {roundHistory.slice(0, 10).map((r, i) => (
            <div key={i} style={{
              padding: '4px 10px', borderRadius: '8px', flexShrink: 0,
              background: r.mult >= 5 ? 'rgba(251,191,36,0.12)' : r.mult >= 2 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${r.mult >= 5 ? 'rgba(251,191,36,0.25)' : r.mult >= 2 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
            }}>
              <span className="mono" style={{
                fontSize: '12px', fontWeight: 800,
                color: r.mult >= 5 ? '#fbbf24' : r.mult >= 2 ? '#22c55e' : '#ef4444',
              }}>
                {r.mult.toFixed(2)}x
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Stats bar from recent API data */}
      {recentPublic.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '8px 12px', background: theme.bg.secondary, borderRadius: '10px',
          border: `1px solid ${theme.border.subtle}`, fontSize: '11px',
        }}>
          <span style={{ fontWeight: 700, color: theme.text.muted }}>Last {recentPublic.length}</span>
          <span className="mono" style={{ fontWeight: 800, color: '#fbbf24' }}>
            {recentPublic.reduce((sum: number, g: any) => sum + parseFloat(g.rugMultiplier || '1'), 0).toFixed(1)}x
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ color: '#22c55e', fontWeight: 700 }}>
            2x: {recentPublic.filter((g: any) => parseFloat(g.rugMultiplier || '0') >= 2).length}
          </span>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>
            10x: {recentPublic.filter((g: any) => parseFloat(g.rugMultiplier || '0') >= 10).length}
          </span>
        </div>
      )}

      {/* THE LIVE CHART */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${chartHeight}px`, display: 'block', borderRadius: '12px', cursor: 'pointer' }}
          onClick={() => { if (phase === 'live' || phase === 'presale') onBuy(); }}
        />
      </div>

      {/* Live players in round */}
      {liveGames.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0',
          scrollbarWidth: 'none',
        }}>
          {liveGames.slice(0, 8).map((g: any) => (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 10px', background: theme.bg.secondary, borderRadius: '10px',
              border: `1px solid ${theme.border.subtle}`, flexShrink: 0,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: getAvatarGradient(g.avatarUrl, g.username || '?'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '8px', fontWeight: 700, color: '#fff',
              }}>
                {getInitials(g.username || '?')}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: theme.text.primary, maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.username || 'Player'}
              </span>
              <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24' }}>
                {formatSol(g.betAmount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RugGameScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const balance = profile?.balance ?? 0;

  const [status, setStatus] = useState<GameStatus>('idle');
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [customBet, setCustomBet] = useState('0.1');
  const [gameId, setGameId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState(1.00);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [recentPublic, setRecentPublic] = useState<any[]>([]);
  const [liveGames, setLiveGames] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartDataRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const statusRef = useRef<GameStatus>('idle');
  const resultRef = useRef<any>(null);

  statusRef.current = status;
  resultRef.current = result;

  // ─── Playing chart draw (line chart for user's active game) ───
  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const curStatus = statusRef.current;
    const curResult = resultRef.current;

    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, w, h);

    const data = chartDataRef.current;
    if (data.length < 2) return;

    const pad = { top: 40, bottom: 30, left: 10, right: 60 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const maxM = Math.max(...data) * 1.1;
    const range = maxM - 1.0 || 0.1;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const val = maxM - (range / 4) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 6, y + 3);
    }
    ctx.setLineDash([]);

    // 1.0x baseline
    const baseY = pad.top + ((maxM - 1.0) / range) * chartH;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(w - pad.right, baseY); ctx.stroke();
    ctx.setLineDash([]);

    const lineColor = curStatus === 'rugged' ? '#f87171' : '#34d399';
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, curStatus === 'rugged' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    const xStep = chartW / Math.max(1, data.length - 1);

    // Fill area
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = pad.left + i * xStep;
      const y = pad.top + ((maxM - val) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (data.length - 1) * xStep, h - pad.bottom);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = pad.left + i * xStep;
      const y = pad.top + ((maxM - val) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (curStatus === 'rugged' && curResult) {
      const rugM = parseFloat(curResult.rugMultiplier);
      ctx.fillStyle = '#ef4444';
      ctx.font = "900 28px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(239,68,68,0.5)';
      ctx.shadowBlur = 12;
      ctx.fillText('RUGGED!', w / 2, h / 2 - 10);
      ctx.font = "700 16px 'JetBrains Mono', monospace";
      ctx.fillText(`@ ${rugM.toFixed(2)}x`, w / 2, h / 2 + 14);
      ctx.shadowBlur = 0;
    }

    if (curStatus === 'playing') {
      const current = data[data.length - 1];
      ctx.fillStyle = '#34d399';
      ctx.font = "900 36px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(52,211,153,0.5)';
      ctx.shadowBlur = 15;
      ctx.fillText(`${current.toFixed(2)}x`, w / 2, 32);
      ctx.shadowBlur = 0;
    }
  };

  // Playing timer
  useEffect(() => {
    if (status !== 'playing' || !gameId) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const m = 1 + 0.05 * elapsed + 0.01 * Math.pow(elapsed, 1.5);
      const rounded = parseFloat(m.toFixed(2));
      setMultiplier(rounded);
      chartDataRef.current.push(rounded);
      drawChart();
    }, 50);
    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [status, gameId]);

  const handleStart = async () => {
    if (!isAuthenticated) { go('auth'); return; }
    if (loading) return;
    setError(''); setLoading(true);
    playBetPlaced(); hapticMedium();
    try {
      const res = await api.startRugGame(betAmount);
      const game = res.game;
      setGameId(game.id);
      setStatus('playing');
      setMultiplier(1.00);
      chartDataRef.current = [1.00];
      startTimeRef.current = Date.now();
      setResult(null);
    } catch (err: any) {
      setError(err.message || 'Failed to start');
      setTimeout(() => setError(''), 3000);
    } finally { setLoading(false); }
  };

  const handleCashOut = async () => {
    if (!gameId || status !== 'playing') return;
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(true);
    playButtonClick(); hapticLight();
    try {
      const res = await api.cashOutRugGame(gameId, multiplier);
      setResult(res.game);
      setStatus('cashed_out');
      syncProfile();
      playRoundEnd(true);
    } catch {
      try {
        const res = await api.rugGameRuq(gameId);
        setResult(res.game);
        setStatus('rugged');
        syncProfile();
        playRoundEnd(false);
      } catch { /* fallback */ }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (status !== 'playing') drawChart();
  }, [status, result]);

  useEffect(() => {
    if (status === 'playing' && multiplier > 50) handleCashOut();
  }, [multiplier, status]);

  // Fetch recent + live
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [recent, live] = await Promise.all([
          api.getRugGameRecent(15),
          api.getRugGameLive(10),
        ]);
        setRecentPublic(recent.games || []);
        setLiveGames(live.games || []);
      } catch { /* ignore */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showHistory && userId) {
      api.getRugGameHistory(20).then(r => setHistory(r.games || [])).catch(() => {});
    }
  }, [showHistory, userId]);

  const reset = () => {
    setStatus('idle');
    setGameId(null);
    setMultiplier(1.00);
    setResult(null);
    chartDataRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ─── PLAYING / RESULT VIEW ───
  if (status === 'playing' || status === 'cashed_out' || status === 'rugged') {
    const payout = result?.payout ?? 0;
    const profit = status === 'cashed_out' ? payout - betAmount : -betAmount;

    return (
      <div style={s.gameRoot} className="screen-enter">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text.muted }}>BET</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }} className="mono">{formatSol(betAmount)} SOL</div>
          </div>
          {status === 'playing' && (
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }} className="mono">
              +{formatSol(Math.floor(betAmount * multiplier) - betAmount)} SOL
            </div>
          )}
          {status !== 'playing' && (
            <div style={{ fontSize: '16px', fontWeight: 800, color: profit >= 0 ? '#34d399' : '#f87171' }} className="mono">
              {profit >= 0 ? '+' : ''}{formatSol(Math.abs(profit))} SOL
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: '200px' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: '12px' }} />
        </div>

        {status === 'playing' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: theme.text.muted }}>
              Payout: <span className="mono glow-green" style={{ color: '#34d399', fontWeight: 800 }}>{formatSol(Math.floor(betAmount * multiplier))} SOL</span>
            </div>
            <button style={s.cashOutBtn} onClick={handleCashOut} disabled={loading} className="hover-scale">
              <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>CASH OUT AT</span>
              <span className="mono glow-green" style={{ fontSize: '32px', fontWeight: 900 }}>{multiplier.toFixed(2)}x</span>
              <span className="mono" style={{ fontSize: '15px', fontWeight: 700, opacity: 0.8 }}>{formatSol(Math.floor(betAmount * multiplier))} SOL</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {status === 'cashed_out' && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '2px' }}>CASHED OUT</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#34d399' }} className="mono">
                  {parseFloat(result?.cashOutMultiplier || '1').toFixed(2)}x
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text.muted, marginTop: '4px' }}>
                  Rug was at {parseFloat(result?.rugMultiplier || '1').toFixed(2)}x
                </div>
              </div>
            )}
            {status === 'rugged' && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f87171', textTransform: 'uppercase', letterSpacing: '2px' }}>RUGGED</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#f87171' }} className="mono">-{formatSol(betAmount)} SOL</div>
              </div>
            )}
            {result?.seed && (
              <div style={{ padding: '10px', background: 'rgba(119,23,255,0.06)', borderRadius: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: theme.text.muted, display: 'block', marginBottom: '4px' }}>SEED (Provably Fair)</span>
                <span style={{ fontSize: '9px', color: theme.text.muted, wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>{result.seed}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={s.playAgainBtn} onClick={reset} className="hover-scale">Play Again</button>
              <button style={s.lobbyBtn} onClick={() => go('lobby')} className="hover-bright">Lobby</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── IDLE VIEW: Live Spectator (rugs.fun style) ───
  return (
    <div style={s.root} className="screen-enter">
      {/* Header */}
      <div style={s.headerSection}>
        <button style={s.backBtn} onClick={() => go('lobby')} className="hover-bright">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={s.headerText}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ ...s.headerIcon, background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.2)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h1 style={s.title}>Rug Game</h1>
          </div>
          <p style={s.subtitle}>Chart climbs... sell before the rug pull!</p>
        </div>
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}

      {/* LIVE SPECTATOR CHART */}
      <SpectatorChart
        onBuy={handleStart}
        liveGames={liveGames}
        recentPublic={recentPublic}
      />

      {/* Bet Amount */}
      <div style={s.sectionLabel}>Bet Amount</div>
      <div style={s.betGrid}>
        {BET_AMOUNTS.map(b => (
          <button
            key={b.lamports}
            style={{ ...s.betBtn, ...(betAmount === b.lamports ? s.betBtnActive : {}) }}
            onClick={() => { setBetAmount(b.lamports); setCustomBet(b.label); playButtonClick(); }}
            className="card-glow-hover"
          >
            <span className="mono" style={{ fontSize: '15px', fontWeight: 800 }}>{b.label}</span>
            <span style={{ fontSize: '10px', color: theme.text.muted, fontWeight: 600 }}>SOL</span>
          </button>
        ))}
      </div>

      {/* Bet slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input
          type="range" min="0.01" max="1" step="0.01"
          value={parseFloat(customBet) || 0.1}
          onChange={e => {
            const val = parseFloat(e.target.value);
            setCustomBet(val.toFixed(2));
            setBetAmount(Math.floor(val * 1_000_000_000));
          }}
          className="bet-slider"
          style={{ flex: 1 }}
        />
        <span className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24', minWidth: '70px', textAlign: 'right' }}>
          {customBet} SOL
        </span>
      </div>

      {/* BUY button (big green like rugs.fun) */}
      <button
        style={s.buyBtn}
        onClick={handleStart}
        disabled={loading || betAmount <= 0}
        className="hover-scale"
      >
        <span style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '1px' }}>
          {loading ? 'BUYING...' : 'BUY'}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8 }}>
          {formatSol(betAmount)} SOL
        </span>
      </button>

      {/* Payout info */}
      <div style={s.payoutInfo}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cash out at 2x</span>
          <span className="mono" style={{ color: '#34d399' }}>{formatSol(betAmount * 2)} SOL</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cash out at 5x</span>
          <span className="mono" style={{ color: '#34d399' }}>{formatSol(betAmount * 5)} SOL</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cash out at 10x</span>
          <span className="mono" style={{ color: '#fbbf24' }}>{formatSol(betAmount * 10)} SOL</span>
        </div>
      </div>

      {/* Recent Games list */}
      {recentPublic.length > 0 && (
        <div style={s.recentSection}>
          <div style={s.recentHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LiveDot color="#f87171" size={7} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text.primary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recent Games
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text.muted }}>{recentPublic.length}</span>
          </div>
          <div style={s.recentScroll}>
            {recentPublic.slice(0, 8).map(g => {
              const wasCashOut = g.status === 'cashed_out';
              const cashMult = parseFloat(g.cashOutMultiplier || '0');
              const rugMult = parseFloat(g.rugMultiplier || '1');
              return (
                <div key={g.id} style={{
                  ...s.recentGameCard,
                  borderLeft: `3px solid ${wasCashOut ? '#34d399' : '#f87171'}`,
                }} className="card-enter">
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: getAvatarGradient(null, g.username || '?'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', fontWeight: 700, color: '#fff',
                  }}>
                    {getInitials(g.username || '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.username || 'Player'}
                      </span>
                      <StatusBadge status={wasCashOut ? 'cashed' : 'rugged'} />
                    </div>
                    <span style={{ fontSize: '11px', color: theme.text.muted }}>
                      {formatSol(g.betAmount)} SOL · {g.resolvedAt ? timeAgo(g.resolvedAt) : ''}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <MultiplierBadge value={wasCashOut ? cashMult : rugMult} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History toggle */}
      {isAuthenticated && (
        <>
          <button
            style={{ ...s.historyToggle, ...(showHistory ? { borderColor: 'rgba(119,23,255,0.4)', color: '#c084fc' } : {}) }}
            onClick={() => { setShowHistory(!showHistory); playButtonClick(); }}
          >
            {showHistory ? 'Hide History' : 'My History'}
          </button>
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {history.length === 0 ? (
                <div style={s.emptyState}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.secondary }}>No games yet</span>
                </div>
              ) : history.map(g => {
                const wasCashOut = g.status === 'cashed_out';
                const mult = parseFloat(g.cashOutMultiplier || g.rugMultiplier || '1');
                const profit = wasCashOut ? (g.payout || 0) - g.betAmount : -g.betAmount;
                return (
                  <div key={g.id} style={s.historyCard}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: wasCashOut ? '#34d399' : '#f87171' }}>
                          {wasCashOut ? `${mult.toFixed(2)}x` : 'RUGGED'}
                        </span>
                        <span style={{ fontSize: '11px', color: theme.text.muted }}>{new Date(g.resolvedAt).toLocaleDateString()}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: theme.text.muted }} className="mono">{formatSol(g.betAmount)} SOL bet</span>
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: profit >= 0 ? '#34d399' : '#f87171' }} className="mono">
                      {profit >= 0 ? '+' : ''}{formatSol(Math.abs(profit))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
  gameRoot: {
    display: 'flex', flexDirection: 'column', gap: '8px',
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
    padding: '14px 8px', borderRadius: '12px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px',
    transition: 'all 0.2s', color: theme.text.primary,
  },
  betBtnActive: {
    background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24',
  },
  buyBtn: {
    width: '100%', padding: '16px', border: 'none', borderRadius: '14px',
    background: 'linear-gradient(135deg, #059669, #34d399)',
    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px',
    boxShadow: '0 4px 20px rgba(52,211,153,0.3)',
    transition: 'all 0.15s',
  },
  payoutInfo: {
    display: 'flex', flexDirection: 'column' as const, gap: '6px',
    padding: '12px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
    fontSize: '13px', fontWeight: 600, color: theme.text.muted,
  },
  cashOutBtn: {
    width: '100%', padding: '16px', border: 'none', borderRadius: '14px',
    background: 'linear-gradient(135deg, #059669, #34d399)',
    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px',
    boxShadow: '0 4px 24px rgba(52,211,153,0.3)', transition: 'all 0.15s',
  },
  playAgainBtn: {
    flex: 1, padding: '14px', background: 'linear-gradient(135deg, #7717ff, #886cff)',
    border: 'none', borderRadius: '12px', color: '#fff',
    fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  lobbyBtn: {
    padding: '14px 24px', borderRadius: '12px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, color: theme.text.secondary,
    fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  recentSection: {
    background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`, overflow: 'hidden',
  },
  recentHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', borderBottom: `1px solid ${theme.border.subtle}`,
  },
  recentScroll: {
    display: 'flex', flexDirection: 'column' as const, gap: '1px',
    maxHeight: '300px', overflow: 'auto',
  },
  recentGameCard: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 14px', background: theme.bg.primary,
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  historyToggle: {
    width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '14px', fontWeight: 700, color: theme.text.muted,
    transition: 'all 0.15s', textAlign: 'center' as const,
  },
  emptyState: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px',
    padding: '32px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  historyCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
    padding: '12px 14px', background: theme.bg.secondary, borderRadius: '10px',
    border: `1px solid ${theme.border.subtle}`,
  },
};
