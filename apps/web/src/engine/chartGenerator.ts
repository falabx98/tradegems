import { ChartPath, ChartPoint } from '../types/game';
import { SeededRandom } from './seededRandom';

const ROUND_DURATION = 15;
const POINTS_PER_SECOND = 60; // higher resolution for smooth curves
const TOTAL_POINTS = ROUND_DURATION * POINTS_PER_SECOND;

interface PhaseConfig {
  start: number;
  end: number;
  volatility: number;
  trendBias: number;
  waveAmplitude: number;
  waveFrequency: number;
}

const PHASES: PhaseConfig[] = [
  // Opening: 0-2s - gentle upward momentum, low volatility
  { start: 0, end: 2, volatility: 0.08, trendBias: 0.4, waveAmplitude: 0.02, waveFrequency: 0.8 },
  // Build Up: 2-6s - broader swings, building tension
  { start: 2, end: 6, volatility: 0.15, trendBias: 0.2, waveAmplitude: 0.06, waveFrequency: 1.2 },
  // Chaos Window: 6-11s - dramatic swings but smooth curves, not jagged noise
  { start: 6, end: 11, volatility: 0.22, trendBias: 0.0, waveAmplitude: 0.12, waveFrequency: 2.0 },
  // Final Push: 11-15s - one big resolution wave
  { start: 11, end: 15, volatility: 0.12, trendBias: 0.15, waveAmplitude: 0.08, waveFrequency: 1.5 },
];

export function generateChartPath(rng: SeededRandom): ChartPath {
  const points: ChartPoint[] = [];
  const volatilityMap: number[] = [];

  // Pre-generate wave components for organic movement
  const waveCount = 8;
  const waves = Array.from({ length: waveCount }, () => ({
    frequency: rng.range(0.2, 2.5),
    amplitude: rng.range(0.01, 0.04),
    phase: rng.range(0, Math.PI * 2),
  }));

  // Generate 4-6 "swing events" - directional moves
  const swingCount = rng.int(4, 6);
  const swings = Array.from({ length: swingCount }, () => ({
    time: rng.range(1.5, 14),
    direction: rng.next() > 0.5 ? 1 : -1,
    magnitude: rng.range(0.03, 0.08),
    duration: rng.range(1.2, 3.0),
  }));

  // Optional fake breakout: sharp spike up then reversal
  const hasFakeBreakout = rng.next() < 0.3;
  const fakeBreakoutTime = rng.range(7, 11);
  const fakeBreakoutMagnitude = rng.range(0.05, 0.10);

  let price = 0.5;
  let momentum = 0;

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const time = (i / TOTAL_POINTS) * ROUND_DURATION;
    const phase = getPhaseAt(time);

    // Base wave movement (smooth oscillation)
    let waveValue = 0;
    for (const wave of waves) {
      const phaseScale = phase.waveAmplitude / 0.06; // normalize to buildup baseline
      waveValue += Math.sin(time * wave.frequency + wave.phase) * wave.amplitude * phaseScale;
    }

    // Swing contributions (smooth Gaussian bumps)
    let swingValue = 0;
    for (const swing of swings) {
      const dt = time - swing.time;
      const falloff = Math.exp(-(dt * dt) / (2 * swing.duration * swing.duration));
      swingValue += swing.direction * swing.magnitude * falloff;
    }

    // Fake breakout: sharp up, then sharp down
    let breakoutValue = 0;
    if (hasFakeBreakout) {
      const dt = time - fakeBreakoutTime;
      if (dt > -0.3 && dt < 1.5) {
        // Asymmetric shape: fast rise, fast reversal
        if (dt < 0.4) {
          breakoutValue = fakeBreakoutMagnitude * Math.sin((dt + 0.3) / 0.7 * Math.PI);
        } else {
          breakoutValue = fakeBreakoutMagnitude * Math.sin((dt + 0.3) / 0.7 * Math.PI) * 0.6;
        }
      }
    }

    // Micro noise (very subtle, for texture only)
    const microNoise = (rng.next() - 0.5) * phase.volatility * 0.15;

    // Trend drift
    const trend = phase.trendBias * 0.003;

    // Mean reversion - strong exponential pull near edges
    const distFromCenter = Math.abs(price - 0.5);
    const edgeForce = distFromCenter > 0.25 ? Math.pow((distFromCenter - 0.25) / 0.25, 2) * 0.15 : 0;
    const meanReversion = (0.5 - price) * (0.015 + edgeForce);

    // Combine all forces
    const targetDelta = waveValue * 0.10 + swingValue * 0.20 + breakoutValue * 0.5 + microNoise + trend + meanReversion;

    // Smooth momentum
    momentum = momentum * 0.94 + targetDelta * 0.06;

    // Limit momentum to keep changes gradual
    const maxMomentum = 0.006;
    momentum = Math.max(-maxMomentum, Math.min(maxMomentum, momentum));

    price += momentum;

    // Hard clamp with bounce
    if (price < 0.20) {
      momentum = Math.abs(momentum) * 0.5;
      price = 0.20;
    }
    if (price > 0.80) {
      momentum = -Math.abs(momentum) * 0.5;
      price = 0.80;
    }

    points.push({ time, price, velocity: momentum });
    volatilityMap.push(phase.volatility);
  }

  // Multi-pass smoothing for silky curves
  let smoothed = smoothPath(points, 5);
  smoothed = smoothPath(smoothed, 3);

  return { points: smoothed, volatilityMap };
}

function getPhaseAt(time: number): PhaseConfig {
  for (const phase of PHASES) {
    if (time >= phase.start && time < phase.end) return phase;
  }
  return PHASES[PHASES.length - 1];
}

function smoothPath(points: ChartPoint[], windowSize: number): ChartPoint[] {
  return points.map((point, i) => {
    let sumPrice = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(points.length - 1, i + windowSize); j++) {
      sumPrice += points[j].price;
      count++;
    }
    return {
      ...point,
      price: sumPrice / count,
    };
  });
}

// Get interpolated price at any time
export function getPriceAtTime(path: ChartPath, time: number): number {
  const totalDuration = ROUND_DURATION;
  const normalizedTime = Math.max(0, Math.min(totalDuration, time));

  // Binary search for surrounding points
  let lo = 0;
  let hi = path.points.length - 1;

  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (path.points[mid].time <= normalizedTime) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const p0 = path.points[lo];
  const p1 = path.points[hi];

  if (p0.time === p1.time) return p0.price;

  const t = (normalizedTime - p0.time) / (p1.time - p0.time);
  // Hermite interpolation for extra smoothness
  const t2 = t * t;
  const t3 = t2 * t;
  const smooth = 3 * t2 - 2 * t3;

  return p0.price + (p1.price - p0.price) * smooth;
}
