import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { ChartArena } from '../arena/ChartArena';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getPhase } from '../../engine/roundEngine';
import { getBetTier, computeNodeEffect, DEFAULT_ENGINE_CONFIG } from '../../engine/engineConfig';
import type { RoundConfig, GameNode, RoundPhase } from '../../types/game';
import {
  playNodeActivatedSound,
  playNodeMiss,
  playNearMiss,
  playBattleJoin,
  playRoundEnd,
} from '../../utils/sounds';

const ROUND_DURATION = 15;

export function BattleScreen() {
  const {
    battleJoined,
    betAmount,
    riskTier,
    joinBattle,
    resetBattle,
    syncProfile,
  } = useGameStore();

  // Local state
  const [phase, setPhase] = useState<'betting' | 'active' | 'results'>('betting');
  const [roundNumber, setRoundNumber] = useState(0);
  const [players, setPlayers] = useState<any[]>([]);
  const [grossPool, setGrossPool] = useState(0);
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [phaseStartedAt, setPhaseStartedAt] = useState(0);
  const [countdown, setCountdown] = useState(20);
  const [results, setResults] = useState<any>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart/active phase state
  const [roundConfig, setRoundConfig] = useState<RoundConfig | null>(null);
  const [localElapsed, setLocalElapsed] = useState(0);
  const [localPhase, setLocalPhase] = useState<RoundPhase>('pre');
  const [activatedNodeIds, setActivatedNodeIds] = useState<Set<string>>(new Set());
  const [missedNodeIds, setMissedNodeIds] = useState<Set<string>>(new Set());
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [shields, setShields] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);
  const reportedRef = useRef(false);
  const cachedRoundRef = useRef<number>(0);
  const prevRoundRef = useRef<number>(0);
  const multiplierRef = useRef(1.0);
  const joinedRef = useRef(false);

  // Keep refs in sync
  multiplierRef.current = currentMultiplier;
  joinedRef.current = joined;

  // ─── Polling ────────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const data = await api.getCurrentBattle();

      setPhase(data.phase);
      setRoundNumber(data.roundNumber);
      setPlayers(data.players);
      setGrossPool(data.grossPool);
      setPhaseEndsAt(data.phaseEndsAt);
      setPhaseStartedAt(data.phaseStartedAt);
      setMyPlayerId(data.myPlayerId);

      if (data.results) setResults(data.results);

      // Cache roundConfig once per round
      if (data.phase === 'active' && data.roundConfig && cachedRoundRef.current !== data.roundNumber) {
        setRoundConfig(data.roundConfig);
        cachedRoundRef.current = data.roundNumber;
        reportedRef.current = false;
        setActivatedNodeIds(new Set());
        setMissedNodeIds(new Set());
        setCurrentMultiplier(1.0);
        setShields(0);
        setLocalElapsed(0);
      }

      // Reset joined state on new round & sync profile on transition to new betting phase
      if (data.phase === 'betting' && prevRoundRef.current !== data.roundNumber) {
        // If we were joined in the previous round, sync profile for updated balance
        if (prevRoundRef.current > 0 && joinedRef.current) {
          useGameStore.getState().syncProfile();
        }
        prevRoundRef.current = data.roundNumber;
        setJoined(!!data.myPlayerId);
        reportedRef.current = false;
      }

      // Keep joined state in sync
      if (data.myPlayerId) {
        setJoined(true);
      }

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = phase === 'active' ? 500 : 1000;
    pollRef.current = setInterval(poll, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll, phase]);

  // ─── Countdown Timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'betting') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      setCountdown(remaining);
    }, 200);
    return () => clearInterval(timer);
  }, [phase, phaseEndsAt]);

  // ─── RAF Loop for Active Phase ──────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'active' || !roundConfig) return;

    const tick = () => {
      const serverElapsed = (Date.now() - phaseStartedAt) / 1000;
      const elapsed = Math.min(serverElapsed, ROUND_DURATION);

      setLocalElapsed(elapsed);
      setLocalPhase(getPhase(elapsed));

      if (elapsed >= ROUND_DURATION) {
        if (!reportedRef.current && joinedRef.current) {
          reportedRef.current = true;
          api.reportBattleMultiplier(multiplierRef.current).catch(console.warn);
          playRoundEnd(multiplierRef.current >= 1.0);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, roundConfig, phaseStartedAt]);

  // ─── Node Activation ────────────────────────────────────────────────────────

  const handleNodeActivated = useCallback((node: GameNode) => {
    if (!roundConfig) return;
    const store = useGameStore.getState();
    const modifier = roundConfig.riskModifiers?.[store.riskTier];
    if (!modifier) return;

    const engineCfg = roundConfig.engineConfig ?? DEFAULT_ENGINE_CONFIG;
    const betTier = getBetTier(store.betAmount, engineCfg);
    const prevShields = shields;
    const prevMult = currentMultiplier;

    setCurrentMultiplier(prev => {
      const { newMultiplier, newShields } = computeNodeEffect(
        node, prev, shields, modifier, betTier,
      );
      const maxMult = engineCfg.maxFinalMultiplier ?? 50;
      const clamped = Math.max(0, Math.min(maxMult, newMultiplier));
      setShields(newShields);

      // Play sound with context
      const shieldBlocked = node.type === 'divider' && newShields < prevShields;
      playNodeActivatedSound(
        node.type, node.value, node.rarity || 'common',
        prev, clamped, shieldBlocked,
      );

      return clamped;
    });

    setActivatedNodeIds(prev => new Set([...prev, node.id]));
  }, [roundConfig, shields, currentMultiplier]);

  const handleNodeMissed = useCallback((node: GameNode) => {
    setMissedNodeIds(prev => new Set([...prev, node.id]));
    playNodeMiss();
  }, []);

  // ─── Join Handler ───────────────────────────────────────────────────────────

  const handleJoin = async () => {
    try {
      await joinBattle();
      setJoined(true);
      playBattleJoin();
    } catch (err: any) {
      setError(err.message || 'Failed to join');
    }
  };

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const renderPlayerAvatar = (player: any) => {
    const initial = player.username.charAt(0).toUpperCase();
    const colors = ['#9945FF', '#14F195', '#FF6B35', '#00D4FF', '#FFD93D', '#FF4B8C'];
    const color = colors[player.username.length % colors.length];
    return (
      <div style={{ ...styles.avatar, background: color }}>
        <span style={styles.avatarText}>{initial}</span>
      </div>
    );
  };

  const getVipColor = (tier: string) => {
    const map: Record<string, string> = {
      bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2', titan: '#ff6b35',
    };
    return map[tier] || '#888';
  };

  // ─── BETTING PHASE ──────────────────────────────────────────────────────────

  if (phase === 'betting') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>⚔️</span>
          <span style={styles.headerTitle}>Battle Arena</span>
          <div style={styles.roundBadge}>Round #{roundNumber}</div>
        </div>

        {/* Countdown */}
        <div style={styles.countdownBar}>
          <div style={styles.countdownLabel}>Next round in</div>
          <div style={styles.countdownValue} className="mono">{countdown}s</div>
          <div style={{
            ...styles.countdownProgress,
            width: `${Math.max(0, (countdown / 20) * 100)}%`,
          }} />
        </div>

        {/* Info bar */}
        <div style={styles.infoBar}>
          <span className="mono">◈ {formatSol(betAmount)}</span>
          <span>Risk <strong>{riskTier}</strong></span>
          <span>Pool <strong className="mono">◈ {formatSol(grossPool)}</strong></span>
        </div>

        {/* Player Grid */}
        <div style={styles.playerGrid}>
          {players.map((p) => (
            <div key={p.id} style={{
              ...styles.playerCard,
              ...(p.id === myPlayerId ? styles.playerCardYou : {}),
            }}>
              {p.id === myPlayerId && <div style={styles.youBadge}>YOU</div>}
              {renderPlayerAvatar(p)}
              <div style={styles.playerName}>{p.username}</div>
              <div style={styles.playerMeta}>
                Lv{p.level} <span style={{ color: getVipColor(p.vipTier) }}>{p.vipTier}</span>
              </div>
              <div style={styles.playerBet} className="mono">◈ {formatSol(p.betAmount)}</div>
            </div>
          ))}
          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 6 - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} style={styles.emptySlot}>
              <div style={styles.emptyIcon}>👤</div>
              <div style={styles.emptyText}>Waiting...</div>
            </div>
          ))}
        </div>

        {/* Join button */}
        <div style={styles.actions}>
          {joined ? (
            <div style={styles.joinedBadge}>✓ Joined — waiting for round</div>
          ) : (
            <button onClick={handleJoin} style={styles.joinButton}>
              ⚔️ Place Bet & Join
              <span className="mono" style={{ opacity: 0.8 }}>
                {' '}◈ {formatSol(betAmount)} · {riskTier}
              </span>
            </button>
          )}
          <button onClick={resetBattle} style={styles.cancelButton}>
            Back to Lobby
          </button>
        </div>

        {/* Player count */}
        <div style={styles.playerCount}>
          {players.length}/6 Players
        </div>
      </div>
    );
  }

  // ─── ACTIVE PHASE ───────────────────────────────────────────────────────────

  if (phase === 'active') {
    const timeLeft = Math.max(0, Math.ceil(ROUND_DURATION - localElapsed));

    return (
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.activeHeader}>
          <span>⚔️ <strong>BATTLE IN PROGRESS</strong></span>
          <span className="mono" style={styles.timer}>{timeLeft}s</span>
        </div>

        {/* Progress bar */}
        <div style={styles.progressBarBg}>
          <div style={{
            ...styles.progressBarFill,
            width: `${Math.max(0, (1 - localElapsed / ROUND_DURATION) * 100)}%`,
          }} />
        </div>

        {/* Chart Area */}
        <div style={styles.chartArea}>
          {roundConfig ? (
            <ChartArena
              config={roundConfig}
              elapsed={localElapsed}
              phase={localPhase}
              activatedNodeIds={activatedNodeIds}
              missedNodeIds={missedNodeIds}
              onNodeActivated={handleNodeActivated}
              onNodeMissed={handleNodeMissed}
              currentMultiplier={currentMultiplier}
            />
          ) : (
            <div style={styles.loadingChart}>Loading chart...</div>
          )}
          {/* HUD Overlay */}
          <div style={styles.hudOverlay}>
            <div style={{
              ...styles.hudMultiplier,
              color: currentMultiplier >= 1.0 ? '#14F195' : '#FF4B4B',
            }} className="mono">
              {currentMultiplier.toFixed(2)}x
            </div>
            {joined && <div style={styles.hudJoinedBadge}>PLAYING</div>}
          </div>
        </div>

        {/* Compact Leaderboard */}
        <div style={styles.leaderboard}>
          <div style={styles.leaderboardHeader}>
            <span>Live Rankings</span>
            <span style={{ color: theme.text.muted }}>{players.length} players</span>
          </div>
          {players.slice(0, 6).map((p, idx) => {
            const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            const isMe = p.id === myPlayerId;
            const mult = isMe ? currentMultiplier : p.currentMultiplier;
            const pnl = (mult - 1) * p.betAmount;
            return (
              <div key={p.id} style={{
                ...styles.rankRow,
                ...(isMe ? styles.rankRowMe : {}),
              }}>
                <span style={styles.rankEmoji}>{rankEmoji}</span>
                <span style={{
                  ...styles.rankName,
                  color: isMe ? '#c084fc' : theme.text.primary,
                }}>
                  {p.username} {isMe && <span style={styles.youTag}>you</span>}
                </span>
                <span style={{
                  ...styles.rankMult,
                  color: mult >= 1.0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {mult.toFixed(2)}x
                </span>
                <span style={{
                  ...styles.rankPnl,
                  color: pnl >= 0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {pnl >= 0 ? '+' : ''}{formatSol(Math.abs(pnl))}
                </span>
              </div>
            );
          })}
        </div>

        <div style={styles.poolFooter} className="mono">
          ◈ Pool: {formatSol(grossPool)}
        </div>
      </div>
    );
  }

  // ─── RESULTS PHASE ──────────────────────────────────────────────────────────

  if (phase === 'results' && results) {
    const rankings = results.rankings || [];
    const myResult = rankings.find((r: any) => r.playerId === myPlayerId);
    const myRank = myResult?.rank || '-';
    const myMult = myResult?.finalMultiplier || currentMultiplier;
    const myPnl = myResult ? myResult.profitLoss : 0;
    const rankEmoji = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`;

    const autoCountdown = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));

    return (
      <div style={styles.container}>
        {/* Hero result */}
        {myResult && (
          <div style={styles.resultsHero}>
            <div style={styles.resultRankBig}>{rankEmoji}</div>
            <div style={styles.resultPlace}>
              {myRank === 1 ? '1st' : myRank === 2 ? '2nd' : myRank === 3 ? '3rd' : `${myRank}th`} Place!
            </div>
            <div style={{
              ...styles.resultMult,
              color: myMult >= 1.0 ? '#14F195' : '#FF4B4B',
            }} className="mono">
              {myMult.toFixed(2)}x
            </div>
            <div style={{
              ...styles.resultPnl,
              color: myPnl >= 0 ? '#14F195' : '#FF4B4B',
            }} className="mono">
              {myPnl >= 0 ? '+' : ''}{formatSol(Math.abs(myPnl))} SOL
            </div>
          </div>
        )}

        {/* Rankings */}
        <div style={styles.rankingsTable}>
          <div style={styles.rankingsTitle}>Battle Rankings</div>
          {rankings.map((r: any) => {
            const isMe = r.playerId === myPlayerId;
            const bandColor = r.band === 'top' ? '#FFD700' : r.band === 'medium' ? '#14F195'
              : r.band === 'breakeven' ? '#60A5FA' : '#FF4B4B';
            const rEmoji = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;
            return (
              <div key={r.playerId} style={{
                ...styles.resultRow,
                ...(isMe ? styles.resultRowMe : {}),
              }}>
                <span style={styles.resultRank}>{rEmoji}</span>
                <div style={styles.resultInfo}>
                  <span style={{ color: isMe ? '#c084fc' : theme.text.primary }}>
                    {r.username} {isMe && <span style={styles.youTag}>you</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: bandColor }}>● {r.band}</span>
                </div>
                <span style={{
                  ...styles.resultMultSmall,
                  color: r.finalMultiplier >= 1.0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {r.finalMultiplier.toFixed(2)}x
                </span>
                <span style={{
                  ...styles.resultPnlSmall,
                  color: r.profitLoss >= 0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {r.profitLoss >= 0 ? '+' : ''}{formatSol(Math.abs(r.profitLoss))}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pool summary */}
        {results.pool && (
          <div style={styles.poolSummary}>
            <div style={styles.poolRow}>
              <span>Gross Pool</span>
              <span className="mono">{formatSol(results.pool.grossPool)} SOL</span>
            </div>
            <div style={styles.poolRow}>
              <span>Platform Fee ({(results.pool.feeRate * 100).toFixed(0)}%)</span>
              <span className="mono" style={{ color: '#FF4B4B' }}>-{formatSol(results.pool.platformFee)} SOL</span>
            </div>
            <div style={{ ...styles.poolRow, fontWeight: 700 }}>
              <span>Net Pool</span>
              <span className="mono" style={{ color: '#14F195' }}>{formatSol(results.pool.netPool)} SOL</span>
            </div>
          </div>
        )}

        <div style={styles.nextRoundNotice}>
          Next round in {autoCountdown}s...
        </div>
      </div>
    );
  }

  // ─── IDLE / LOADING ─────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      <div style={styles.idle}>
        <div style={{ fontSize: '52px' }}>⚔️</div>
        <div style={styles.idleTitle}>Battle Arena</div>
        <div style={styles.idleDesc}>
          {error ? error : 'Connecting to battle...'}
        </div>
        <button onClick={resetBattle} style={styles.cancelButton}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: theme.bg.primary,
    overflow: 'auto',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 20px 8px',
  },
  headerIcon: { fontSize: '26px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: theme.text.primary, flex: 1, fontFamily: "'Orbitron', sans-serif", textTransform: 'uppercase' as const, letterSpacing: '1px' },
  roundBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
    fontSize: '14px',
    fontWeight: 600,
  },

  // Countdown
  countdownBar: {
    position: 'relative',
    margin: '8px 20px',
    padding: '12px 16px',
    borderRadius: '12px',
    background: 'rgba(28, 20, 42, 0.85)',
    border: `1px solid ${theme.border.medium}`,
    overflow: 'hidden',
  },
  countdownLabel: { fontSize: '13px', color: theme.text.muted, marginBottom: '4px' },
  countdownValue: { fontSize: '34px', fontWeight: 900, color: '#c084fc', fontFamily: "'Orbitron', sans-serif" },
  countdownProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    background: 'linear-gradient(90deg, #9945FF, #14F195)',
    transition: 'width 0.2s linear',
  },

  // Info bar
  infoBar: {
    display: 'flex',
    gap: '16px',
    padding: '8px 20px',
    fontSize: '14px',
    color: theme.text.secondary,
  },

  // Player grid
  playerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    padding: '8px 20px',
    flex: 1,
  },
  playerCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 8px',
    borderRadius: '12px',
    background: 'rgba(28, 20, 42, 0.85)',
    border: `1px solid ${theme.border.subtle}`,
  },
  playerCardYou: {
    border: '1px solid rgba(153, 69, 255, 0.4)',
    background: 'rgba(153, 69, 255, 0.08)',
  },
  youBadge: {
    position: 'absolute',
    top: '4px',
    right: '6px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.2)',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: '16px', fontWeight: 700 },
  playerName: { fontSize: '13px', fontWeight: 600, color: theme.text.primary, textAlign: 'center' as const },
  playerMeta: { fontSize: '11px', color: theme.text.muted },
  playerBet: { fontSize: '12px', color: theme.text.secondary },
  emptySlot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '12px 8px',
    borderRadius: '12px',
    border: `1px dashed ${theme.border.subtle}`,
    opacity: 0.4,
  },
  emptyIcon: { fontSize: '26px', opacity: 0.5 },
  emptyText: { fontSize: '12px', color: theme.text.muted },

  // Actions
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 20px',
  },
  joinButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: '#9945FF',
    color: '#fff',
    fontSize: '17px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    boxShadow: '0 4px 0 #7325d4, 0 6px 12px rgba(153, 69, 255, 0.3)',
    transition: 'all 0.1s ease',
  },
  joinedBadge: {
    textAlign: 'center' as const,
    padding: '14px',
    borderRadius: '12px',
    background: 'rgba(20, 241, 149, 0.1)',
    color: '#14F195',
    fontSize: '16px',
    fontWeight: 600,
    border: '1px solid rgba(20, 241, 149, 0.2)',
  },
  cancelButton: {
    width: '100%',
    padding: '10px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: 'transparent',
    color: theme.text.muted,
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
  },
  playerCount: {
    textAlign: 'center' as const,
    padding: '8px',
    fontSize: '14px',
    color: theme.text.muted,
    borderTop: `1px solid ${theme.border.subtle}`,
  },

  // Active phase
  activeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    color: theme.text.primary,
    fontSize: '16px',
  },
  timer: {
    fontSize: '26px',
    fontWeight: 900,
    color: '#c084fc',
  },
  progressBarBg: {
    height: '3px',
    background: theme.border.subtle,
    margin: '0 20px 4px',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #9945FF, #14F195)',
    transition: 'width 0.1s linear',
    borderRadius: '2px',
  },
  chartArea: {
    position: 'relative',
    flex: 3,
    minHeight: '200px',
    overflow: 'hidden',
  },
  loadingChart: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: theme.text.muted,
    fontSize: '16px',
  },
  hudOverlay: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
    zIndex: 5,
  },
  hudMultiplier: {
    fontSize: '30px',
    fontWeight: 900,
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  },
  hudJoinedBadge: {
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'rgba(20, 241, 149, 0.2)',
    color: '#14F195',
    fontSize: '12px',
    fontWeight: 700,
  },
  leaderboard: {
    flex: 2,
    minHeight: '120px',
    padding: '8px 16px',
    borderTop: `1px solid ${theme.border.subtle}`,
    overflow: 'auto',
  },
  leaderboardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '6px',
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    borderRadius: '8px',
    marginBottom: '2px',
  },
  rankRowMe: {
    background: 'rgba(153, 69, 255, 0.08)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
  },
  rankEmoji: { fontSize: '16px', width: '24px', textAlign: 'center' as const },
  rankName: { flex: 1, fontSize: '14px', fontWeight: 600 },
  rankMult: { fontSize: '15px', fontWeight: 700, width: '55px', textAlign: 'right' as const },
  rankPnl: { fontSize: '13px', fontWeight: 600, width: '65px', textAlign: 'right' as const },
  youTag: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.2)',
    padding: '1px 4px',
    borderRadius: '3px',
    marginLeft: '4px',
  },
  poolFooter: {
    textAlign: 'center' as const,
    padding: '6px',
    fontSize: '13px',
    color: theme.text.muted,
    borderTop: `1px solid ${theme.border.subtle}`,
  },

  // Results
  resultsHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 20px 16px',
    gap: '4px',
  },
  resultRankBig: { fontSize: '52px' },
  resultPlace: { fontSize: '24px', fontWeight: 700, color: theme.text.primary },
  resultMult: { fontSize: '38px', fontWeight: 900 },
  resultPnl: { fontSize: '16px', fontWeight: 600 },

  rankingsTable: {
    padding: '0 20px',
  },
  rankingsTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.primary,
    marginBottom: '8px',
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    marginBottom: '2px',
    background: 'rgba(28, 20, 42, 0.5)',
  },
  resultRowMe: {
    background: 'rgba(153, 69, 255, 0.08)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
  },
  resultRank: { fontSize: '18px', width: '28px', textAlign: 'center' as const },
  resultInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    fontSize: '14px',
    fontWeight: 600,
  },
  resultMultSmall: { fontSize: '15px', fontWeight: 700, width: '55px', textAlign: 'right' as const },
  resultPnlSmall: { fontSize: '13px', fontWeight: 600, width: '65px', textAlign: 'right' as const },

  poolSummary: {
    margin: '12px 20px',
    padding: '10px 14px',
    borderRadius: '10px',
    background: 'rgba(28, 20, 42, 0.85)',
    border: `1px solid ${theme.border.subtle}`,
  },
  poolRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: theme.text.secondary,
    padding: '3px 0',
  },

  nextRoundNotice: {
    textAlign: 'center' as const,
    padding: '16px',
    fontSize: '15px',
    color: '#c084fc',
    fontWeight: 600,
  },

  // Idle
  idle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
    padding: '40px',
  },
  idleTitle: { fontSize: '24px', fontWeight: 700, color: theme.text.primary, fontFamily: "'Orbitron', sans-serif", textTransform: 'uppercase' as const, letterSpacing: '1px' },
  idleDesc: { fontSize: '16px', color: theme.text.muted, textAlign: 'center' as const },
};
