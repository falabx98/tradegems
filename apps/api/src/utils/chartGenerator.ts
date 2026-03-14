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

/**
 * Generate a single OHLC candle for rug game tick (250ms interval).
 * Trends upward toward the crash point with random noise.
 */
export function generateRugCandle(prevClose: number, targetMultiplier: number, progress: number, volatility: number = 0.03): Candle {
  // progress = 0..1 representing how close to crash
  // Trend upward with increasing volatility near crash
  const trend = (targetMultiplier - prevClose) * 0.02 * (1 + progress);
  const noise = (Math.random() - 0.35) * volatility * Math.max(1, prevClose - 1);
  const close = Math.max(0.95, prevClose + trend + noise);

  const wickUp = Math.abs(close - prevClose) * (0.3 + Math.random() * 0.5);
  const wickDown = Math.abs(close - prevClose) * (0.2 + Math.random() * 0.3);
  const high = Math.max(prevClose, close) + wickUp;
  const low = Math.max(0.8, Math.min(prevClose, close) - wickDown);

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
    const drop = price * (0.2 + Math.random() * 0.3);
    const close = Math.max(0.1, open - drop);
    candles.push({
      open: parseFloat(open.toFixed(4)),
      high: parseFloat((open + price * 0.02).toFixed(4)),
      low: parseFloat((close * 0.95).toFixed(4)),
      close: parseFloat(close.toFixed(4)),
      volume: Math.round(2000 + Math.random() * 1500),
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
