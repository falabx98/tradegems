export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number; // seconds
}

/**
 * Generate realistic OHLCV candle data using a random walk with
 * momentum, mean reversion, and occasional volatility spikes.
 */
export function generateSimulatedChart(
  durationSeconds: number = 60,
  intervalSeconds: number = 1,
): Candle[] {
  const candles: Candle[] = [];
  const totalCandles = Math.floor(durationSeconds / intervalSeconds);

  let price = 100;
  const meanPrice = 100;
  let momentum = 0;

  for (let i = 0; i < totalCandles; i++) {
    const open = price;

    // Volatility: base 0.3%, occasional spikes up to 1.5%
    const isSpike = Math.random() < 0.05;
    const volatility = isSpike
      ? 0.005 + Math.random() * 0.01
      : 0.001 + Math.random() * 0.002;

    // Mean reversion pull toward the starting price
    const reversion = (meanPrice - price) * 0.002;

    // Momentum with decay
    momentum = momentum * 0.85 + (Math.random() - 0.5) * volatility * price;

    // Compute close
    const change = momentum + reversion;
    const close = Math.max(0.01, open + change);

    // Intra-candle high/low from random wicks
    const wickUp = Math.abs(change) * (0.5 + Math.random());
    const wickDown = Math.abs(change) * (0.5 + Math.random());
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(0.01, Math.min(open, close) - wickDown);

    // Volume: base level with spikes correlated to price movement
    const baseVolume = 1000 + Math.random() * 500;
    const movementFactor = 1 + Math.abs(change) / price * 50;
    const volume = Math.round(baseVolume * movementFactor * (isSpike ? 2.5 : 1));

    candles.push({
      open: parseFloat(open.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(low.toFixed(4)),
      close: parseFloat(close.toFixed(4)),
      volume,
      timestamp: i * intervalSeconds,
    });

    price = close;
  }

  return candles;
}

// ─── Rug Game Crash Curve Chart System ──────────────────────

/**
 * How many ticks (at 250ms each) should a round last for a given crash point.
 * Higher crash points = longer rounds = more candles = more tension.
 *
 * Baseline: 1.5x crash → ~30 ticks (7.5s active)
 * Scale:    5x crash   → ~60 ticks (15s active)
 *           10x crash  → ~80 ticks (20s active)
 *           20x crash  → ~100 ticks (25s active)
 *
 * Uses logarithmic scaling so extreme crash points don't last forever.
 */
export function estimateRoundTicks(crashPoint: number): number {
  const base = 25;                        // Minimum ticks for any round
  const logScale = Math.log2(Math.max(1, crashPoint)); // 1x→0, 2x→1, 4x→2, 8x→3, 16x→4
  const ticks = base + logScale * 15;     // Each doubling adds ~15 ticks (3.75s)
  return Math.round(ticks);
}

/**
 * Compute the target multiplier for a given time-based progress.
 *
 * CRASH CURVE: power curve with exponent > 1 creates:
 * - slow initial climb (builds comfort)
 * - moderate middle acceleration (builds awareness)
 * - strong final surge (builds urgency / cashout pressure)
 *
 * curve(0) = 1.0  (start)
 * curve(1) = crashPoint * 0.995  (just before rug)
 *
 * The exponent controls the "crash-game feel":
 * - 1.0 = linear (boring, even rise)
 * - 1.5 = moderate acceleration
 * - 2.0 = strong parabolic
 * - 2.5 = very strong late surge
 *
 * We use 2.0 for a clear parabolic crash-chart shape.
 */
function crashCurve(timeProgress: number, crashPoint: number): number {
  const exponent = 2.0;
  const t = Math.pow(Math.min(timeProgress, 1), exponent);
  const ceiling = crashPoint * 0.995;
  return 1.0 + (ceiling - 1.0) * t;
}

/**
 * Generate a single OHLC candle for a rug game tick.
 *
 * KEY DESIGN: Candles are driven by a TIME-BASED crash curve, not price-based.
 * `timeProgress` = elapsedTicks / estimateRoundTicks(crashPoint).
 *
 * The crash curve IS the dominant force. Noise is cosmetic — it makes
 * the candles feel alive without ever dominating the upward trajectory.
 *
 * Visual result: a clear parabolic upward chart rendered as candlesticks,
 * similar to a crash-game line but with OHLC structure.
 */
export function generateRugCandle(
  prevClose: number,
  targetMultiplier: number,
  timeProgress: number,
  _volatility: number = 0.03,
): Candle {
  // Where the curve says price SHOULD be at this moment
  const curveTarget = crashCurve(timeProgress, targetMultiplier);

  // Strong pull toward curve — 50% of gap per tick.
  // This is aggressive enough that price ALWAYS tracks the curve tightly.
  // Even after a pullback candle, the next candle snaps back.
  const gap = curveTarget - prevClose;
  const trend = gap * 0.50;

  // Noise: very small relative to total range.
  // Creates candle body variation without competing with the upward curve.
  const totalRange = Math.max(0.1, targetMultiplier - 1.0);
  const noiseAmp = Math.max(0.003, totalRange * 0.008);
  const noise = (Math.random() - 0.40) * noiseAmp; // slight upward bias

  // Micro-pullback: ~6% chance, very small magnitude.
  // Creates occasional red candles for realism without disrupting trend.
  const pullback = Math.random() < 0.06 ? -totalRange * 0.005 : 0;

  let close = prevClose + trend + noise + pullback;

  // Floor: never below 0.95
  close = Math.max(0.95, close);

  // CRITICAL SAFETY: close must NEVER exceed 99.5% of crash point
  close = Math.min(close, targetMultiplier * 0.995);

  // Wicks: tight — crash charts have compact candle bodies
  const body = Math.abs(close - prevClose);
  const wickUp = body * (0.15 + Math.random() * 0.35);
  const wickDown = body * (0.10 + Math.random() * 0.25);
  let high = Math.max(prevClose, close) + wickUp;
  const low = Math.max(0.9, Math.min(prevClose, close) - wickDown);

  // CRITICAL SAFETY: high wick must NEVER exceed crash point
  high = Math.min(high, targetMultiplier);

  return {
    open: parseFloat(prevClose.toFixed(4)),
    high: parseFloat(high.toFixed(4)),
    low: parseFloat(low.toFixed(4)),
    close: parseFloat(close.toFixed(4)),
    volume: Math.round(800 + Math.random() * 600),
    timestamp: 0, // caller sets this
  };
}

/** Generate 3 crash candles for when the rug happens */
export function generateCrashCandles(lastClose: number): Candle[] {
  const candles: Candle[] = [];
  let price = lastClose;
  for (let i = 0; i < 3; i++) {
    const open = price;
    const drop = price * (0.25 + Math.random() * 0.35); // Violent drops
    const close = Math.max(0.05, open - drop);
    candles.push({
      open: parseFloat(open.toFixed(4)),
      high: parseFloat((open + price * 0.01).toFixed(4)), // Tiny high wick — no bounce
      low: parseFloat((close * 0.92).toFixed(4)), // Low wick extends the pain
      close: parseFloat(close.toFixed(4)),
      volume: Math.round(3000 + Math.random() * 2000),
      timestamp: 0,
    });
    price = close;
  }
  return candles;
}

/** Generate full 10-candle chart for candleflip round */
export function generateCandleflipChart(resultMultiplier: number, count: number = 10): Candle[] {
  const candles: Candle[] = [];
  let price = 1.0;
  const target = resultMultiplier;

  for (let i = 0; i < count; i++) {
    const open = price;
    const progress = (i + 1) / count;
    const trend = (target - 1.0) * progress / count * 2;
    const noise = (Math.random() - 0.5) * 0.04;

    // Last candle must land close to target
    const close = i === count - 1
      ? target
      : Math.max(0.5, Math.min(1.5, open + trend + noise));

    const wickUp = Math.abs(close - open) * (0.3 + Math.random() * 0.4);
    const wickDown = Math.abs(close - open) * (0.2 + Math.random() * 0.3);

    candles.push({
      open: parseFloat(open.toFixed(4)),
      high: parseFloat((Math.max(open, close) + wickUp).toFixed(4)),
      low: parseFloat((Math.max(0.4, Math.min(open, close) - wickDown)).toFixed(4)),
      close: parseFloat(close.toFixed(4)),
      volume: Math.round(500 + Math.random() * 500),
      timestamp: i,
    });
    price = close;
  }
  return candles;
}
