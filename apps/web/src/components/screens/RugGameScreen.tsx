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

const BET_AMOUNTS = [
  { lamports: 10_000_000, label: '0.01' },
  { lamports: 50_000_000, label: '0.05' },
  { lamports: 100_000_000, label: '0.1' },
  { lamports: 250_000_000, label: '0.25' },
  { lamports: 500_000_000, label: '0.5' },
  { lamports: 1_000_000_000, label: '1' },
];

// Generate a synthetic replay path from 1.0 to rugMultiplier
function generateReplayPath(rugMult: number, points: number): number[] {
  const path: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * 10; // ~10 seconds worth
    const m = 1 + (rugMult - 1) * (i / (points - 1)) * (0.7 + 0.3 * Math.sin(i * 0.5));
    path.push(Math.min(rugMult, Math.max(1, m)));
  }
  // Ensure last point is exactly rugMult
  path[path.length - 1] = rugMult;
  return path;
}


// Generate synthetic OHLC candles from a rug multiplier
function generateCandles(rugMult: number, count: number): Array<{ o: number; h: number; l: number; c: number }> {
  const candles: Array<{ o: number; h: number; l: number; c: number }> = [];
  let price = 1.0;
  const target = rugMult;
  const trend = (target - 1.0) / count;

  for (let i = 0; i < count; i++) {
    const open = price;
    const noise = (Math.random() - 0.35) * 0.08 * Math.max(1, target - 1);
    const bodySize = trend + noise;
    const close = Math.max(0.7, open + bodySize);
    const wickUp = Math.abs(bodySize) * (0.3 + Math.random() * 0.7);
    const wickDown = Math.abs(bodySize) * (0.1 + Math.random() * 0.5);
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(0.6, Math.min(open, close) - wickDown);
    candles.push({ o: open, h: high, l: low, c: close });
    price = close;
  }
  // Ensure final candle peaks near rugMult
  const last = candles[candles.length - 1];
  last.h = Math.max(last.h, target);
  last.c = target * (0.92 + Math.random() * 0.08);
  return candles;
}

// Candlestick replay chart (rugs.fun style) for spectators
function ReplayChart({ game, height }: { game: any; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }> | null>(null);
  const wasCashOut = game.status === 'cashed_out';
  const rugMult = parseFloat(game.rugMultiplier || '2');
  const cashMult = parseFloat(game.cashOutMultiplier || '0');

  // Generate candles once per game
  if (!candlesRef.current || (candlesRef.current as any).__gameId !== game.id) {
    candlesRef.current = generateCandles(rugMult, 18);
    (candlesRef.current as any).__gameId = game.id;
  }

  useEffect(() => {
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

    const candles = candlesRef.current!;

    // Background with rounded corners
    ctx.fillStyle = '#0c0e12';
    const radius = 12;
    ctx.beginPath();
    ctx.moveTo(radius, 0); ctx.lineTo(w - radius, 0); ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius); ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h); ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius); ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath(); ctx.fill();

    const pad = { top: 36, bottom: 24, left: 12, right: 56 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Calc price range from all candles
    let priceMin = Infinity, priceMax = -Infinity;
    for (const c of candles) {
      priceMin = Math.min(priceMin, c.l);
      priceMax = Math.max(priceMax, c.h);
    }
    // Add crash low
    priceMin = Math.min(priceMin, 0.8);
    priceMax = priceMax * 1.05;
    const priceRange = priceMax - priceMin || 0.1;

    const toY = (v: number) => pad.top + ((priceMax - v) / priceRange) * chartH;

    // Grid lines + Y-axis labels
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = priceMin + (priceRange / gridSteps) * (gridSteps - i);
      const y = toY(val);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(1)}x`, w - 4, y + 3);
    }

    // 1.0x baseline (dashed)
    const baseY = toY(1.0);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(w - pad.right, baseY); ctx.stroke();
    ctx.setLineDash([]);

    // Draw candles
    const totalCandles = candles.length + 3; // leave room for crash candles
    const candleSpacing = chartW / totalCandles;
    const candleW = Math.max(4, candleSpacing * 0.6);

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = pad.left + (i + 0.5) * candleSpacing;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#22c55e' : '#ef4444';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h));
      ctx.lineTo(x, toY(c.l));
      ctx.stroke();

      // Body
      const bodyTop = toY(Math.max(c.o, c.c));
      const bodyBot = toY(Math.min(c.o, c.c));
      const bodyH = Math.max(2, bodyBot - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    }

    // Crash candles (2-3 big red candles dropping to 0.8)
    const crashStart = candles[candles.length - 1].c;
    const crashLevels = [crashStart * 0.7, crashStart * 0.45, 0.8];
    let crashPrice = crashStart;
    for (let j = 0; j < 3; j++) {
      const i = candles.length + j;
      const x = pad.left + (i + 0.5) * candleSpacing;
      const open = crashPrice;
      const close = crashLevels[j];
      const high = open + (open - close) * 0.1;
      const low = close - (open - close) * 0.05;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, toY(high));
      ctx.lineTo(x, toY(Math.max(low, priceMin)));
      ctx.stroke();

      const bodyTop = toY(open);
      const bodyBot = toY(close);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, Math.max(2, bodyBot - bodyTop));

      crashPrice = close;
    }

    // Current multiplier with dashed line
    const multY = toY(rugMult);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, multY); ctx.lineTo(w - pad.right, multY); ctx.stroke();
    ctx.setLineDash([]);

    // Multiplier label (hero style like rugs.fun)
    ctx.fillStyle = '#fff';
    ctx.font = "900 22px 'JetBrains Mono', monospace";
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 8;
    ctx.fillText(`${rugMult.toFixed(4)}x`, w - pad.right - 4, multY - 10);
    ctx.shadowBlur = 0;

    // RUGGED overlay text
    ctx.fillStyle = '#ef4444';
    ctx.font = "900 16px 'JetBrains Mono', monospace";
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(239,68,68,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(`RUGGED @ ${rugMult.toFixed(2)}x`, w / 2, pad.top + chartH * 0.75);
    ctx.shadowBlur = 0;

    // Cash out marker
    if (wasCashOut && cashMult > 1) {
      const cashFrac = Math.min(1, (cashMult - 1) / (rugMult - 1 || 1));
      const cashIdx = Math.floor(cashFrac * (candles.length - 1));
      const cx = pad.left + (cashIdx + 0.5) * candleSpacing;
      const cy = toY(cashMult);

      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = 'rgba(34,197,94,0.6)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0c0e12';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.font = "700 11px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(`SOLD ${cashMult.toFixed(2)}x`, cx, cy - 14);
    }

    // Top labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "600 10px 'Inter', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText('LAST ROUND', pad.left, 14);

    ctx.fillStyle = wasCashOut ? '#22c55e' : '#ef4444';
    ctx.font = "700 10px 'Inter', sans-serif";
    ctx.textAlign = 'right';
    const resultText = wasCashOut
      ? `${game.username || 'Player'} cashed @ ${cashMult.toFixed(2)}x`
      : `${game.username || 'Player'} got rugged`;
    ctx.fillText(resultText, w - pad.right, 14);

  }, [game, rugMult, cashMult, wasCashOut]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block', borderRadius: '12px' }}
    />
  );
}

// Mini candlestick chart for history cards (rugs.fun style)
function MiniCandleChart({ rugMult, cashed, size = 80 }: { rugMult: number; cashed: boolean; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }> | null>(null);

  if (!candlesRef.current) {
    candlesRef.current = generateCandles(rugMult, 8);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = (size * 0.6) * dpr;
    ctx.scale(dpr, dpr);
    const w = size;
    const h = size * 0.6;

    ctx.fillStyle = '#0c0e12';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    const candles = candlesRef.current!;
    const pad = 4;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;

    let priceMin = Infinity, priceMax = -Infinity;
    for (const c of candles) { priceMin = Math.min(priceMin, c.l); priceMax = Math.max(priceMax, c.h); }
    priceMin = Math.min(priceMin, 0.8);
    priceMax *= 1.05;
    const priceRange = priceMax - priceMin || 0.1;

    const toY = (v: number) => pad + ((priceMax - v) / priceRange) * chartH;
    const totalCandles = candles.length + 2;
    const spacing = chartW / totalCandles;
    const candleW = Math.max(2, spacing * 0.55);

    // Draw candles
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = pad + (i + 0.5) * spacing;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#22c55e' : '#ef4444';

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();

      const bTop = toY(Math.max(c.o, c.c));
      const bBot = toY(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(1.5, bBot - bTop));
    }

    // Crash candles
    let crashPrice = candles[candles.length - 1].c;
    for (let j = 0; j < 2; j++) {
      const i = candles.length + j;
      const x = pad + (i + 0.5) * spacing;
      const close = j === 0 ? crashPrice * 0.55 : 0.8;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(crashPrice * 1.02)); ctx.lineTo(x, toY(Math.max(close * 0.95, priceMin))); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - candleW / 2, toY(crashPrice), candleW, Math.max(1.5, toY(close) - toY(crashPrice)));
      crashPrice = close;
    }
  }, [rugMult, size]);

  return <canvas ref={canvasRef} style={{ width: `${size}px`, height: `${size * 0.6}px`, flexShrink: 0, borderRadius: '8px' }} />;
}

// ─── Live Running Card (shows running multiplier for active bot games) ───
function LiveRunningCard({ game }: { game: any }) {
  const [mult, setMult] = useState(1.0);

  useEffect(() => {
    const startTime = new Date(game.createdAt).getTime();
    const update = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const m = 1 + 0.05 * elapsed + 0.01 * Math.pow(elapsed, 1.5);
      setMult(Math.min(m, 50));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [game.createdAt]);

  const elapsed = Math.floor((Date.now() - new Date(game.createdAt).getTime()) / 1000);

  return (
    <div style={{
      ...liveCardStyle.card,
      borderLeft: '3px solid #34d399',
    }} className="card-enter">
      <div style={liveCardStyle.pulseBar} className="live-ring" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: getAvatarGradient(game.avatarUrl, game.username || '?'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, color: '#fff',
        }}>
          {getInitials(game.username || '?')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {game.username || 'Player'}
            </span>
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
              background: 'rgba(52,211,153,0.15)', color: '#34d399',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              PLAYING
            </span>
          </div>
          <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '2px' }}>
            {formatSol(game.betAmount)} SOL · {elapsed}s
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
        <span className="mono countUp" style={{
          fontSize: '20px', fontWeight: 900, color: '#34d399',
          textShadow: '0 0 12px rgba(52,211,153,0.4)',
        }}>
          {mult.toFixed(2)}x
        </span>
        <span className="mono glow-green" style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', opacity: 0.8 }}>
          +{formatSol(Math.max(0, Math.floor(game.betAmount * mult) - game.betAmount))}
        </span>
      </div>
    </div>
  );
}

const liveCardStyle: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'rgba(52,211,153,0.04)',
    borderBottom: `1px solid ${theme.border.subtle}`,
    position: 'relative',
    overflow: 'hidden',
  },
  pulseBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '3px',
    height: '100%',
    background: '#34d399',
    opacity: 0.6,
  },
};

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

    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(0, 0, w, h);

    const data = chartDataRef.current;
    if (data.length < 2) return;

    const pad = { top: 40, bottom: 30, left: 10, right: 60 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const maxM = Math.max(...data) * 1.1;
    const range = maxM - 1.0 || 0.1;

    ctx.strokeStyle = 'rgba(119,23,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const val = maxM - (range / gridLines) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(2)}x`, w - 6, y + 3);
    }
    ctx.setLineDash([]);

    const baseY = pad.top + ((maxM - 1.0) / range) * chartH;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(w - pad.right, baseY); ctx.stroke();
    ctx.setLineDash([]);

    const lineColor = curStatus === 'rugged' ? '#f87171' : '#34d399';

    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, curStatus === 'rugged' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    const xStep = chartW / Math.max(1, data.length - 1);

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
      const lastX = pad.left + (data.length - 1) * xStep;
      const lastY = pad.top + ((maxM - data[data.length - 1]) / range) * chartH;
      const bottomY = h - pad.bottom;

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(lastX + xStep * 2, bottomY);
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f87171';
      ctx.font = "900 24px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('RUGGED!', w / 2, h / 2 - 10);
      ctx.font = "700 14px 'JetBrains Mono', monospace";
      ctx.fillText(`@ ${rugM.toFixed(2)}x`, w / 2, h / 2 + 14);
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
      const game = res.game;
      setResult(game);
      setStatus('cashed_out');
      syncProfile();
      playRoundEnd(true);
    } catch (err: any) {
      setError(err.message || 'Failed to cash out');
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
    if (status !== 'playing' || !gameId) return;
    const check = setInterval(async () => { }, 2000);
    return () => clearInterval(check);
  }, [status, gameId, multiplier]);

  useEffect(() => {
    if (status !== 'playing') drawChart();
  }, [status, result]);

  useEffect(() => {
    if (status === 'playing' && multiplier > 50) {
      handleCashOut();
    }
  }, [multiplier, status]);

  // Fetch recent public games + live games
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

  // Fetch history
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

        <div style={{ ...s.chartContainer, height: 'auto', flex: 1, minHeight: '200px' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {status === 'playing' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Potential payout */}
            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: theme.text.muted }}>
              Payout: <span className="mono glow-green" style={{ color: '#34d399', fontWeight: 800 }}>{formatSol(Math.floor(betAmount * multiplier))} SOL</span>
            </div>
            <button style={s.cashOutBtn} onClick={handleCashOut} disabled={loading} className="hover-scale">
              <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>CASH OUT AT</span>
              <span className="mono glow-green" style={{ fontSize: '32px', fontWeight: 900 }}>{multiplier.toFixed(2)}x</span>
              <span className="mono" style={{ fontSize: '15px', fontWeight: 700, opacity: 0.8 }}>
                {formatSol(Math.floor(betAmount * multiplier))} SOL
              </span>
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
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#f87171' }} className="mono">
                  -{formatSol(betAmount)} SOL
                </div>
              </div>
            )}
            {result?.seed && (
              <div style={{ padding: '10px', background: 'rgba(119,23,255,0.06)', borderRadius: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: theme.text.muted, display: 'block', marginBottom: '4px' }}>SEED (Provably Fair)</span>
                <span style={{ fontSize: '9px', color: theme.text.muted, wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>
                  {result.seed}
                </span>
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

  // ─── IDLE VIEW (Setup) ───
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

      {/* ─── REPLAY CHART (Spectator View) ─── */}
      {recentPublic.length > 0 && (
        <div className="card-enter">
          <LiveRoundBanner title="Last Round" subtitle={`${recentPublic[0].username || 'Player'} · ${timeAgo(recentPublic[0].resolvedAt)}`} accentColor="#f87171" />
          <ReplayChart game={recentPublic[0]} height={isMobile ? 220 : 300} />
        </div>
      )}

      {/* ─── LIVE ROUNDS (active bot games) ─── */}
      {liveGames.length > 0 && (
        <div style={s.recentSection} className="card-enter">
          <div style={s.recentHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LiveDot color="#34d399" size={8} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Live Rounds
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>{liveGames.length}</span>
          </div>
          <div style={s.recentScroll}>
            {liveGames.map(g => (
              <LiveRunningCard key={g.id} game={g} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Recent Public Games ─── */}
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
        {recentPublic.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: theme.text.muted }}>No recent games</span>
          </div>
        ) : (
          <div style={s.recentScroll}>
            {recentPublic.map(g => {
              const wasCashOut = g.status === 'cashed_out';
              const cashMult = parseFloat(g.cashOutMultiplier || '0');
              const rugMult = parseFloat(g.rugMultiplier || '1');
              const profit = wasCashOut ? (g.payout || 0) - g.betAmount : -g.betAmount;
              return (
                <div key={g.id} style={{
                  ...s.recentGameCard,
                  borderLeft: `3px solid ${wasCashOut ? '#34d399' : '#f87171'}`,
                }} className="card-enter">
                  <MiniCandleChart rugMult={rugMult} cashed={wasCashOut} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: getAvatarGradient(null, g.username || '?'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700, color: '#fff',
                    }}>
                      {getInitials(g.username || '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.username || 'Player'}
                        </span>
                        <StatusBadge status={wasCashOut ? 'cashed' : 'rugged'} />
                      </div>
                      <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '2px' }}>
                        {formatSol(g.betAmount)} SOL · {g.resolvedAt ? timeAgo(g.resolvedAt) : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    <MultiplierBadge value={wasCashOut ? cashMult : rugMult} />
                    <span className={`mono ${wasCashOut ? 'glow-green' : 'glow-red'}`} style={{
                      fontSize: '13px', fontWeight: 800,
                      color: wasCashOut ? '#34d399' : '#f87171',
                    }}>
                      {wasCashOut ? `+${formatSol(profit)}` : `-${formatSol(g.betAmount)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works */}
      <div style={s.howItWorks}>
        <div style={s.howStep}><span style={s.howIcon}>💰</span><span style={s.howLabel}>Place Bet</span></div>
        <div style={s.howDivider} />
        <div style={s.howStep}><span style={s.howIcon}>📈</span><span style={s.howLabel}>Watch Climb</span></div>
        <div style={s.howDivider} />
        <div style={s.howStep}><span style={s.howIcon}>💸</span><span style={s.howLabel}>Cash Out</span></div>
        <div style={s.howDivider} />
        <div style={s.howStep}><span style={s.howIcon}>💀</span><span style={s.howLabel}>Or Get Rugged</span></div>
      </div>

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
          type="range"
          min="0.01"
          max="1"
          step="0.01"
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

      {/* Start Game button */}
      <button
        style={s.startBtn}
        onClick={handleStart}
        disabled={loading || betAmount <= 0}
        className="hover-scale"
      >
        <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '0.5px' }}>
          {loading ? 'Starting...' : '🎰 Start Game'}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7 }}>
          {formatSol(betAmount)} SOL
        </span>
      </button>

      {/* Potential payout */}
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
                        <span style={{ fontSize: '11px', color: theme.text.muted }}>
                          {new Date(g.resolvedAt).toLocaleDateString()}
                        </span>
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
    display: 'flex', flexDirection: 'column', gap: '16px',
    padding: '16px', minHeight: '100%', boxSizing: 'border-box',
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
  // Recent section
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
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 16px', background: theme.bg.primary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    transition: 'background 0.15s ease',
  },
  howItWorks: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    padding: '12px 14px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  howStep: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '3px' },
  howIcon: { fontSize: '18px' },
  howLabel: { fontSize: '10px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' },
  howDivider: { width: '20px', height: '1px', background: theme.border.subtle },
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
    ['--glow-color' as any]: 'rgba(251, 191, 36, 0.2)',
    ['--glow-border' as any]: 'rgba(251, 191, 36, 0.4)',
  },
  betBtnActive: {
    background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24',
  },
  customBetInput: {
    flex: 1, padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, color: theme.text.primary, fontSize: '15px', fontWeight: 700,
    outline: 'none', fontFamily: "'JetBrains Mono', monospace", minWidth: 0,
  },
  startBtn: {
    padding: '18px 28px', background: 'linear-gradient(135deg, #059669, #34d399)',
    border: 'none', borderRadius: '14px', color: '#fff',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px',
    boxShadow: '0 4px 20px rgba(52, 211, 153, 0.3)',
    animation: 'neonGlow 2s ease-in-out infinite',
    ['--glow-color' as any]: 'rgba(52, 211, 153, 0.3)',
  },
  payoutInfo: {
    display: 'flex', flexDirection: 'column' as const, gap: '6px',
    padding: '14px 16px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`, fontSize: '13px', fontWeight: 600,
    color: theme.text.muted,
  },
  chartContainer: {
    width: '100%', height: '300px', borderRadius: '12px', overflow: 'hidden',
    border: '1px solid rgba(119,23,255,0.12)', position: 'relative' as const,
  },
  cashOutBtn: {
    padding: '22px', background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(52,211,153,0.05))',
    border: '2px solid rgba(52,211,153,0.5)', borderRadius: '16px', color: '#34d399',
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', gap: '4px', transition: 'all 0.15s',
    animation: 'neonGlow 1.5s ease-in-out infinite',
    ['--glow-color' as any]: 'rgba(52, 211, 153, 0.4)',
    boxShadow: '0 4px 20px rgba(52, 211, 153, 0.2)',
  },
  playAgainBtn: {
    flex: 1, padding: '14px', background: theme.accent.purple, border: 'none', borderRadius: '12px',
    color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  lobbyBtn: {
    padding: '14px 24px', background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px', color: theme.text.secondary, fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  historyToggle: {
    padding: '10px', borderRadius: '10px', border: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '13px', fontWeight: 700, color: theme.text.muted, transition: 'all 0.15s',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px',
    padding: '24px', background: theme.bg.secondary, borderRadius: '12px',
    border: `1px solid ${theme.border.subtle}`,
  },
  historyCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: theme.bg.secondary, borderRadius: '10px',
    border: `1px solid ${theme.border.subtle}`,
  },
};
