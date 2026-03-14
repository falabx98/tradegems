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
