// ─── Trading Arena Engine Configuration ──────────────────────────────────────
// All tunable parameters in one file. Change distributions, modifiers,
// and house edge targets here without touching any game logic.

import type { RiskTier, GameNode, RiskModifier } from '@tradingarena/shared-types';

// ─── Config Types ────────────────────────────────────────────────────────────

export interface MultiplierBand {
  min: number;
  max: number;
  weight: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

export interface DividerBand {
  value: number;
  weight: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

export interface SpecialEventConfig {
  type: 'shield' | 'fake_breakout' | 'volatility_spike';
  weight: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

export interface BetTierConfig {
  label: string;
  minBet: number;
  maxBet: number;
  gainFactor: number;
  lossFactor: number;
}

export interface RiskTierConfig {
  gainFactor: number;
  lossFactor: number;
  label: string;
}

export interface NearMissConfig {
  nearMissRadiusMultiplier: number;
  targetRate: { min: number; max: number };
}

export interface NodeDensityConfig {
  totalNodes: { min: number; max: number };
  baselineMultipliers: number;
  baselineDividers: number;
  baselineSpecials: number;
  maxSpecialsPerRound: number;
}

export interface P2PPayoutConfig {
  feeRate: { min: number; max: number };
  bands: {
    topPercent: number;
    mediumPercent: number;
    breakEvenPercent: number;
    lossPercent: number;
  };
}

export interface EngineConfig {
  multiplierBands: MultiplierBand[];
  dividerBands: DividerBand[];
  specialEvents: SpecialEventConfig[];
  betTiers: BetTierConfig[];
  riskTiers: Record<RiskTier, RiskTierConfig>;
  nodeDensity: NodeDensityConfig;
  nearMiss: NearMissConfig;
  houseEdgeTarget: { min: number; max: number };
  maxFinalMultiplier: number;
  roundDuration: number;
  fakeBreakoutDividerBoost: number;
  volatilitySpikeMultiplier: number;
  platformFeeRate: number;
  p2pPayout: P2PPayoutConfig;
}

// ─── Simulation Context (internal, used during round simulation) ─────────────

export interface SimulationContext {
  fakeBreakoutActive: boolean;
  fakeBreakoutTime: number;
  volatilityActive: boolean;
  volatilityFactor: number;
}

export function createSimulationContext(): SimulationContext {
  return {
    fakeBreakoutActive: false,
    fakeBreakoutTime: 0,
    volatilityActive: false,
    volatilityFactor: 1.0,
  };
}

// ─── Default Configuration ───────────────────────────────────────────────────

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  // Multiplier bands: E[ln(M)] ≈ 0.485, capped at 10x
  multiplierBands: [
    { min: 1.05, max: 1.25, weight: 35, rarity: 'common' },
    { min: 1.25, max: 1.60, weight: 28, rarity: 'common' },
    { min: 1.60, max: 2.20, weight: 20, rarity: 'uncommon' },
    { min: 2.20, max: 3.50, weight: 12, rarity: 'uncommon' },
    { min: 3.50, max: 6.00, weight: 4, rarity: 'rare' },
    { min: 6.00, max: 10.0, weight: 1, rarity: 'legendary' },
  ],

  // Divider bands: E[ln(D)] ≈ 0.49, slightly stronger than multipliers for house edge
  dividerBands: [
    { value: 1.2, weight: 28, rarity: 'common' },
    { value: 1.4, weight: 30, rarity: 'common' },
    { value: 1.8, weight: 22, rarity: 'uncommon' },
    { value: 2.5, weight: 13, rarity: 'rare' },
    { value: 3.5, weight: 7, rarity: 'rare' },
  ],

  specialEvents: [
    { type: 'shield', weight: 35, rarity: 'uncommon' },
    { type: 'volatility_spike', weight: 45, rarity: 'rare' },
    { type: 'fake_breakout', weight: 20, rarity: 'rare' },
  ],

  // Bet tiers in lamports (1 SOL = 1_000_000_000)
  betTiers: [
    { label: 'Small', minBet: 1_000_000, maxBet: 50_000_000, gainFactor: 0.95, lossFactor: 0.95 },
    { label: 'Medium', minBet: 50_000_000, maxBet: 500_000_000, gainFactor: 1.00, lossFactor: 1.00 },
    { label: 'Large', minBet: 500_000_000, maxBet: 10_000_000_000, gainFactor: 1.05, lossFactor: 1.15 },
  ],

  // Risk tiers: all house-favorable or neutral
  riskTiers: {
    conservative: { gainFactor: 0.80, lossFactor: 0.85, label: 'Conservative' },
    balanced: { gainFactor: 1.00, lossFactor: 1.00, label: 'Balanced' },
    aggressive: { gainFactor: 1.25, lossFactor: 1.40, label: 'Aggressive' },
  },

  nodeDensity: {
    totalNodes: { min: 7, max: 11 },
    baselineMultipliers: 4,
    baselineDividers: 4,
    baselineSpecials: 1,
    maxSpecialsPerRound: 2,
  },

  nearMiss: {
    nearMissRadiusMultiplier: 1.8,
    targetRate: { min: 0.30, max: 0.45 },
  },

  houseEdgeTarget: { min: 0.02, max: 0.08 },
  maxFinalMultiplier: 10,
  roundDuration: 15,
  fakeBreakoutDividerBoost: 0.15,
  volatilitySpikeMultiplier: 1.5,
  platformFeeRate: 0.05,

  p2pPayout: {
    feeRate: { min: 0.02, max: 0.04 },
    bands: {
      topPercent: 0.10,
      mediumPercent: 0.20,
      breakEvenPercent: 0.20,
      lossPercent: 0.50,
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Look up the bet tier for a given bet amount. Falls back to medium. */
export function getBetTier(betAmount: number, config: EngineConfig): BetTierConfig {
  for (const tier of config.betTiers) {
    if (betAmount >= tier.minBet && betAmount <= tier.maxBet) {
      return tier;
    }
  }
  // Fallback: medium tier
  return config.betTiers[1] ?? { label: 'Medium', minBet: 0, maxBet: Infinity, gainFactor: 1, lossFactor: 1 };
}

/** Get risk modifiers from config, formatted for RoundConfig compatibility. */
export function getRiskModifiers(config?: EngineConfig): Record<RiskTier, RiskModifier> {
  if (!config) {
    return {
      conservative: { gainFactor: 0.80, lossFactor: 0.85, label: 'Conservative' },
      balanced: { gainFactor: 1.00, lossFactor: 1.00, label: 'Balanced' },
      aggressive: { gainFactor: 1.25, lossFactor: 1.40, label: 'Aggressive' },
    };
  }
  return {
    conservative: config.riskTiers.conservative,
    balanced: config.riskTiers.balanced,
    aggressive: config.riskTiers.aggressive,
  };
}

/**
 * Shared node effect computation — used by both store (live) and simulation.
 * Returns updated multiplier and shield count.
 */
export function computeNodeEffect(
  node: GameNode,
  currentMultiplier: number,
  shields: number,
  riskModifier: RiskModifier,
  betTier: BetTierConfig,
  simCtx?: SimulationContext,
): { newMultiplier: number; newShields: number } {
  let newMultiplier = currentMultiplier;
  let newShields = shields;

  switch (node.type) {
    case 'multiplier': {
      const bonusFactor = 1.0; // Reserved for streak/VIP bonuses
      const applied = 1 + ((node.value - 1) * riskModifier.gainFactor * betTier.gainFactor * bonusFactor);
      newMultiplier *= applied;
      break;
    }
    case 'divider': {
      if (newShields > 0) {
        newShields--;
      } else {
        const penaltyFactor = 1.0; // Reserved for future modifiers
        const applied = 1 + ((node.value - 1) * riskModifier.lossFactor * betTier.lossFactor * penaltyFactor);
        newMultiplier /= applied;
      }
      break;
    }
    case 'shield': {
      newShields++;
      break;
    }
    case 'fake_breakout': {
      if (simCtx) {
        simCtx.fakeBreakoutActive = true;
        simCtx.fakeBreakoutTime = node.timePosition;
      }
      break;
    }
    case 'volatility_spike': {
      if (simCtx) {
        simCtx.volatilityActive = true;
        simCtx.volatilityFactor = 1.5; // Could read from config
      }
      break;
    }
  }

  return { newMultiplier, newShields };
}
