import { GameNode, NodeType, ChartPath } from '../types/game';
import { SeededRandom } from './seededRandom';
import { getPriceAtTime } from './chartGenerator';
import { v4 as uuidv4 } from 'uuid';
import type { EngineConfig, MultiplierBand, DividerBand, SpecialEventConfig } from './engineConfig';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';

// Time windows where nodes can appear (avoiding first 1.5s and last 0.5s)
const NODE_TIME_RANGE = { min: 1.8, max: 14.2 };
const MIN_NODE_GAP = 0.8;

/**
 * Generate game nodes along the chart path.
 * When config is provided, uses its distribution tables.
 * When absent, uses DEFAULT_ENGINE_CONFIG for backwards compatibility.
 */
export function generateNodes(
  rng: SeededRandom,
  chartPath: ChartPath,
  config?: EngineConfig,
): GameNode[] {
  const cfg = config ?? DEFAULT_ENGINE_CONFIG;
  const nodes: GameNode[] = [];

  // Determine total node count
  const totalNodes = rng.int(cfg.nodeDensity.totalNodes.min, cfg.nodeDensity.totalNodes.max);

  // Determine composition with slight randomness around baselines
  const multiplierCount = rng.int(
    Math.max(2, cfg.nodeDensity.baselineMultipliers - 1),
    cfg.nodeDensity.baselineMultipliers + 1,
  );
  const dividerCount = rng.int(
    Math.max(2, cfg.nodeDensity.baselineDividers - 1),
    cfg.nodeDensity.baselineDividers + 1,
  );
  const remaining = totalNodes - multiplierCount - dividerCount;
  const specialCount = Math.min(
    Math.max(0, remaining),
    rng.int(cfg.nodeDensity.baselineSpecials, cfg.nodeDensity.maxSpecialsPerRound),
  );

  // Generate time positions
  const timeSlots = generateTimeSlots(rng, totalNodes);

  const nearMissMultiplier = cfg.nearMiss.nearMissRadiusMultiplier;
  let nodeIndex = 0;

  // Generate multiplier nodes
  for (let i = 0; i < multiplierCount && nodeIndex < totalNodes; i++, nodeIndex++) {
    const band = weightedPickBand(rng, cfg.multiplierBands);
    const value = roundTo2(rng.range(band.min, band.max));
    const time = timeSlots[nodeIndex];
    const chartPrice = getPriceAtTime(chartPath, time);

    const offset = (rng.next() - 0.5) * 0.14;
    const pathY = Math.max(0.12, Math.min(0.88, chartPrice + offset));
    const activationRadius = 0.035 + rng.next() * 0.025; // Smaller radius = harder to hit gains

    nodes.push({
      id: uuidv4(),
      type: 'multiplier',
      value,
      timePosition: time,
      pathY,
      state: 'scheduled',
      activationRadius,
      rarity: band.rarity,
      nearMissRadius: activationRadius * nearMissMultiplier,
    });
  }

  // Generate divider nodes
  for (let i = 0; i < dividerCount && nodeIndex < totalNodes; i++, nodeIndex++) {
    const band = weightedPickDivider(rng, cfg.dividerBands);
    const time = timeSlots[nodeIndex];
    const chartPrice = getPriceAtTime(chartPath, time);

    const offset = (rng.next() - 0.5) * 0.10;
    const pathY = Math.max(0.12, Math.min(0.88, chartPrice + offset));
    const activationRadius = 0.055 + rng.next() * 0.04; // Slightly larger = easier to hit losses

    nodes.push({
      id: uuidv4(),
      type: 'divider',
      value: band.value,
      timePosition: time,
      pathY,
      state: 'scheduled',
      activationRadius,
      rarity: band.rarity,
      nearMissRadius: activationRadius * nearMissMultiplier,
    });
  }

  // Generate special nodes using weighted distribution
  for (let i = 0; i < specialCount && nodeIndex < totalNodes; i++, nodeIndex++) {
    const special = weightedPickSpecial(rng, cfg.specialEvents);
    const specialType = special.type;
    const time = timeSlots[nodeIndex];
    const chartPrice = getPriceAtTime(chartPath, time);

    const offset = (rng.next() - 0.5) * 0.08;
    const pathY = Math.max(0.05, Math.min(0.95, chartPrice + offset));

    nodes.push({
      id: uuidv4(),
      type: specialType,
      value: specialType === 'shield' ? 1 : 0,
      timePosition: time,
      pathY,
      state: 'scheduled',
      activationRadius: specialType === 'shield' ? 0.06 : 0.08,
      rarity: special.rarity,
      nearMissRadius: (specialType === 'shield' ? 0.06 : 0.08) * nearMissMultiplier,
    });
  }

  // Sort by time position
  nodes.sort((a, b) => a.timePosition - b.timePosition);

  return nodes;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function generateTimeSlots(rng: SeededRandom, count: number): number[] {
  const { min, max } = NODE_TIME_RANGE;
  const range = max - min;
  const baseGap = range / (count + 1);

  const slots: number[] = [];
  for (let i = 0; i < count; i++) {
    const baseTime = min + baseGap * (i + 1);
    const jitter = (rng.next() - 0.5) * baseGap * 0.6;
    const time = Math.max(min, Math.min(max, baseTime + jitter));
    slots.push(time);
  }

  // Ensure minimum gap
  for (let i = 1; i < slots.length; i++) {
    if (slots[i] - slots[i - 1] < MIN_NODE_GAP) {
      slots[i] = slots[i - 1] + MIN_NODE_GAP;
    }
  }

  return slots;
}

function weightedPickBand(rng: SeededRandom, bands: MultiplierBand[]): MultiplierBand {
  const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const band of bands) {
    roll -= band.weight;
    if (roll <= 0) return band;
  }
  return bands[0];
}

function weightedPickDivider(rng: SeededRandom, bands: DividerBand[]): DividerBand {
  const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const band of bands) {
    roll -= band.weight;
    if (roll <= 0) return band;
  }
  return bands[0];
}

function weightedPickSpecial(rng: SeededRandom, events: SpecialEventConfig[]): SpecialEventConfig {
  const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const event of events) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return events[0];
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
