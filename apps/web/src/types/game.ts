// ─── Core Game Types ─────────────────────────────────────────────────────────

export type RiskTier = 'conservative' | 'balanced' | 'aggressive';

export type GameMode = 'solo' | 'battle' | 'prediction';

export type RoundPhase = 'pre' | 'opening' | 'buildup' | 'chaos' | 'final' | 'frozen' | 'result';

export type NodeType = 'multiplier' | 'divider' | 'shield' | 'fake_breakout' | 'volatility_spike';

export type NodeState = 'scheduled' | 'visible' | 'approaching' | 'activated' | 'missed' | 'expired' | 'near_miss';

// ─── Node Definitions ────────────────────────────────────────────────────────

export interface GameNode {
  id: string;
  type: NodeType;
  value: number;          // e.g., 2 for x2 or ÷2
  timePosition: number;   // 0-15 seconds, when node appears on path
  pathY: number;          // Y position on the chart path (0-1 normalized)
  state: NodeState;
  activationRadius: number; // how close the chart must pass to activate
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  nearMissRadius?: number;  // distance threshold for near-miss detection
}

// ─── Chart Path ──────────────────────────────────────────────────────────────

export interface ChartPoint {
  time: number;    // 0-15
  price: number;   // normalized 0-1
  velocity: number; // rate of change
}

export interface ChartPath {
  points: ChartPoint[];
  volatilityMap: number[];  // volatility at each time segment
}

// ─── Round ───────────────────────────────────────────────────────────────────

export interface RoundConfig {
  roundId: string;
  seed: string;
  duration: number;          // always 15
  chartPath: ChartPath;
  nodes: GameNode[];
  riskModifiers: Record<RiskTier, RiskModifier>;
  engineConfig?: import('../engine/engineConfig').EngineConfig;
}

export interface RiskModifier {
  gainFactor: number;
  lossFactor: number;
  label: string;
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
  xpEarned: number;
  finalPayout: number;
  nearMisses?: string[];     // node IDs that were near-misses
  betTierLabel?: string;     // for display: "Small", "Medium", "Large"
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
  nodesNearMissed?: GameNode[];   // nodes that were near-misses
  rank?: number;                  // for battle mode
  totalPlayers?: number;          // for battle mode
}

// ─── Player Profile ──────────────────────────────────────────────────────────

export type VipTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'titan';

export interface PlayerProfile {
  id: string;
  username: string;
  level: number;
  xp: number;
  xpToNext: number;
  vipTier: VipTier;
  rakebackRate: number;
  avatarUrl: string | null;
  balance: number;
  totalWagered: number;
  totalWon: number;
  roundsPlayed: number;
  winRate: number;
  streak: number;
  bestMultiplier: number;
}

// ─── Lobby ───────────────────────────────────────────────────────────────────

export interface BattleLobby {
  id: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  minBet: number;
  maxBet: number;
  status: 'waiting' | 'starting' | 'active' | 'finished';
  startsIn: number;
}

export interface LobbyPlayer {
  id: string;
  username: string;
  level: number;
  vipTier: VipTier;
  avatar?: string;
}
