import { useEffect, useRef } from 'react';
import type { Candle, PredictionDirection, PredictionPhase } from '../../engine/predictionEngine';

interface Props {
  historicalCandles: Candle[];
  revealCandles: Candle[];
  revealProgress: number; // seconds elapsed in reveal phase
  entryPrice: number;
  phase: PredictionPhase;
  prediction: PredictionDirection | null;
  isMobile: boolean;
}

const CANDLE_REVEAL_DURATION = 1.5; // seconds per candle

const BULL_COLOR = '#34d399';
const BEAR_COLOR = '#f87171';
const GRID_COLOR = 'rgba(119, 23, 255, 0.06)';
const GRID_TEXT = 'rgba(255,255,255,0.35)';
const ENTRY_COLOR = '#c084fc';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

export function CandlestickChart({
  historicalCandles,
  revealCandles,
  revealProgress,
  entryPrice,
  phase,
  prediction,
  isMobile,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      // Padding
      const pad = { top: 30, right: isMobile ? 50 : 65, bottom: 40, left: 12 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const volumeH = chartH * 0.12;
      const priceH = chartH - volumeH - 8;

      // Determine visible candles
      const revealedIdx = phase === 'result'
        ? revealCandles.length
        : phase === 'revealing'
        ? Math.min(revealCandles.length, Math.floor(revealProgress / CANDLE_REVEAL_DURATION) + 1)
        : 0;
      const visibleReveal = revealCandles.slice(0, revealedIdx);
      const allVisible = [...historicalCandles, ...visibleReveal];
      const totalSlots = historicalCandles.length + revealCandles.length;

      // Forming candle progress (0-1 for currently forming candle)
      const formingProgress = phase === 'revealing'
        ? (revealProgress % CANDLE_REVEAL_DURATION) / CANDLE_REVEAL_DURATION
        : 1;

      // Price range
      let pMin = Infinity, pMax = -Infinity, vMax = 0;
      for (const c of allVisible) {
        if (c.low < pMin) pMin = c.low;
        if (c.high > pMax) pMax = c.high;
        if (c.volume > vMax) vMax = c.volume;
      }
      // Also consider entry price
      if (entryPrice < pMin) pMin = entryPrice;
      if (entryPrice > pMax) pMax = entryPrice;
      const pPad = (pMax - pMin) * 0.12 || 1;
      pMin -= pPad;
      pMax += pPad;

      const priceToY = (p: number) => pad.top + priceH * (1 - (p - pMin) / (pMax - pMin));
      const candleSlotW = chartW / totalSlots;
      const candleBodyW = Math.max(3, candleSlotW * 0.6);
      const candleX = (idx: number) => pad.left + candleSlotW * idx + candleSlotW / 2;

      // ─── 1. Background ───────────────────────────────────────
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, w, h);

      // Vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      vg.addColorStop(0, 'rgba(119, 23, 255, 0.03)');
      vg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // ─── 2. Grid ─────────────────────────────────────────────
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      const priceStep = niceStep(pMax - pMin, 5);
      const startPrice = Math.ceil(pMin / priceStep) * priceStep;
      ctx.font = `600 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let p = startPrice; p <= pMax; p += priceStep) {
        const y = priceToY(p);
        if (y < pad.top || y > pad.top + priceH) continue;
        ctx.beginPath();
        ctx.setLineDash([2, 4]);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = GRID_TEXT;
        ctx.fillText(p.toFixed(2), w - 6, y);
      }

      // Vertical separator between historical & reveal
      if (phase !== 'setup') {
        const sepX = candleX(historicalCandles.length) - candleSlotW / 2;
        ctx.strokeStyle = 'rgba(119, 23, 255, 0.15)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sepX, pad.top);
        ctx.lineTo(sepX, pad.top + priceH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ─── 3. Volume bars ──────────────────────────────────────
      const volBase = pad.top + priceH + 8;
      for (let i = 0; i < allVisible.length; i++) {
        const c = allVisible[i];
        const x = candleX(i);
        const isBull = c.close >= c.open;
        const volH = vMax > 0 ? (c.volume / vMax) * volumeH : 0;

        // If this is the last revealed candle and still forming, scale volume
        const isForming = phase === 'revealing' && i === allVisible.length - 1 && revealedIdx <= revealCandles.length;
        const scale = isForming ? easeOutCubic(formingProgress) : 1;

        ctx.fillStyle = isBull ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)';
        ctx.fillRect(x - candleBodyW / 2, volBase + volumeH - volH * scale, candleBodyW, volH * scale);
      }

      // ─── 4. Candles ──────────────────────────────────────────
      for (let i = 0; i < allVisible.length; i++) {
        const c = allVisible[i];
        const x = candleX(i);
        const isForming = phase === 'revealing' && i === allVisible.length - 1 && revealedIdx <= revealCandles.length;

        let open = c.open, close = c.close, high = c.high, low = c.low;
        if (isForming) {
          const t = easeOutCubic(formingProgress);
          close = open + (c.close - open) * t;
          const mid = (c.high + c.low) / 2;
          high = mid + (c.high - mid) * Math.min(1, t * 1.3);
          low = mid - (mid - c.low) * Math.min(1, t * 1.3);
        }

        const isBull = close >= open;
        const color = isBull ? BULL_COLOR : BEAR_COLOR;

        // Wick
        ctx.strokeStyle = color + '99';
        ctx.lineWidth = isMobile ? 1 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x, priceToY(high));
        ctx.lineTo(x, priceToY(low));
        ctx.stroke();

        // Body
        const yTop = priceToY(Math.max(open, close));
        const yBot = priceToY(Math.min(open, close));
        const bodyH = Math.max(1, yBot - yTop);
        ctx.fillStyle = color;
        ctx.fillRect(x - candleBodyW / 2, yTop, candleBodyW, bodyH);

        // Glow for reveal candles
        if (!c.isHistorical && !isForming) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
          ctx.fillRect(x - candleBodyW / 2, yTop, candleBodyW, bodyH);
          ctx.shadowBlur = 0;
        }
      }

      // ─── 5. Entry price line ─────────────────────────────────
      const entryY = priceToY(entryPrice);
      ctx.strokeStyle = ENTRY_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, entryY);
      ctx.lineTo(pad.left + chartW, entryY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Entry label
      ctx.fillStyle = ENTRY_COLOR;
      ctx.font = `700 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const labelText = `Entry ${entryPrice.toFixed(2)}`;
      const lw = ctx.measureText(labelText).width + 8;
      ctx.fillStyle = 'rgba(192, 132, 252, 0.15)';
      ctx.beginPath();
      ctx.roundRect(w - 4 - lw, entryY - 9, lw, 18, 4);
      ctx.fill();
      ctx.fillStyle = ENTRY_COLOR;
      ctx.fillText(labelText, w - 8, entryY);

      // ─── 6. Prediction indicator ─────────────────────────────
      if (prediction && (phase === 'revealing' || phase === 'countdown')) {
        const px = pad.left + 10;
        const py = pad.top + 10;
        ctx.font = "bold 14px inherit";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const labels: Record<PredictionDirection, { text: string; color: string }> = {
          long: { text: '▲ LONG', color: BULL_COLOR },
          short: { text: '▼ SHORT', color: BEAR_COLOR },
          range: { text: '◆ RANGE', color: '#fbbf24' },
        };
        const lbl = labels[prediction];
        ctx.fillStyle = lbl.color + '30';
        ctx.beginPath();
        ctx.roundRect(px - 4, py - 2, ctx.measureText(lbl.text).width + 12, 22, 6);
        ctx.fill();
        ctx.fillStyle = lbl.color;
        ctx.fillText(lbl.text, px, py);
      }

      // ─── 7. Result overlay on chart ──────────────────────────
      if (phase === 'result' && revealCandles.length > 0) {
        const exitPrice = revealCandles[revealCandles.length - 1].close;
        const exitY = priceToY(exitPrice);
        const change = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2);
        const isUp = exitPrice >= entryPrice;
        ctx.strokeStyle = isUp ? BULL_COLOR : BEAR_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.left, exitY);
        ctx.lineTo(pad.left + chartW, exitY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Exit label
        ctx.font = `700 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        const exitText = `Exit ${exitPrice.toFixed(2)} (${isUp ? '+' : ''}${change}%)`;
        const ew = ctx.measureText(exitText).width + 8;
        ctx.fillStyle = isUp ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)';
        ctx.beginPath();
        ctx.roundRect(pad.left + 4, exitY - 9, ew, 18, 4);
        ctx.fill();
        ctx.fillStyle = isUp ? BULL_COLOR : BEAR_COLOR;
        ctx.fillText(exitText, pad.left + 8, exitY + 4);
      }

      // Continue animation during reveal phase
      if (phase === 'revealing') {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    // Schedule draw on next frame to ensure container has dimensions
    rafRef.current = requestAnimationFrame(() => {
      draw();
    });

    // Redraw on resize
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [historicalCandles, revealCandles, revealProgress, entryPrice, phase, prediction, isMobile]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(119, 23, 255, 0.12)',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step: number;
  if (norm <= 1.5) step = 1;
  else if (norm <= 3) step = 2;
  else if (norm <= 7) step = 5;
  else step = 10;
  return step * mag;
}
