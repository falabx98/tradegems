import { v4 as uuidv4 } from 'uuid';
import {
  RoundConfig,
  RoundPhase,
  PlayerRoundState,
  RoundResult,
  RiskTier,
  GameNode,
  RiskModifier,
} from '@tradingarena/shared-types';
import { SeededRandom } from './seededRandom.js';
import { generateChartPath, getPriceAtTime } from './chartGenerator.js';
import { generateNodes } from './nodeGenerator.js';
import {
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  getRiskModifiers,
  getBetTier,
  computeNodeEffect,
  createSimulationContext,
} from './engineConfig.js';
import type { SimulationContext } from './engineConfig.js';

const ROUND_DURATION = 15;

// ─── Round Generation ────────────────────────────────────────────────────────

export function generateRound(seed?: string, config?: EngineConfig): RoundConfig {
  const cfg = config ?? DEFAULT_ENGINE_CONFIG;
  const roundId = uuidv4();
  const roundSeed = seed || `${roundId}-${Date.now()}`;
  const rng = new SeededRandom(roundSeed);

  const chartPath = generateChartPath(rng);
  const nodes = generateNodes(rng, chartPath, cfg);

  return {
    roundId,
    seed: roundSeed,
    duration: cfg.roundDuration ?? ROUND_DURATION,
    chartPath,
    nodes,
    riskModifiers: getRiskModifiers(cfg),
    engineConfig: cfg as any,
  };
}

// ─── Phase Detection ─────────────────────────────────────────────────────────

export function getPhase(elapsed: number): RoundPhase {
  if (elapsed < 0) return 'pre';
  if (elapsed < 2) return 'opening';
  if (elapsed < 6) return 'buildup';
  if (elapsed < 11) return 'chaos';
  if (elapsed < 15) return 'final';
  return 'frozen';
}

export function getPhaseLabel(phase: RoundPhase): string {
  switch (phase) {
    case 'pre': return 'READY';
    case 'opening': return 'OPENING';
    case 'buildup': return 'BUILD UP';
    case 'chaos': return 'CHAOS';
    case 'final': return 'FINAL PUSH';
    case 'frozen': return 'COMPLETE';
    case 'result': return 'RESULT';
    default: return '';
  }
}

export function getPhaseColor(phase: RoundPhase): string {
  switch (phase) {
    case 'opening': return '#4ade80';
    case 'buildup': return '#facc15';
    case 'chaos': return '#ef4444';
    case 'final': return '#a855f7';
    case 'frozen': return '#6366f1';
    default: return '#64748b';
  }
}

// ─── Simulation ──────────────────────────────────────────────────────────────

export function simulateRound(
  config: RoundConfig,
  betAmount: number,
  riskTier: RiskTier,
): RoundResult {
  const modifier = config.riskModifiers[riskTier];
  const engineConfig = (config.engineConfig ?? DEFAULT_ENGINE_CONFIG) as EngineConfig;
  const betTier = getBetTier(betAmount, engineConfig);

  const state: PlayerRoundState = {
    playerId: 'local',
    betAmount,
    riskTier,
    currentMultiplier: 1.0,
    shields: 0,
    activatedNodes: [],
    missedNodes: [],
    nearMisses: [],
    betTierLabel: betTier.label,
    xpEarned: 0,
    finalPayout: 0,
  };

  const nodesHit: GameNode[] = [];
  const nodesMissed: GameNode[] = [];
  const nodesNearMissed: GameNode[] = [];
  const simCtx = createSimulationContext();

  for (const node of config.nodes) {
    const chartPrice = getPriceAtTime(config.chartPath, node.timePosition);
    let distance = Math.abs(chartPrice - node.pathY);

    // Fake breakout: boost divider activation in nearby time window
    if (node.type === 'divider' && simCtx.fakeBreakoutActive) {
      const timeDiff = Math.abs(node.timePosition - simCtx.fakeBreakoutTime);
      if (timeDiff < 3.0) {
        const boost = engineConfig.fakeBreakoutDividerBoost;
        distance *= (1 - boost);
      }
    }

    // Volatility spike: increases effective activation radius
    let effectiveRadius = node.activationRadius;
    if (simCtx.volatilityActive) {
      effectiveRadius *= simCtx.volatilityFactor;
    }

    const isActivated = distance <= effectiveRadius;
    const isNearMiss = !isActivated && node.nearMissRadius != null && distance <= node.nearMissRadius;

    if (isActivated) {
      const result = computeNodeEffect(
        node, state.currentMultiplier, state.shields,
        modifier, betTier, simCtx,
      );
      state.currentMultiplier = result.newMultiplier;
      state.shields = result.newShields;
      nodesHit.push({ ...node, state: 'activated' });
      state.activatedNodes.push(node.id);
    } else if (isNearMiss) {
      nodesNearMissed.push({ ...node, state: 'near_miss' });
      state.nearMisses!.push(node.id);
    } else {
      nodesMissed.push({ ...node, state: 'missed' });
      state.missedNodes.push(node.id);
    }
  }

  // Clamp final multiplier
  const maxMult = engineConfig.maxFinalMultiplier;
  state.currentMultiplier = Math.max(0, Math.min(maxMult, state.currentMultiplier));

  // Calculate payout (fee is already charged at bet placement, not here)
  state.finalPayout = betAmount * state.currentMultiplier;

  // XP calculation
  const baseXP = 10;
  const multiplierBonus = Math.floor(state.currentMultiplier * 5);
  const activationBonus = nodesHit.length * 2;
  const nearMissBonus = nodesNearMissed.length; // Small XP for near misses
  state.xpEarned = baseXP + multiplierBonus + activationBonus + nearMissBonus;

  return {
    roundId: config.roundId,
    playerState: state,
    finalMultiplier: state.currentMultiplier,
    payout: state.finalPayout,
    xpGained: state.xpEarned,
    nodesHit,
    nodesMissed,
    nodesNearMissed,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function formatMultiplier(value: number): string {
  if (value >= 10) return `${value.toFixed(0)}x`;
  if (value >= 1) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

export function formatPayout(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  if (sol >= 1000) return `${(sol / 1000).toFixed(1)}K SOL`;
  if (sol >= 1) return `${sol.toFixed(2)} SOL`;
  return `${sol.toFixed(4)} SOL`;
}
