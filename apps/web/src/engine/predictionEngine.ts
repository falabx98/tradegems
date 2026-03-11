import { SeededRandom } from './seededRandom';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PredictionDirection = 'long' | 'short' | 'range';
export type PredictionPhase = 'setup' | 'countdown' | 'revealing' | 'result';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  index: number;
  isHistorical: boolean;
}

export interface PredictionRoundConfig {
  seed: string;
  historicalCandles: Candle[];
  revealCandles: Candle[];
  entryPrice: number;
  exitPrice: number;
  outcome: PredictionDirection;
}

export interface PredictionResult {
  prediction: PredictionDirection;
  outcome: PredictionDirection;
  correct: boolean;
  multiplier: number;
  betAmount: number;
  payout: number;
  entryPrice: number;
  exitPrice: number;
  priceChangePercent: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HISTORICAL_COUNT = 15;
const REVEAL_COUNT = 10;
const RANGE_THRESHOLD = 0.015; // ±1.5%

const PAYOUT_TABLE: Record<PredictionDirection, number> = {
  long: 1.9,
  short: 1.9,
  range: 3.0,
};

// ─── Generation ──────────────────────────────────────────────────────────────

export function generatePredictionRound(seed?: string): PredictionRoundConfig {
  const roundSeed = seed || `pred-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rng = new SeededRandom(roundSeed);

  // Determine trend bias from seed
  const trendRoll = rng.next();
  let trendBias: number;
  if (trendRoll < 0.425) {
    trendBias = rng.range(0.02, 0.06);
  } else if (trendRoll < 0.85) {
    trendBias = rng.range(-0.06, -0.02);
  } else {
    trendBias = rng.range(-0.008, 0.008);
  }

  const BASE_PRICE = rng.range(80, 200);
  const BASE_VOLATILITY = rng.range(0.012, 0.03);

  let currentPrice = BASE_PRICE;
  let momentum = 0;
  const allCandles: Candle[] = [];

  for (let i = 0; i < HISTORICAL_COUNT + REVEAL_COUNT; i++) {
    const isReveal = i >= HISTORICAL_COUNT;

    const phaseVol = isReveal
      ? BASE_VOLATILITY * rng.range(1.0, 1.8)
      : BASE_VOLATILITY * rng.range(0.6, 1.3);

    const drift = isReveal
      ? trendBias * rng.range(0.5, 1.5)
      : rng.range(-0.01, 0.01);

    const meanReversion = isReveal ? 0 : (BASE_PRICE - currentPrice) * 0.005;

    momentum = momentum * 0.7 + (drift + meanReversion) * 0.3;
    momentum = Math.max(-0.04, Math.min(0.04, momentum));

    const open = currentPrice;
    const moveRange = currentPrice * phaseVol;
    const closeOffset = (momentum + (rng.next() - 0.5) * phaseVol) * currentPrice;
    const close = open + closeOffset;

    const upperWick = Math.abs(rng.range(0.2, 1.0) * moveRange);
    const lowerWick = Math.abs(rng.range(0.2, 1.0) * moveRange);
    const high = Math.max(open, close) + upperWick;
    const low = Math.min(open, close) - lowerWick;

    const priceMove = Math.abs(close - open) / open;
    const baseVol = rng.range(500, 2000);
    const volume = baseVol * (1 + priceMove * 20) * rng.range(0.7, 1.5);

    allCandles.push({
      open: Math.max(0.01, open),
      high: Math.max(0.01, high),
      low: Math.max(0.01, low),
      close: Math.max(0.01, close),
      volume,
      index: i,
      isHistorical: !isReveal,
    });

    currentPrice = close;
  }

  const historicalCandles = allCandles.slice(0, HISTORICAL_COUNT);
  const revealCandles = allCandles.slice(HISTORICAL_COUNT);
  const entryPrice = historicalCandles[HISTORICAL_COUNT - 1].close;
  const exitPrice = revealCandles[REVEAL_COUNT - 1].close;

  const actualChange = (exitPrice - entryPrice) / entryPrice;
  let outcome: PredictionDirection;
  if (actualChange > RANGE_THRESHOLD) outcome = 'long';
  else if (actualChange < -RANGE_THRESHOLD) outcome = 'short';
  else outcome = 'range';

  return { seed: roundSeed, historicalCandles, revealCandles, entryPrice, exitPrice, outcome };
}

// ─── Result Calculation ──────────────────────────────────────────────────────

export function calculatePredictionResult(
  prediction: PredictionDirection,
  config: PredictionRoundConfig,
  betAmount: number,
): PredictionResult {
  const correct = prediction === config.outcome;
  const multiplier = correct ? PAYOUT_TABLE[prediction] : 0;
  const payout = betAmount * multiplier;
  const priceChangePercent = ((config.exitPrice - config.entryPrice) / config.entryPrice) * 100;

  return {
    prediction,
    outcome: config.outcome,
    correct,
    multiplier,
    betAmount,
    payout,
    entryPrice: config.entryPrice,
    exitPrice: config.exitPrice,
    priceChangePercent,
  };
}
