// ─── Replay Data System ──────────────────────────────────────────────────────
// Captures and serializes round replay data for auditability and playback.

import type { ChartPath, GameNode, RoundConfig, RoundResult } from '../types/game';

export type ReplayEventType =
  | 'node_activated'
  | 'node_missed'
  | 'near_miss'
  | 'shield_consumed'
  | 'fake_breakout_triggered'
  | 'volatility_spike_triggered';

export interface ReplayEvent {
  time: number;
  type: ReplayEventType;
  nodeId: string;
  details?: Record<string, unknown>;
}

export interface ReplayData {
  roundSeed: string;
  chartPath: ChartPath;
  nodeList: GameNode[];
  eventTimeline: ReplayEvent[];
  playerResults: RoundResult[];
}

/** Build a replay data object from round state. */
export function createReplayData(
  config: RoundConfig,
  events: ReplayEvent[],
  results: RoundResult[],
): ReplayData {
  return {
    roundSeed: config.seed,
    chartPath: config.chartPath,
    nodeList: config.nodes,
    eventTimeline: [...events].sort((a, b) => a.time - b.time),
    playerResults: results,
  };
}

/** Serialize replay for storage/transport. */
export function serializeReplay(replay: ReplayData): string {
  return JSON.stringify(replay);
}

/** Deserialize replay from storage/transport. */
export function deserializeReplay(data: string): ReplayData {
  return JSON.parse(data) as ReplayData;
}
