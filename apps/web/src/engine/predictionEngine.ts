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
  pattern: string;
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

// ─── Pattern Definitions ─────────────────────────────────────────────────────
// Each pattern returns a per-candle drift multiplier for the 10 reveal candles.
// Positive = bullish force, negative = bearish force.
// The magnitude is scaled by a base strength factor.

type PatternFn = (rng: SeededRandom) => { drifts: number[]; name: string };

const PATTERNS: PatternFn[] = [
  // 1. STEADY TREND — gradual move in one direction
  (rng) => {
    const dir = rng.next() < 0.5 ? 1 : -1;
    const str = rng.range(0.03, 0.06);
    return {
      name: dir > 0 ? 'Steady Bull' : 'Steady Bear',
      drifts: Array.from({ length: 10 }, () => dir * str * rng.range(0.6, 1.4)),
    };
  },

  // 2. V-REVERSAL — drops hard, then rockets up (or inverse)
  (rng) => {
    const bullV = rng.next() < 0.5; // true = V bottom, false = inverted V top
    const str = rng.range(0.04, 0.08);
    const pivot = rng.int(3, 5); // candle where reversal happens
    return {
      name: bullV ? 'V-Bottom Reversal' : 'Inverted-V Top',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i < pivot) return (bullV ? -1 : 1) * str * rng.range(0.8, 1.5);
        return (bullV ? 1 : -1) * str * rng.range(1.0, 2.0); // stronger reversal
      }),
    };
  },

  // 3. FAKEOUT — moves one way, reverses briefly, then continues original direction
  (rng) => {
    const dir = rng.next() < 0.5 ? 1 : -1;
    const str = rng.range(0.03, 0.06);
    const fakeStart = rng.int(2, 4);
    const fakeEnd = fakeStart + rng.int(2, 3);
    return {
      name: dir > 0 ? 'Bull Fakeout' : 'Bear Fakeout',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i >= fakeStart && i < fakeEnd) return -dir * str * rng.range(0.8, 1.5); // fake move
        return dir * str * rng.range(0.6, 1.4); // real trend
      }),
    };
  },

  // 4. PUMP & DUMP — sudden explosive spike then crash (or inverse)
  (rng) => {
    const isPump = rng.next() < 0.5;
    const str = rng.range(0.05, 0.10);
    const peakAt = rng.int(2, 4);
    return {
      name: isPump ? 'Pump & Dump' : 'Dump & Pump',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i <= peakAt) return (isPump ? 1 : -1) * str * rng.range(1.2, 2.5); // explosive move
        return (isPump ? -1 : 1) * str * rng.range(0.6, 1.8); // reversal/dump
      }),
    };
  },

  // 5. CONSOLIDATION BREAKOUT — tight range, then explosive move
  (rng) => {
    const dir = rng.next() < 0.5 ? 1 : -1;
    const breakAt = rng.int(4, 7); // candle where breakout starts
    const str = rng.range(0.06, 0.12);
    return {
      name: dir > 0 ? 'Bull Breakout' : 'Bear Breakdown',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i < breakAt) return rng.range(-0.008, 0.008); // tight range
        return dir * str * rng.range(1.0, 2.0); // explosive breakout
      }),
    };
  },

  // 6. DOUBLE TOP / DOUBLE BOTTOM — two peaks or valleys
  (rng) => {
    const isTop = rng.next() < 0.5;
    const str = rng.range(0.04, 0.07);
    // Pattern: up-down-up-down for double top, inverse for double bottom
    const phases = [1, 1, -1, -1, 1, 1, -1, -1, -1, -1]; // double top shape
    return {
      name: isTop ? 'Double Top' : 'Double Bottom',
      drifts: phases.map((p) => {
        const d = isTop ? p : -p;
        return d * str * rng.range(0.7, 1.3);
      }),
    };
  },

  // 7. STAIRCASE — step up, pause, step up, pause (or down)
  (rng) => {
    const dir = rng.next() < 0.5 ? 1 : -1;
    const str = rng.range(0.03, 0.06);
    return {
      name: dir > 0 ? 'Bull Staircase' : 'Bear Staircase',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i % 3 === 2) return rng.range(-0.005, 0.005); // pause step
        return dir * str * rng.range(0.8, 1.5); // move step
      }),
    };
  },

  // 8. WHIPSAW — violent back-and-forth, ending flat-ish
  (rng) => {
    const str = rng.range(0.04, 0.08);
    return {
      name: 'Whipsaw',
      drifts: Array.from({ length: 10 }, (_, i) => {
        const swing = (i % 2 === 0 ? 1 : -1) * str * rng.range(0.8, 1.8);
        // Dampen toward the end to finish near entry
        const dampen = 1 - (i / 10) * 0.5;
        return swing * dampen;
      }),
    };
  },

  // 9. SLOW BLEED THEN CAPITULATION — gradual decline, then panic drop
  (rng) => {
    const isBear = rng.next() < 0.5;
    const str = rng.range(0.03, 0.06);
    return {
      name: isBear ? 'Slow Bleed → Capitulation' : 'Slow Grind → Melt-Up',
      drifts: Array.from({ length: 10 }, (_, i) => {
        const dir = isBear ? -1 : 1;
        if (i < 6) return dir * str * rng.range(0.3, 0.7); // slow bleed/grind
        return dir * str * rng.range(1.5, 3.0); // capitulation/melt-up
      }),
    };
  },

  // 10. FLASH CRASH RECOVERY — sudden huge drop then full recovery
  (rng) => {
    const isCrash = rng.next() < 0.5;
    const str = rng.range(0.06, 0.12);
    return {
      name: isCrash ? 'Flash Crash Recovery' : 'Flash Spike Fade',
      drifts: Array.from({ length: 10 }, (_, i) => {
        if (i < 2) return (isCrash ? -1 : 1) * str * rng.range(2.0, 3.5); // flash event
        if (i < 4) return (isCrash ? -1 : 1) * str * rng.range(0.3, 0.8); // continuation
        return (isCrash ? 1 : -1) * str * rng.range(0.8, 1.5); // recovery/fade
      }),
    };
  },
];

// ─── Candle Builder ──────────────────────────────────────────────────────────

function buildCandle(
  rng: SeededRandom,
  open: number,
  drift: number,
  volatility: number,
  momentum: number,
  index: number,
  isHistorical: boolean,
): { candle: Candle; newPrice: number; newMomentum: number } {
  const mClamp = Math.max(-0.06, Math.min(0.06, momentum * 0.6 + drift * 0.4));
  const moveRange = open * volatility;
  const closeOffset = (mClamp + (rng.next() - 0.5) * volatility * 0.5) * open;
  const close = Math.max(0.01, open + closeOffset);

  const upperWick = Math.abs(rng.range(0.15, 0.9) * moveRange);
  const lowerWick = Math.abs(rng.range(0.15, 0.9) * moveRange);
  const high = Math.max(open, close) + upperWick;
  const low = Math.max(0.01, Math.min(open, close) - lowerWick);

  const priceMove = Math.abs(close - open) / open;
  const volume = rng.range(500, 2000) * (1 + priceMove * 25) * rng.range(0.6, 1.6);

  return {
    candle: { open, high, low, close, volume, index, isHistorical },
    newPrice: close,
    newMomentum: mClamp,
  };
}

// ─── Main Generation ─────────────────────────────────────────────────────────

export function generatePredictionRound(seed?: string): PredictionRoundConfig {
  const roundSeed = seed || `pred-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rng = new SeededRandom(roundSeed);

  const BASE_PRICE = rng.range(80, 200);
  const BASE_VOLATILITY = rng.range(0.012, 0.028);

  // Pick a random pattern
  const patternIdx = rng.int(0, PATTERNS.length - 1);
  const { drifts, name: patternName } = PATTERNS[patternIdx](rng);

  // ── Generate historical candles (organic, no trend) ──
  const historicalCandles: Candle[] = [];
  let currentPrice = BASE_PRICE;
  let momentum = 0;

  for (let i = 0; i < HISTORICAL_COUNT; i++) {
    const vol = BASE_VOLATILITY * rng.range(0.6, 1.3);
    const drift = rng.range(-0.008, 0.008);
    const meanRev = (BASE_PRICE - currentPrice) * 0.004;
    const { candle, newPrice, newMomentum } = buildCandle(
      rng, currentPrice, drift + meanRev, vol, momentum, i, true,
    );
    historicalCandles.push(candle);
    currentPrice = newPrice;
    momentum = newMomentum;
  }

  // ── Generate reveal candles using the selected pattern ──
  const revealCandles: Candle[] = [];
  // Reset momentum for clean pattern start
  momentum = 0;

  for (let i = 0; i < REVEAL_COUNT; i++) {
    const vol = BASE_VOLATILITY * rng.range(1.0, 2.0);
    const patternDrift = drifts[i];
    // Add slight noise so candles aren't perfectly smooth
    const noise = rng.range(-0.005, 0.005);
    const { candle, newPrice, newMomentum } = buildCandle(
      rng, currentPrice, patternDrift + noise, vol, momentum,
      HISTORICAL_COUNT + i, false,
    );
    revealCandles.push(candle);
    currentPrice = newPrice;
    momentum = newMomentum;
  }

  const entryPrice = historicalCandles[HISTORICAL_COUNT - 1].close;
  const exitPrice = revealCandles[REVEAL_COUNT - 1].close;

  const actualChange = (exitPrice - entryPrice) / entryPrice;
  let outcome: PredictionDirection;
  if (actualChange > RANGE_THRESHOLD) outcome = 'long';
  else if (actualChange < -RANGE_THRESHOLD) outcome = 'short';
  else outcome = 'range';

  return {
    seed: roundSeed,
    historicalCandles,
    revealCandles,
    entryPrice,
    exitPrice,
    outcome,
    pattern: patternName,
  };
}

// ─── Win-Rate Controlled Generation ─────────────────────────────────────────
// Keeps historical candles intact, regenerates reveal candles until outcome matches target.

export function regenerateWithOutcome(
  config: PredictionRoundConfig,
  targetOutcome: PredictionDirection,
  maxAttempts = 50,
): PredictionRoundConfig {
  // If current outcome already matches, return as-is
  if (config.outcome === targetOutcome) return config;

  const entryPrice = config.entryPrice;
  const baseSeed = config.seed;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const revealSeed = `${baseSeed}-rv-${attempt}`;
    const rng = new SeededRandom(revealSeed);

    // Pick a pattern
    const patternIdx = rng.int(0, PATTERNS.length - 1);
    const { drifts, name: patternName } = PATTERNS[patternIdx](rng);

    // Regenerate reveal candles from entry price
    const revealCandles: Candle[] = [];
    let currentPrice = entryPrice;
    let momentum = 0;
    const vol = rng.range(0.012, 0.028);

    for (let i = 0; i < REVEAL_COUNT; i++) {
      const candleVol = vol * rng.range(1.0, 2.0);
      const noise = rng.range(-0.005, 0.005);
      const { candle, newPrice, newMomentum } = buildCandle(
        rng, currentPrice, drifts[i] + noise, candleVol, momentum,
        HISTORICAL_COUNT + i, false,
      );
      revealCandles.push(candle);
      currentPrice = newPrice;
      momentum = newMomentum;
    }

    const exitPrice = revealCandles[REVEAL_COUNT - 1].close;
    const actualChange = (exitPrice - entryPrice) / entryPrice;
    let outcome: PredictionDirection;
    if (actualChange > RANGE_THRESHOLD) outcome = 'long';
    else if (actualChange < -RANGE_THRESHOLD) outcome = 'short';
    else outcome = 'range';

    if (outcome === targetOutcome) {
      return {
        ...config,
        seed: revealSeed,
        revealCandles,
        exitPrice,
        outcome,
        pattern: patternName,
      };
    }
  }

  // Fallback: force outcome by adjusting last candle's close
  const fallbackSeed = `${baseSeed}-rv-force`;
  const rng = new SeededRandom(fallbackSeed);
  const patternIdx = rng.int(0, PATTERNS.length - 1);
  const { drifts, name: patternName } = PATTERNS[patternIdx](rng);

  const revealCandles: Candle[] = [];
  let currentPrice = entryPrice;
  let momentum = 0;
  const vol = rng.range(0.012, 0.028);

  for (let i = 0; i < REVEAL_COUNT; i++) {
    const candleVol = vol * rng.range(1.0, 2.0);
    const noise = rng.range(-0.005, 0.005);
    const { candle, newPrice, newMomentum } = buildCandle(
      rng, currentPrice, drifts[i] + noise, candleVol, momentum,
      HISTORICAL_COUNT + i, false,
    );
    revealCandles.push(candle);
    currentPrice = newPrice;
    momentum = newMomentum;
  }

  // Force the exit price to match target outcome
  const lastCandle = { ...revealCandles[REVEAL_COUNT - 1] };
  if (targetOutcome === 'long') {
    lastCandle.close = entryPrice * (1 + RANGE_THRESHOLD + 0.01);
    lastCandle.high = Math.max(lastCandle.high, lastCandle.close);
  } else if (targetOutcome === 'short') {
    lastCandle.close = entryPrice * (1 - RANGE_THRESHOLD - 0.01);
    lastCandle.low = Math.min(lastCandle.low, lastCandle.close);
  } else {
    lastCandle.close = entryPrice * (1 + rng.range(-0.01, 0.01));
  }
  revealCandles[REVEAL_COUNT - 1] = lastCandle;

  return {
    ...config,
    seed: fallbackSeed,
    revealCandles,
    exitPrice: lastCandle.close,
    outcome: targetOutcome,
    pattern: patternName,
  };
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
