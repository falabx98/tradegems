import { useRef, useEffect, useCallback } from 'react';
import { RoundConfig, RoundPhase, GameNode } from '../../types/game';
import { getPriceAtTime } from '../../engine/chartGenerator';
import { getPhaseColor } from '../../engine/roundEngine';
import { theme } from '../../styles/theme';

interface ChartArenaProps {
  config: RoundConfig;
  elapsed: number;
  phase: RoundPhase;
  activatedNodeIds: Set<string>;
  missedNodeIds: Set<string>;
  onNodeActivated: (node: GameNode) => void;
  onNodeMissed: (node: GameNode) => void;
  onNodeNearMissed?: (node: GameNode) => void;
  currentMultiplier: number;
}

const PADDING = { top: 40, right: 30, bottom: 40, left: 55 };
const NODE_LOOKAHEAD = 4; // seconds ahead to show nodes

export function ChartArena({
  config,
  elapsed,
  phase,
  activatedNodeIds,
  missedNodeIds,
  onNodeActivated,
  onNodeMissed,
  onNodeNearMissed,
}: ChartArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const processedNodesRef = useRef<Set<string>>(new Set());

  const getCanvasSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { width: 800, height: 400 };
    return {
      width: container.clientWidth,
      height: container.clientHeight,
    };
  }, []);

  // Process node activation
  useEffect(() => {
    if (phase === 'frozen' || phase === 'pre' || phase === 'result') return;

    for (const node of config.nodes) {
      if (processedNodesRef.current.has(node.id)) continue;
      if (node.timePosition > elapsed) continue;

      processedNodesRef.current.add(node.id);
      const chartPrice = getPriceAtTime(config.chartPath, node.timePosition);
      const distance = Math.abs(chartPrice - node.pathY);

      if (distance <= node.activationRadius) {
        onNodeActivated(node);
      } else if (node.nearMissRadius && distance <= node.nearMissRadius) {
        onNodeNearMissed?.(node);
        onNodeMissed(node); // Still counts as missed for gameplay
      } else {
        onNodeMissed(node);
      }
    }
  }, [elapsed, config, phase, onNodeActivated, onNodeMissed, onNodeNearMissed]);

  // Reset processed nodes when config changes
  useEffect(() => {
    processedNodesRef.current = new Set();
  }, [config.roundId]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width, height } = getCanvasSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      const chartArea = {
        x: PADDING.left,
        y: PADDING.top,
        w: width - PADDING.left - PADDING.right,
        h: height - PADDING.top - PADDING.bottom,
      };

      ctx.clearRect(0, 0, width, height);

      drawBackground(ctx, width, height, phase, elapsed);
      drawGrid(ctx, chartArea, elapsed);
      drawPhaseZones(ctx, chartArea, config.duration, elapsed);
      drawChartPath(ctx, config, chartArea, elapsed);
      drawNodes(ctx, config, chartArea, elapsed, activatedNodeIds, missedNodeIds);

      if (elapsed > 0 && elapsed <= config.duration) {
        drawLeadingPoint(ctx, config, chartArea, elapsed);
      }

      drawPriceScale(ctx, chartArea);
      drawTimeScale(ctx, chartArea, config.duration, elapsed);

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [config, elapsed, phase, activatedNodeIds, missedNodeIds, getCanvasSize]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '300px',
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        background: theme.bg.secondary,
        border: `1px solid ${theme.border.subtle}`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

// ─── Drawing Functions ───────────────────────────────────────────────────────

type Area = { x: number; y: number; w: number; h: number };

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, _phase: RoundPhase, elapsed: number) {
  // Deep dark base
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // Radial vignette / glow from center
  const cx = w / 2;
  const cy = h / 2;
  const radGrad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy, Math.max(w, h) * 0.7);
  radGrad.addColorStop(0, 'rgba(153, 69, 255, 0.07)');
  radGrad.addColorStop(0.4, 'rgba(80, 40, 180, 0.03)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // Animated horizontal scan beam (purple, slow)
  const scanY = ((elapsed * 0.12) % 1) * h;
  const scanGrad = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
  scanGrad.addColorStop(0, 'rgba(153, 69, 255, 0)');
  scanGrad.addColorStop(0.4, 'rgba(153, 69, 255, 0.045)');
  scanGrad.addColorStop(0.5, 'rgba(153, 69, 255, 0.06)');
  scanGrad.addColorStop(0.6, 'rgba(153, 69, 255, 0.045)');
  scanGrad.addColorStop(1, 'rgba(153, 69, 255, 0)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(0, scanY - 50, w, 100);

  // Scan line (thin bright line at center of beam)
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(w, scanY);
  ctx.stroke();

  // Second faster scan beam (teal accent)
  const scan2Y = ((elapsed * 0.2 + 0.5) % 1) * h;
  const scan2Grad = ctx.createLinearGradient(0, scan2Y - 35, 0, scan2Y + 35);
  scan2Grad.addColorStop(0, 'rgba(20, 241, 149, 0)');
  scan2Grad.addColorStop(0.4, 'rgba(20, 241, 149, 0.025)');
  scan2Grad.addColorStop(0.5, 'rgba(20, 241, 149, 0.04)');
  scan2Grad.addColorStop(0.6, 'rgba(20, 241, 149, 0.025)');
  scan2Grad.addColorStop(1, 'rgba(20, 241, 149, 0)');
  ctx.fillStyle = scan2Grad;
  ctx.fillRect(0, scan2Y - 35, w, 70);

  // Teal scan line
  ctx.strokeStyle = 'rgba(20, 241, 149, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scan2Y);
  ctx.lineTo(w, scan2Y);
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, area: Area, elapsed: number) {
  const time = elapsed || performance.now() / 1000;

  // ─── Horizontal grid lines with animated fade ─────────────
  const hLines = 12;
  for (let i = 0; i <= hLines; i++) {
    const y = area.y + (area.h * i) / hLines;
    const distFromCenter = Math.abs(i - hLines / 2) / (hLines / 2);

    // Animated brightness pulse: each line subtly pulses at different phase
    const pulse = Math.sin(time * 0.8 + i * 0.5) * 0.3 + 0.7;
    const alpha = (0.045 + (1 - distFromCenter) * 0.035) * pulse;

    ctx.strokeStyle = `rgba(153, 69, 255, ${alpha})`;
    ctx.lineWidth = i === hLines / 2 ? 1.0 : 0.6;
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
  }

  // ─── Vertical grid lines with animated pulse ──────────────
  const vLines = 18;
  for (let i = 0; i <= vLines; i++) {
    const x = area.x + (area.w * i) / vLines;

    // Vertical lines pulse outward from the elapsed position
    const elapsedFraction = (elapsed || 0) / 15;
    const lineFraction = i / vLines;
    const distFromElapsed = Math.abs(lineFraction - elapsedFraction);
    const proximity = Math.max(0, 1 - distFromElapsed * 4);

    const basePulse = Math.sin(time * 0.6 + i * 0.4) * 0.25 + 0.75;
    const alpha = (0.035 + proximity * 0.06) * basePulse;

    ctx.strokeStyle = `rgba(153, 69, 255, ${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, area.y);
    ctx.lineTo(x, area.y + area.h);
    ctx.stroke();
  }

  // ─── Glowing intersection dots ────────────────────────────
  const dotRows = 6;
  const dotCols = 6;
  for (let r = 0; r <= dotRows; r++) {
    for (let c = 0; c <= dotCols; c++) {
      const x = area.x + (area.w * c) / dotCols;
      const y = area.y + (area.h * r) / dotRows;

      // Each dot pulses at a unique phase
      const dotPhase = Math.sin(time * 1.2 + r * 1.1 + c * 0.9);
      const dotAlpha = 0.10 + dotPhase * 0.06;
      const dotSize = 1.2 + dotPhase * 0.6;

      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(153, 69, 255, ${dotAlpha})`;
      ctx.fill();
    }
  }

  // ─── Floating micro-particles ─────────────────────────────
  const particleCount = 15;
  for (let p = 0; p < particleCount; p++) {
    // Deterministic but animated positions using sin/cos
    const seed1 = p * 7.31;
    const seed2 = p * 13.17;
    const px = area.x + ((Math.sin(seed1 + time * 0.3) * 0.5 + 0.5) * area.w);
    const py = area.y + ((Math.cos(seed2 + time * 0.2) * 0.5 + 0.5) * area.h);

    const pAlpha = (Math.sin(time * 1.5 + p * 2.3) * 0.5 + 0.5) * 0.12;
    const pSize = 1.0 + Math.sin(time + p) * 0.5;

    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fillStyle = p % 3 === 0
      ? `rgba(20, 241, 149, ${pAlpha})`
      : `rgba(153, 69, 255, ${pAlpha})`;
    ctx.fill();
  }

  // ─── Edge glow borders ────────────────────────────────────
  // Top edge glow
  const topGrad = ctx.createLinearGradient(area.x, area.y, area.x, area.y + 40);
  topGrad.addColorStop(0, 'rgba(153, 69, 255, 0.10)');
  topGrad.addColorStop(1, 'rgba(153, 69, 255, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(area.x, area.y, area.w, 40);

  // Top border line
  ctx.strokeStyle = `rgba(153, 69, 255, ${0.08 + Math.sin(time * 1.5) * 0.04})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, area.y);
  ctx.lineTo(area.x + area.w, area.y);
  ctx.stroke();

  // Bottom edge glow
  const botGrad = ctx.createLinearGradient(area.x, area.y + area.h - 40, area.x, area.y + area.h);
  botGrad.addColorStop(0, 'rgba(153, 69, 255, 0)');
  botGrad.addColorStop(1, 'rgba(153, 69, 255, 0.08)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(area.x, area.y + area.h - 40, area.w, 40);

  // Bottom border line
  ctx.strokeStyle = `rgba(153, 69, 255, ${0.06 + Math.sin(time * 1.5 + 1) * 0.03})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h);
  ctx.stroke();

  // Left edge glow
  const leftGrad = ctx.createLinearGradient(area.x, area.y, area.x + 25, area.y);
  leftGrad.addColorStop(0, 'rgba(153, 69, 255, 0.06)');
  leftGrad.addColorStop(1, 'rgba(153, 69, 255, 0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(area.x, area.y, 25, area.h);

  // Right edge glow
  const rightGrad = ctx.createLinearGradient(area.x + area.w - 25, area.y, area.x + area.w, area.y);
  rightGrad.addColorStop(0, 'rgba(153, 69, 255, 0)');
  rightGrad.addColorStop(1, 'rgba(153, 69, 255, 0.04)');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(area.x + area.w - 25, area.y, 25, area.h);

  // ─── Corner accents (futuristic bracket corners) ──────────
  const cornerLen = 20;
  const cornerAlpha = 0.15 + Math.sin(time * 2) * 0.05;
  ctx.strokeStyle = `rgba(153, 69, 255, ${cornerAlpha})`;
  ctx.lineWidth = 1.5;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + cornerLen);
  ctx.lineTo(area.x, area.y);
  ctx.lineTo(area.x + cornerLen, area.y);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(area.x + area.w - cornerLen, area.y);
  ctx.lineTo(area.x + area.w, area.y);
  ctx.lineTo(area.x + area.w, area.y + cornerLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + area.h - cornerLen);
  ctx.lineTo(area.x, area.y + area.h);
  ctx.lineTo(area.x + cornerLen, area.y + area.h);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(area.x + area.w - cornerLen, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h - cornerLen);
  ctx.stroke();
}

function drawPhaseZones(ctx: CanvasRenderingContext2D, area: Area, duration: number, elapsed: number) {
  // Subtle colored tint for active phase zone
  const phases = [
    { start: 0, end: 2, color: '#4ade8008' },
    { start: 2, end: 6, color: '#facc1506' },
    { start: 6, end: 11, color: '#ef444408' },
    { start: 11, end: 15, color: '#a855f706' },
  ];

  for (const p of phases) {
    if (elapsed >= p.start && elapsed < p.end) {
      const x0 = area.x + (p.start / duration) * area.w;
      const x1 = area.x + (p.end / duration) * area.w;
      ctx.fillStyle = p.color;
      ctx.fillRect(x0, area.y, x1 - x0, area.h);
      break;
    }
  }
}

function drawChartPath(ctx: CanvasRenderingContext2D, config: RoundConfig, area: Area, elapsed: number) {
  const { chartPath, duration } = config;
  const visiblePoints = chartPath.points.filter(p => p.time <= elapsed);
  if (visiblePoints.length < 2) return;

  // Area fill under curve
  ctx.beginPath();
  ctx.moveTo(area.x + (visiblePoints[0].time / duration) * area.w, area.y + area.h);

  for (const point of visiblePoints) {
    ctx.lineTo(
      area.x + (point.time / duration) * area.w,
      area.y + (1 - point.price) * area.h
    );
  }

  const last = visiblePoints[visiblePoints.length - 1];
  ctx.lineTo(area.x + (last.time / duration) * area.w, area.y + area.h);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(area.x, 0, area.x + area.w, 0);
  fillGrad.addColorStop(0, 'rgba(153, 69, 255, 0.08)');
  fillGrad.addColorStop(0.5, 'rgba(140, 120, 255, 0.06)');
  fillGrad.addColorStop(1, 'rgba(153, 69, 255, 0.04)');

  const fillVertGrad = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
  fillVertGrad.addColorStop(0, 'rgba(153, 69, 255, 0.10)');
  fillVertGrad.addColorStop(1, 'rgba(153, 69, 255, 0)');
  ctx.fillStyle = fillVertGrad;
  ctx.fill();

  // Main line with blue→purple gradient
  const lineGrad = ctx.createLinearGradient(area.x, 0, area.x + area.w, 0);
  lineGrad.addColorStop(0, '#9945FF');
  lineGrad.addColorStop(0.5, '#8b7bff');
  lineGrad.addColorStop(1, '#9945FF');

  ctx.save();
  ctx.shadowColor = 'rgba(153, 69, 255, 0.25)';
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.moveTo(
    area.x + (visiblePoints[0].time / duration) * area.w,
    area.y + (1 - visiblePoints[0].price) * area.h
  );

  for (let i = 1; i < visiblePoints.length; i++) {
    ctx.lineTo(
      area.x + (visiblePoints[i].time / duration) * area.w,
      area.y + (1 - visiblePoints[i].price) * area.h
    );
  }

  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Thin bright overlay line (no shadow, for crispness)
  ctx.beginPath();
  ctx.moveTo(
    area.x + (visiblePoints[0].time / duration) * area.w,
    area.y + (1 - visiblePoints[0].price) * area.h
  );
  for (let i = 1; i < visiblePoints.length; i++) {
    ctx.lineTo(
      area.x + (visiblePoints[i].time / duration) * area.w,
      area.y + (1 - visiblePoints[i].price) * area.h
    );
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  config: RoundConfig,
  area: Area,
  elapsed: number,
  activatedIds: Set<string>,
  missedIds: Set<string>
) {
  const { duration } = config;

  for (const node of config.nodes) {
    if (node.timePosition > elapsed + NODE_LOOKAHEAD) continue;

    const x = area.x + (node.timePosition / duration) * area.w;
    const y = area.y + (1 - node.pathY) * area.h;

    const isActivated = activatedIds.has(node.id);
    const isMissed = missedIds.has(node.id);
    const isUpcoming = !isActivated && !isMissed && node.timePosition > elapsed;
    const isApproaching = isUpcoming && node.timePosition - elapsed < 2;

    if (isActivated) {
      drawActivatedNode(ctx, x, y, node, elapsed);
    } else if (isMissed) {
      drawMissedNode(ctx, x, y, node);
    } else if (isApproaching) {
      drawApproachingNode(ctx, x, y, node, elapsed);
    } else if (isUpcoming) {
      drawUpcomingNode(ctx, x, y, node);
    }
  }
}

function getNodeColor(node: GameNode): string {
  switch (node.type) {
    case 'multiplier': return '#34d399';
    case 'divider': return '#f87171';
    case 'shield': return '#5b8def';
    case 'fake_breakout': return '#fbbf24';
    case 'volatility_spike': return '#8b8bf5';
    default: return '#fff';
  }
}

function getNodeLabel(node: GameNode): string {
  switch (node.type) {
    case 'multiplier': return `x${node.value}`;
    case 'divider': return `÷${node.value}`;
    case 'shield': return 'SH';
    case 'fake_breakout': return '!!';
    case 'volatility_spike': return '~';
    default: return '';
  }
}

function drawNodeBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  radius: number,
  alpha: number,
  glowStrength: number,
  fontSize: number
) {
  ctx.save();

  if (glowStrength > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glowStrength;
  }

  // Background circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const a = Math.floor(alpha * 30).toString(16).padStart(2, '0');
  ctx.fillStyle = `${color}${a}`;
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const ba = Math.floor(alpha * 200).toString(16).padStart(2, '0');
  ctx.strokeStyle = `${color}${ba}`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  // Label
  const la = Math.floor(alpha * 255).toString(16).padStart(2, '0');
  ctx.fillStyle = `${color}${la}`;
  ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function drawUpcomingNode(ctx: CanvasRenderingContext2D, x: number, y: number, node: GameNode) {
  const color = getNodeColor(node);
  const label = getNodeLabel(node);
  const radius = getRarityRadius(node);
  drawNodeBadge(ctx, x, y, label, color, radius, 0.4, 0, 11);
}

function drawApproachingNode(ctx: CanvasRenderingContext2D, x: number, y: number, node: GameNode, elapsed: number) {
  const color = getNodeColor(node);
  const label = getNodeLabel(node);
  const radius = getRarityRadius(node) + 2;

  // Pulse ring animation
  const pulse = (elapsed * 3) % 1;
  const pulseR = radius + pulse * 12;
  const pulseA = Math.floor((1 - pulse) * 50).toString(16).padStart(2, '0');
  ctx.beginPath();
  ctx.arc(x, y, pulseR, 0, Math.PI * 2);
  ctx.strokeStyle = `${color}${pulseA}`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Second pulse (offset)
  const pulse2 = ((elapsed * 3) + 0.5) % 1;
  const pulseR2 = radius + pulse2 * 12;
  const pulseA2 = Math.floor((1 - pulse2) * 30).toString(16).padStart(2, '0');
  ctx.beginPath();
  ctx.arc(x, y, pulseR2, 0, Math.PI * 2);
  ctx.strokeStyle = `${color}${pulseA2}`;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawNodeBadge(ctx, x, y, label, color, radius, 1.0, 20, 13);
}

function drawActivatedNode(ctx: CanvasRenderingContext2D, x: number, y: number, node: GameNode, elapsed: number) {
  const color = getNodeColor(node);
  const label = getNodeLabel(node);
  const timeSince = elapsed - node.timePosition;
  const fade = Math.max(0, 1 - timeSince / 2.5);
  if (fade <= 0) return;

  // Expanding shockwave rings
  for (let r = 0; r < 3; r++) {
    const ringDelay = r * 0.15;
    const ringT = Math.max(0, timeSince - ringDelay);
    const ringFade = Math.max(0, 1 - ringT / 1.5);
    if (ringFade <= 0) continue;
    const ringRadius = 16 + ringT * 25;
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    const ra = Math.floor(ringFade * 40).toString(16).padStart(2, '0');
    ctx.strokeStyle = `${color}${ra}`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Core glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * fade;
  ctx.beginPath();
  ctx.arc(x, y, 10 * fade, 0, Math.PI * 2);
  const fa = Math.floor(fade * 140).toString(16).padStart(2, '0');
  ctx.fillStyle = `${color}${fa}`;
  ctx.fill();
  ctx.restore();

  // Floating label
  if (fade > 0.2) {
    const la = Math.floor(fade * 255).toString(16).padStart(2, '0');
    ctx.fillStyle = `${color}${la}`;
    ctx.font = `bold ${12 + timeSince * 3}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - timeSince * 12);
  }
}

function drawMissedNode(ctx: CanvasRenderingContext2D, x: number, y: number, node: GameNode) {
  const color = getNodeColor(node);
  const label = getNodeLabel(node);

  // Dashed faded ring
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = `${color}15`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Very faded label
  ctx.fillStyle = `${color}20`;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

function getRarityRadius(node: GameNode): number {
  switch (node.rarity) {
    case 'legendary': return 22;
    case 'rare': return 20;
    case 'uncommon': return 18;
    default: return 16;
  }
}

function drawLeadingPoint(ctx: CanvasRenderingContext2D, config: RoundConfig, area: Area, elapsed: number) {
  const price = getPriceAtTime(config.chartPath, elapsed);
  const x = area.x + (elapsed / config.duration) * area.w;
  const y = area.y + (1 - price) * area.h;

  // Large outer glow
  ctx.save();
  ctx.shadowColor = '#9945FF';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(153, 69, 255, 0.15)';
  ctx.fill();

  // Inner bright point
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#9945FF';
  ctx.fill();
  ctx.restore();

  // White core
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Horizontal price reference line
  ctx.beginPath();
  ctx.moveTo(area.x, y);
  ctx.lineTo(x - 14, y);
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Current price badge on left axis
  const priceLabel = (price * 100).toFixed(1);
  const badgeW = 38;
  const badgeH = 18;

  ctx.fillStyle = 'rgba(153, 69, 255, 0.15)';
  ctx.beginPath();
  ctx.roundRect(area.x - badgeW - 4, y - badgeH / 2, badgeW, badgeH, 3);
  ctx.fill();

  ctx.fillStyle = '#9945FF';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceLabel, area.x - badgeW / 2 - 4, y);
}

function drawPriceScale(ctx: CanvasRenderingContext2D, area: Area) {
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= 4; i++) {
    const p = i / 4;
    const y = area.y + (1 - p) * area.h;
    ctx.fillText(`${(p * 100).toFixed(0)}`, area.x - 8, y + 3);
  }
}

function drawTimeScale(ctx: CanvasRenderingContext2D, area: Area, duration: number, elapsed: number) {
  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  for (let t = 0; t <= 15; t += 3) {
    const x = area.x + (t / duration) * area.w;
    const isPast = t <= elapsed;
    ctx.fillStyle = isPast ? 'rgba(153, 69, 255, 0.25)' : 'rgba(255,255,255,0.12)';
    ctx.fillText(`${t}s`, x, area.y + area.h + 20);
  }

  // Progress tick
  if (elapsed > 0 && elapsed <= duration) {
    const px = area.x + (elapsed / duration) * area.w;
    ctx.beginPath();
    ctx.moveTo(px, area.y + area.h + 2);
    ctx.lineTo(px, area.y + area.h + 8);
    ctx.strokeStyle = '#9945FF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
