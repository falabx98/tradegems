import { Badge } from '../primitives';

export type GamePhase = 'waiting' | 'active' | 'resolving' | 'result';

export interface StatusBadgeProps {
  phase: GamePhase;
  countdown?: number;
  label?: string;
}

const PHASE_CONFIG: Record<GamePhase, { variant: 'purple' | 'success' | 'warning' | 'default'; defaultLabel: string; dot: boolean }> = {
  waiting: { variant: 'purple', defaultLabel: 'BET', dot: false },
  active: { variant: 'success', defaultLabel: 'LIVE', dot: true },
  resolving: { variant: 'warning', defaultLabel: 'RESOLVING', dot: false },
  result: { variant: 'default', defaultLabel: 'RESULT', dot: false },
};

export function StatusBadge({ phase, countdown, label }: StatusBadgeProps) {
  const config = PHASE_CONFIG[phase];
  const displayLabel = label
    ? label
    : countdown !== undefined
      ? `${config.defaultLabel} · ${countdown}s`
      : config.defaultLabel;

  return (
    <Badge variant={config.variant} size="md" dot={config.dot}>
      {displayLabel}
    </Badge>
  );
}
