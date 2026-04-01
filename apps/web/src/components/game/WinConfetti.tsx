import { useEffect, useRef } from 'react';

export interface WinConfettiProps {
  /** When true, fires a confetti burst. Set false to stop/cleanup. */
  active: boolean;
  /** Number of particles (default: 80) */
  count?: number;
  /** Confetti colors (default: green/purple/blue/pink mix) */
  colors?: string[];
  /** z-index (default: 5, should be below ResultOverlay's 10) */
  zIndex?: number;
}

const DEFAULT_COLORS = ['#00E701', '#10b981', '#8b5cf6', '#a78bfa', '#3b82f6', '#f472b6', '#fbbf24'];

/**
 * Wave 1B — Lightweight confetti burst for win celebrations.
 *
 * Adapted from the existing PredictionScreen confetti canvas.
 * - Short burst (~2s, 200 frames)
 * - Gravity + fade-out
 * - Canvas-based for performance
 * - Auto-cleans up on unmount or active=false
 * - Position: absolute, covers parent container
 */
export function WinConfetti({
  active,
  count = 80,
  colors = DEFAULT_COLORS,
  zIndex = 5,
}: WinConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI setup
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    // Generate particles
    const particles = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.4,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 2,
      size: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      alpha: 1,
    }));

    let frame = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, w, h);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;        // gravity
        p.vx *= 0.99;        // air resistance
        p.rotation += p.rotSpeed;
        p.alpha = Math.max(0, p.alpha - 0.005);

        if (p.alpha <= 0) continue;
        alive = true;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        // Rectangular confetti piece (wider than tall)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      frame++;
      if (alive && frame < 200) {
        requestAnimationFrame(tick);
      } else {
        // Cleanup: clear canvas when done
        ctx.clearRect(0, 0, w, h);
      }
    };

    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [active, count, colors]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
}
