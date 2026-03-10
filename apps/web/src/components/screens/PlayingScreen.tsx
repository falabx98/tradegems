import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { ChartArena } from '../arena/ChartArena';
import { GameHUD } from '../hud/GameHUD';
import { MultiplierPopup } from '../hud/MultiplierPopup';
import { theme } from '../../styles/theme';
import { GameNode } from '../../types/game';
import { formatSol } from '../../utils/sol';
import {
  playNodeActivatedSound,
  playNodeMiss,
  playNearMiss,
  playCountdownBeep,
  playRoundEnd,
} from '../../utils/sounds';

const ROUND_DURATION = 15;
const COUNTDOWN_DURATION = 3;

export function PlayingScreen() {
  const {
    roundConfig,
    phase,
    elapsed,
    currentMultiplier,
    betAmount,
    shields,
    riskTier,
    activatedNodeIds,
    missedNodeIds,
    updateElapsed,
    activateNode,
    missNode,
    nearMissNode,
    endRound,
  } = useGameStore();

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const countdownRef = useRef<number>(COUNTDOWN_DURATION);
  const isCountingDown = useRef(true);
  const countdownDisplayRef = useRef<HTMLDivElement>(null);
  const lastCountdownBeep = useRef<number>(0);

  useEffect(() => {
    if (!roundConfig) return;

    startTimeRef.current = performance.now() + COUNTDOWN_DURATION * 1000;
    isCountingDown.current = true;
    countdownRef.current = COUNTDOWN_DURATION;

    const tick = (now: number) => {
      const timeSinceMount = (now - (startTimeRef.current - COUNTDOWN_DURATION * 1000)) / 1000;

      if (timeSinceMount < COUNTDOWN_DURATION) {
        const newCount = Math.ceil(COUNTDOWN_DURATION - timeSinceMount);
        if (newCount !== lastCountdownBeep.current && newCount > 0 && newCount <= COUNTDOWN_DURATION) {
          lastCountdownBeep.current = newCount;
          playCountdownBeep(newCount);
        }
        countdownRef.current = newCount;
        if (countdownDisplayRef.current) {
          const numEl = countdownDisplayRef.current.querySelector('[data-count]');
          if (numEl) numEl.textContent = String(countdownRef.current);
          countdownDisplayRef.current.style.display = 'flex';
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (isCountingDown.current) {
        isCountingDown.current = false;
        if (countdownDisplayRef.current) {
          countdownDisplayRef.current.style.display = 'none';
        }
      }

      const gameElapsed = (now - startTimeRef.current) / 1000;

      if (gameElapsed >= ROUND_DURATION) {
        updateElapsed(ROUND_DURATION);
        // Play end sound based on multiplier
        const mult = useGameStore.getState().currentMultiplier;
        playRoundEnd(mult >= 1.0);
        endRound();
        return;
      }

      updateElapsed(gameElapsed);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [roundConfig, updateElapsed, endRound]);

  const handleNodeActivated = useCallback((node: GameNode) => {
    const prevState = useGameStore.getState();
    const prevMult = prevState.currentMultiplier;
    const prevShields = prevState.shields;

    activateNode(node);

    // Play sound after state update
    const newState = useGameStore.getState();
    const shieldBlocked = node.type === 'divider' && newState.shields < prevShields;
    playNodeActivatedSound(
      node.type, node.value, node.rarity || 'common',
      prevMult, newState.currentMultiplier, shieldBlocked,
    );
  }, [activateNode]);

  const handleNodeMissed = useCallback((node: GameNode) => {
    missNode(node);
    playNodeMiss();
  }, [missNode]);

  const handleNodeNearMissed = useCallback((node: GameNode) => {
    nearMissNode(node);
    playNearMiss();
  }, [nearMissNode]);

  if (!roundConfig) return null;

  return (
    <div style={styles.container}>
      <div style={styles.arenaFull}>
        <ChartArena
          config={roundConfig}
          elapsed={elapsed}
          phase={phase}
          activatedNodeIds={activatedNodeIds}
          missedNodeIds={missedNodeIds}
          onNodeActivated={handleNodeActivated}
          onNodeMissed={handleNodeMissed}
          onNodeNearMissed={handleNodeNearMissed}
          currentMultiplier={currentMultiplier}
        />

        <GameHUD
          phase={phase}
          elapsed={elapsed}
          duration={ROUND_DURATION}
          currentMultiplier={currentMultiplier}
          betAmount={betAmount}
          shields={shields}
          riskTier={riskTier}
        />

        <MultiplierPopup
          activatedNodeIds={activatedNodeIds}
          nodes={roundConfig.nodes}
        />

        {/* Countdown Overlay */}
        <div ref={countdownDisplayRef} style={styles.countdownOverlay}>
          <div style={styles.countdownContent}>
            <div data-count style={styles.countdownNumber} className="mono">3</div>
            <div style={styles.countdownLabel}>Get ready</div>
            <div style={styles.countdownMeta}>
              <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px' }} />
              <span className="mono">{formatSol(betAmount)}</span>
              <span style={styles.countdownDivider}>·</span>
              <span>{riskTier}</span>
              <span style={styles.countdownDivider}>·</span>
              <span>15s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom feed */}
      <div style={styles.nodeFeed}>
        {Array.from(activatedNodeIds).slice(-6).reverse().map((nodeId, i) => {
          const node = roundConfig.nodes.find(n => n.id === nodeId);
          if (!node) return null;
          const isMultiplier = node.type === 'multiplier';
          const isShield = node.type === 'shield';
          return (
            <div
              key={nodeId}
              style={{
                ...styles.feedItem,
                color: isShield ? theme.game.shield :
                       isMultiplier ? theme.game.multiplier : theme.game.divider,
                opacity: 1 - i * 0.12,
              }}
              className="mono"
            >
              {node.type === 'multiplier' && `×${node.value}`}
              {node.type === 'divider' && `÷${node.value}`}
              {node.type === 'shield' && 'Shield'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: theme.bg.primary,
  },
  arenaFull: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  countdownOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(17, 17, 20, 0.88)',
    backdropFilter: 'blur(12px)',
    zIndex: 10,
  },
  countdownContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  countdownNumber: {
    fontSize: 'clamp(64px, 12vw, 100px)',
    fontWeight: 900,
    color: '#c084fc',
    lineHeight: 1,
  },
  countdownLabel: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  countdownMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
    marginTop: '8px',
  },
  countdownDivider: {
    color: theme.text.muted,
  },
  nodeFeed: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    padding: '6px 16px',
    borderTop: `1px solid ${theme.border.subtle}`,
    background: theme.bg.secondary,
    minHeight: '30px',
    alignItems: 'center',
  },
  feedItem: {
    fontSize: '14px',
    fontWeight: 700,
  },
};
