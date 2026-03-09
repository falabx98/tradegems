// ─── Core Game Types ─────────────────────────────────────────────────────────

export type RiskTier = 'conservative' | 'balanced' | 'aggressive';
export type GameMode = 'solo' | 'battle';
export type RoundPhase = 'pre' | 'opening' | 'buildup' | 'chaos' | 'final' | 'frozen' | 'result';
export type NodeType = 'multiplier' | 'divider' | 'shield' | 'fake_breakout' | 'volatility_spike';
export type NodeState = 'scheduled' | 'visible' | 'approaching' | 'activated' | 'missed' | 'expired' | 'near_miss';

export type RoundStatus =
  | 'scheduled'
  | 'entry_open'
  | 'entry_closing'
  | 'locked'
  | 'generated'
  | 'active'
  | 'frozen'
  | 'resolved'
  | 'archived';

export type BetStatus = 'pending' | 'locked' | 'active' | 'settled' | 'cancelled' | 'refunded';
export type BetSizeTier = 'small' | 'medium' | 'large';
export type ResultType = 'win' | 'loss' | 'breakeven';

// ─── Node Definitions ────────────────────────────────────────────────────────

export interface GameNode {
  id: string;
  type: NodeType;
  value: number;
  timePosition: number;
  pathY: number;
  state: NodeState;
  activationRadius: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  nearMissRadius?: number;
}

// ─── Chart Path ──────────────────────────────────────────────────────────────

export interface ChartPoint {
  time: number;
  price: number;
  velocity: number;
}

export interface ChartPath {
  points: ChartPoint[];
  volatilityMap: number[];
}

// ─── Round ───────────────────────────────────────────────────────────────────

export interface RoundConfig {
  roundId: string;
  seed: string;
  duration: number;
  chartPath: ChartPath;
  nodes: GameNode[];
  riskModifiers: Record<RiskTier, RiskModifier>;
  engineConfig?: EngineConfig;
}

export interface RiskModifier {
  gainFactor: number;
  lossFactor: number;
  label: string;
}

// ─── Engine Config ───────────────────────────────────────────────────────────

export interface MultiplierBand {
  min: number;
  max: number;
  weight: number;
}

export interface DividerBand {
  value: number;
  weight: number;
}

export interface SpecialEventConfig {
  type: 'shield' | 'volatility_spike' | 'fake_breakout';
  weight: number;
}

export interface BetTierConfig {
  label: string;
  minBet: number;
  maxBet: number;
  gainFactor: number;
  lossFactor: number;
}

export interface NodeDensityConfig {
  baseMultipliers: number;
  baseDividers: number;
  baseSpecials: number;
  randomVariance: number;
}

export interface NearMissConfig {
  nearMissRadiusMultiplier: number;
  targetRate: [number, number];
}

export interface P2PPayoutConfig {
  feeRateMin: number;
  feeRateMax: number;
  bands: { label: string; percentile: number; poolShare: number }[];
}

export interface EngineConfig {
  multiplierBands: MultiplierBand[];
  dividerBands: DividerBand[];
  specialEvents: SpecialEventConfig[];
  betTiers: BetTierConfig[];
  riskTiers: Record<RiskTier, { gainFactor: number; lossFactor: number }>;
  nodeDensity: NodeDensityConfig;
  nearMiss: NearMissConfig;
  p2pPayout: P2PPayoutConfig;
  maxFinalMultiplier: number;
  fakeBreakoutDividerBoost: number;
  volatilitySpikeMultiplier: number;
  roundDuration: number;
  maxSpecialEventsPerRound: number;
}

// ─── Player State ────────────────────────────────────────────────────────────

export interface PlayerRoundState {
  playerId: string;
  betAmount: number;
  riskTier: RiskTier;
  currentMultiplier: number;
  shields: number;
  activatedNodes: string[];
  missedNodes: string[];
  nearMisses?: string[];
  betTierLabel?: string;
  xpEarned: number;
  finalPayout: number;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface RoundResult {
  roundId: string;
  playerState: PlayerRoundState;
  finalMultiplier: number;
  payout: number;
  xpGained: number;
  nodesHit: GameNode[];
  nodesMissed: GameNode[];
  nodesNearMissed?: GameNode[];
  rank?: number;
  totalPlayers?: number;
}
