import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { ChartArena } from '../arena/ChartArena';
import { api, getServerConfig } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getPhase } from '../../engine/roundEngine';
import { getBetTier, computeNodeEffect, DEFAULT_ENGINE_CONFIG } from '../../engine/engineConfig';
import type { RoundConfig, GameNode, RoundPhase } from '../../types/game';
import {
  playNodeActivatedSound,
  playNodeMiss,
  playBattleJoin,
  playRoundEnd,
} from '../../utils/sounds';
import { MedalIcon, TrophyIcon, UserIcon, CheckIcon } from '../ui/GameIcons';

const ROUND_DURATION = 15;
const BUYIN_LABELS: Record<number, string> = {
  100_000_000: '0.1',
  250_000_000: '0.25',
  500_000_000: '0.5',
  1_000_000_000: '1',
  2_000_000_000: '2',
};

function rankBadge(rank: number): React.ReactNode {
  if (rank >= 1 && rank <= 3) return <MedalIcon rank={rank as 1 | 2 | 3} size={20} />;
  return <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text.muted }}>#{rank}</span>;
}

export function BattleScreen() {
  const {
    tournamentRoomId,
    joinTournament,
    leaveTournament,
    resetTournament,
    syncProfile,
  } = useGameStore();
  const go = useAppNavigate();

  // Tournament state from polling
  const [roomState, setRoomState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [feeRate, setFeeRate] = useState<number>((globalThis as any).__serverFeeRate ?? 0.05);

  // Fetch server fee rate for dynamic display
  useEffect(() => {
    getServerConfig().then(cfg => setFeeRate(cfg.feeRate));
  }, []);

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
  const multiplierRef = useRef(1.0);
  const roomIdRef = useRef<string | null>(null);

  multiplierRef.current = currentMultiplier;
  roomIdRef.current = tournamentRoomId;

  // ─── Room Polling ──────────────────────────────────────────────────────────

  const pollRoom = useCallback(async () => {
    const rid = roomIdRef.current;
    if (!rid) return;
    try {
      const data = await api.getTournamentRoom(rid);
      setRoomState(data);

      // Cache roundConfig once per round
      if (data.state === 'round_active' && data.roundConfig && cachedRoundRef.current !== data.currentRound) {
        setRoundConfig(data.roundConfig);
        cachedRoundRef.current = data.currentRound;
        reportedRef.current = false;
        setActivatedNodeIds(new Set());
        setMissedNodeIds(new Set());
        setCurrentMultiplier(1.0);
        setShields(0);
        setLocalElapsed(0);
      }

      // Sync profile on final results
      if (data.state === 'final_results' || data.state === 'closed') {
        syncProfile();
      }

      setError(null);
    } catch (err: any) {
      if (err.status === 404) {
        // Room closed/gone
        resetTournament();
      } else {
        setError(err.message || 'Connection failed');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncProfile, resetTournament]);

  useEffect(() => {
    if (!tournamentRoomId) return;
    pollRoom();
    const interval = roomState?.state === 'round_active' ? 500 : 1000;
    pollRef.current = setInterval(pollRoom, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollRoom, tournamentRoomId, roomState?.state]);

  // ─── Countdown Timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomState) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((roomState.phaseEndsAt - Date.now()) / 1000));
      setCountdown(remaining);
    }, 200);
    return () => clearInterval(timer);
  }, [roomState?.phaseEndsAt]);

  // ─── RAF Loop for Active Phase ────────────────────────────────────────────

  useEffect(() => {
    if (roomState?.state !== 'round_active' || !roundConfig) return;

    const tick = () => {
      const serverElapsed = (Date.now() - roomState.phaseStartedAt) / 1000;
      const elapsed = Math.min(serverElapsed, ROUND_DURATION);

      setLocalElapsed(elapsed);
      setLocalPhase(getPhase(elapsed));

      if (elapsed >= ROUND_DURATION) {
        if (!reportedRef.current && roomIdRef.current) {
          reportedRef.current = true;
          api.reportTournamentMultiplier(
            roomIdRef.current,
            roomState.currentRound,
            multiplierRef.current,
          ).catch(console.warn);
          playRoundEnd(multiplierRef.current >= 1.0);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [roomState?.state, roundConfig, roomState?.phaseStartedAt, roomState?.currentRound]);

  // ─── Node Activation ──────────────────────────────────────────────────────

  const handleNodeActivated = useCallback((node: GameNode) => {
    if (!roundConfig) return;
    const store = useGameStore.getState();
    const modifier = roundConfig.riskModifiers?.['balanced']; // Tournament uses balanced
    if (!modifier) return;

    const engineCfg = roundConfig.engineConfig ?? DEFAULT_ENGINE_CONFIG;
    const betTier = getBetTier(store.betAmount, engineCfg);

    setCurrentMultiplier(prev => {
      const { newMultiplier, newShields } = computeNodeEffect(
        node, prev, shields, modifier, betTier,
      );
      const maxMult = engineCfg.maxFinalMultiplier ?? 50;
      const clamped = Math.max(0, Math.min(maxMult, newMultiplier));
      setShields(newShields);

      playNodeActivatedSound(
        node.type, node.value, node.rarity || 'common',
        prev, clamped, false,
      );

      return clamped;
    });

    setActivatedNodeIds(prev => new Set([...prev, node.id]));
  }, [roundConfig, shields]);

  const handleNodeMissed = useCallback((node: GameNode) => {
    setMissedNodeIds(prev => new Set([...prev, node.id]));
    playNodeMiss();
  }, []);

  // ─── Join Handler ─────────────────────────────────────────────────────────

  const handleJoin = async (buyIn: number) => {
    setJoining(true);
    setError(null);
    try {
      await joinTournament(buyIn);
      playBattleJoin();
    } catch (err: any) {
      setError(err.message || 'Failed to join tournament');
    } finally {
      setJoining(false);
    }
  };

  // ─── Leave Handler ────────────────────────────────────────────────────────

  const handleLeave = async () => {
    await leaveTournament();
    setRoomState(null);
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const renderAvatar = (player: any) => {
    const initial = player.username.charAt(0).toUpperCase();
    const colors = ['#9945FF', '#14F195', '#FF6B35', '#00D4FF', '#FFD93D', '#FF4B8C'];
    const color = colors[player.username.length % colors.length];
    return (
      <div style={{ ...styles.avatar, background: color }}>
        <span style={styles.avatarText}>{initial}</span>
      </div>
    );
  };

  // ─── ROOM BROWSER (no room joined) ────────────────────────────────────────

  if (!tournamentRoomId) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <TrophyIcon size={24} color="#FFD700" />
          <span style={styles.headerTitle}>Tournaments</span>
        </div>

        <div style={styles.description}>
          3 rounds · Best cumulative score wins the pot
        </div>

        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        <div style={styles.tierGrid}>
          {Object.entries(BUYIN_LABELS).map(([lamStr, label]) => {
            const lam = parseInt(lamStr);
            return (
              <button
                key={lam}
                onClick={() => handleJoin(lam)}
                disabled={joining}
                className="btn-3d btn-3d-primary"
                style={styles.tierButton}
              >
                <span style={styles.tierAmount} className="mono">{label} SOL</span>
                <span style={styles.tierLabel}>Join</span>
              </button>
            );
          })}
        </div>

        <div style={styles.rulesBox}>
          <div style={styles.ruleRow}>
            <span style={styles.ruleIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <span>4-8 players per tournament</span>
          </div>
          <div style={styles.ruleRow}>
            <span style={styles.ruleIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </span>
            <span>3 rounds × 15 seconds each</span>
          </div>
          <div style={styles.ruleRow}>
            <span style={styles.ruleIcon}>
              <TrophyIcon size={14} color="#FFD700" />
            </span>
            <span>Winner takes all ({(feeRate * 100).toFixed(0)}% rake)</span>
          </div>
        </div>

        <button onClick={() => { resetTournament(); go('lobby'); }} className="nav-btn" style={styles.backButton}>
          Back to Lobby
        </button>
      </div>
    );
  }

  // ─── WAITING ROOM ─────────────────────────────────────────────────────────

  if (!roomState || roomState.state === 'waiting') {
    const players = roomState?.players || [];
    const maxPlayers = roomState?.maxPlayers || 8;
    const buyIn = roomState?.buyIn || 0;
    const hasCountdown = roomState?.countdownStartedAt !== null;

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <TrophyIcon size={24} color="#FFD700" />
          <span style={styles.headerTitle}>Waiting Room</span>
          <div style={styles.roomBadge}>{tournamentRoomId}</div>
        </div>

        <div style={styles.waitingInfo}>
          <div style={styles.buyInDisplay} className="mono">
            {formatSol(buyIn)} SOL Buy-in
          </div>
          <div style={styles.potDisplay} className="mono">
            Pot: {formatSol(roomState?.grossPool || 0)} SOL
          </div>
        </div>

        {hasCountdown && (
          <div style={styles.countdownBar}>
            <div style={styles.countdownLabel}>Starting in</div>
            <div style={styles.countdownValue} className="mono">{countdown}s</div>
            <div style={{
              ...styles.countdownProgress,
              width: `${Math.max(0, (countdown / 15) * 100)}%`,
            }} />
          </div>
        )}

        {!hasCountdown && (
          <div style={styles.waitingNotice}>
            Waiting for {4 - players.length} more player{4 - players.length !== 1 ? 's' : ''}...
          </div>
        )}

        {/* Player Grid */}
        <div style={styles.playerGrid}>
          {players.map((p: any) => (
            <div key={p.id} style={{
              ...styles.playerCard,
              ...(p.id === roomState?.myPlayerId ? styles.playerCardYou : {}),
            }}>
              {p.id === roomState?.myPlayerId && <div style={styles.youBadge}>YOU</div>}
              {renderAvatar(p)}
              <div style={styles.playerName}>{p.username}</div>
              <div style={styles.playerMeta}>
                Lv{p.level}
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} style={styles.emptySlot}>
              <UserIcon size={26} color="#555570" />
              <div style={styles.emptyText}>Waiting...</div>
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <button onClick={handleLeave} className="nav-btn" style={styles.backButton}>
            Leave Room
          </button>
        </div>

        <div style={styles.playerCount}>
          {players.length}/{maxPlayers} Players
        </div>
      </div>
    );
  }

  // ─── ROUND ACTIVE ─────────────────────────────────────────────────────────

  if (roomState.state === 'round_active') {
    const timeLeft = Math.max(0, Math.ceil(ROUND_DURATION - localElapsed));
    const players = roomState.players || [];

    return (
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.activeHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrophyIcon size={16} color="#FFD700" />
            <strong>ROUND {roomState.currentRound}/{roomState.totalRounds}</strong>
          </span>
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
            <div style={styles.hudRound}>R{roomState.currentRound}/{roomState.totalRounds}</div>
          </div>
        </div>

        {/* Compact Leaderboard */}
        <div style={styles.leaderboard}>
          <div style={styles.leaderboardHeader}>
            <span>Standings</span>
            <span style={{ color: theme.text.muted }}>{players.length} players</span>
          </div>
          {players.slice(0, 8).map((p: any, idx: number) => {
            const isMe = p.id === roomState.myPlayerId;
            // L1 fix: use currentRoundMultiplier from server (reported value), fallback to 1.0
            const mult = isMe ? currentMultiplier : (p.currentRoundMultiplier ?? 1.0);
            const cumScore = isMe
              ? (p.cumulativeScore || 0) + currentMultiplier
              : (p.cumulativeScore || 0) + (mult ?? 0);
            return (
              <div key={p.id} style={{
                ...styles.rankRow,
                ...(isMe ? styles.rankRowMe : {}),
              }}>
                <span style={styles.rankEmoji}>{rankBadge(idx + 1)}</span>
                <span style={{
                  ...styles.rankName,
                  color: isMe ? '#c084fc' : theme.text.primary,
                }}>
                  {p.username} {isMe && <span style={styles.youTag}>you</span>}
                </span>
                <span style={{
                  ...styles.rankMult,
                  color: (mult ?? 1.0) >= 1.0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {(mult ?? 1.0).toFixed(2)}x
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: theme.text.muted,
                  width: '50px',
                  textAlign: 'right' as const,
                }} className="mono">
                  {(cumScore ?? 0).toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        <div style={styles.poolFooter} className="mono">
          Pot: {formatSol(roomState.netPool)} SOL · Round {roomState.currentRound}/{roomState.totalRounds}
        </div>
      </div>
    );
  }

  // ─── ROUND RESULTS (between rounds) ───────────────────────────────────────

  if (roomState.state === 'round_results') {
    const players = roomState.players || [];

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <TrophyIcon size={24} color="#FFD700" />
          <span style={styles.headerTitle}>Round {roomState.currentRound} Results</span>
        </div>

        {/* Round progression dots */}
        <div style={styles.roundDots}>
          {Array.from({ length: roomState.totalRounds }).map((_, i) => (
            <div key={i} style={{
              ...styles.roundDot,
              background: i < roomState.currentRound ? '#14F195' : theme.border.medium,
            }} />
          ))}
        </div>

        {/* Standings */}
        <div style={styles.standingsTable}>
          <div style={styles.standingsHeader}>
            <span style={{ width: '28px' }}>#</span>
            <span style={{ flex: 1 }}>Player</span>
            <span style={{ width: '55px', textAlign: 'right' as const }}>Round</span>
            <span style={{ width: '55px', textAlign: 'right' as const }}>Total</span>
          </div>
          {players.map((p: any, idx: number) => {
            const isMe = p.id === roomState.myPlayerId;
            const roundMults = p.roundMultipliers || [];
            const lastRoundMult = roundMults[roundMults.length - 1] ?? 0;
            return (
              <div key={p.id} style={{
                ...styles.standingRow,
                ...(isMe ? styles.rankRowMe : {}),
              }}>
                <span style={styles.rankEmoji}>{rankBadge(idx + 1)}</span>
                <span style={{
                  flex: 1,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isMe ? '#c084fc' : theme.text.primary,
                }}>
                  {p.username} {isMe && <span style={styles.youTag}>you</span>}
                </span>
                <span style={{
                  width: '55px',
                  textAlign: 'right' as const,
                  fontSize: '14px',
                  fontWeight: 700,
                  color: lastRoundMult >= 1.0 ? '#14F195' : '#FF4B4B',
                }} className="mono">
                  {lastRoundMult.toFixed(2)}x
                </span>
                <span style={{
                  width: '55px',
                  textAlign: 'right' as const,
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#c084fc',
                }} className="mono">
                  {p.cumulativeScore.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        <div style={styles.nextRoundNotice}>
          Next round in {countdown}s...
        </div>
      </div>
    );
  }

  // ─── FINAL RESULTS ────────────────────────────────────────────────────────

  if (roomState.state === 'final_results') {
    const players = roomState.players || [];
    const winner = roomState.winner;
    const myPlayerId = roomState.myPlayerId;
    const isWinner = winner?.id === myPlayerId;

    return (
      <div style={styles.container}>
        {/* Winner celebration */}
        <div style={styles.finalHero}>
          <TrophyIcon size={52} color="#FFD700" />
          <div style={styles.winnerTitle}>
            {isWinner ? 'You Won!' : `${winner?.username || 'Winner'} Wins!`}
          </div>
          <div style={styles.winnerScore} className="mono">
            Score: {winner?.cumulativeScore?.toFixed(2) || '0'}
          </div>
          <div style={styles.winnerPayout} className="mono">
            {formatSol(winner?.payout || 0)} SOL
          </div>
        </div>

        {/* Final standings */}
        <div style={styles.standingsTable}>
          <div style={styles.rankingsTitle}>Final Standings</div>
          {players.map((p: any, idx: number) => {
            const isMe = p.id === myPlayerId;
            const roundMults = p.roundMultipliers || [];
            return (
              <div key={p.id} style={{
                ...styles.standingRow,
                ...(isMe ? styles.rankRowMe : {}),
                ...(idx === 0 ? { border: '1px solid rgba(255, 215, 0, 0.3)', background: 'rgba(255, 215, 0, 0.05)' } : {}),
              }}>
                <span style={styles.rankEmoji}>{rankBadge(idx + 1)}</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '2px' }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isMe ? '#c084fc' : theme.text.primary,
                  }}>
                    {p.username} {isMe && <span style={styles.youTag}>you</span>}
                  </span>
                  <span style={{ fontSize: '11px', color: theme.text.muted }} className="mono">
                    {roundMults.map((m: number) => m.toFixed(1) + 'x').join(' + ')}
                  </span>
                </div>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: idx === 0 ? '#FFD700' : '#c084fc',
                }} className="mono">
                  {p.cumulativeScore.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pot breakdown */}
        <div style={styles.poolSummary}>
          <div style={styles.poolRow}>
            <span>Total Pool</span>
            <span className="mono">{formatSol(roomState.grossPool)} SOL</span>
          </div>
          <div style={styles.poolRow}>
            <span>Rake ({(feeRate * 100).toFixed(0)}%)</span>
            <span className="mono" style={{ color: '#FF4B4B' }}>
              -{formatSol(roomState.grossPool - roomState.netPool)} SOL
            </span>
          </div>
          <div style={{ ...styles.poolRow, fontWeight: 700 }}>
            <span>Winner Payout</span>
            <span className="mono" style={{ color: '#14F195' }}>{formatSol(roomState.netPool)} SOL</span>
          </div>
        </div>

        <div style={styles.actions}>
          <button onClick={() => { resetTournament(); go('lobby'); }} className="btn-3d btn-3d-primary" style={styles.tierButton}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Back to Lobby</span>
          </button>
        </div>

        <div style={styles.nextRoundNotice}>
          Auto-return in {countdown}s...
        </div>
      </div>
    );
  }

  // ─── FALLBACK / LOADING ───────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      <div style={styles.idle}>
        <TrophyIcon size={52} color="#FFD700" />
        <div style={styles.idleTitle}>Tournament</div>
        <div style={styles.idleDesc}>
          {error ? error : 'Connecting...'}
        </div>
        <button onClick={() => { resetTournament(); go('lobby'); }} className="nav-btn" style={styles.backButton}>
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
  headerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.primary,
    flex: 1,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  roomBadge: {
    padding: '4px 10px',
    borderRadius: '20px',
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
  },

  // Description
  description: {
    padding: '4px 20px 12px',
    fontSize: '14px',
    color: theme.text.muted,
  },

  // Error
  errorBox: {
    margin: '0 20px 12px',
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    color: '#f87171',
    fontSize: '13px',
    fontWeight: 500,
  },

  // Buy-in Tier Grid
  tierGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    padding: '8px 20px',
    flex: 0,
  },
  tierButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '18px 12px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
  },
  tierAmount: {
    fontSize: '20px',
    fontWeight: 900,
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
  },
  tierLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },

  // Rules box
  rulesBox: {
    margin: '12px 20px',
    padding: '12px 16px',
    borderRadius: '10px',
    background: 'rgba(28, 20, 42, 0.85)',
    border: `1px solid ${theme.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: theme.text.secondary,
  },
  ruleIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
  },

  // Back button
  backButton: {
    margin: '8px 20px',
    padding: '12px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: 'transparent',
    color: theme.text.muted,
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textAlign: 'center' as const,
  },

  // Waiting
  waitingInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 20px',
    fontSize: '15px',
    color: theme.text.secondary,
  },
  buyInDisplay: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#c084fc',
  },
  potDisplay: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#14F195',
  },
  waitingNotice: {
    textAlign: 'center' as const,
    padding: '12px 20px',
    fontSize: '15px',
    color: '#c084fc',
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

  // Player grid
  playerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
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
    padding: '12px 6px',
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
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: '14px', fontWeight: 700 },
  playerName: { fontSize: '12px', fontWeight: 600, color: theme.text.primary, textAlign: 'center' as const, lineHeight: '1.2' },
  playerMeta: { fontSize: '11px', color: theme.text.muted },
  emptySlot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '12px 6px',
    borderRadius: '12px',
    border: `1px dashed ${theme.border.subtle}`,
    opacity: 0.4,
  },
  emptyText: { fontSize: '11px', color: theme.text.muted },

  // Actions
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px 20px',
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
    padding: '10px 14px',
    borderBottom: '1px solid rgba(153, 69, 255, 0.08)',
    background: 'rgba(32, 24, 48, 0.95)',
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
  hudRound: {
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'rgba(153, 69, 255, 0.2)',
    color: '#c084fc',
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
  rankEmoji: { width: '24px', textAlign: 'center' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rankName: { flex: 1, fontSize: '14px', fontWeight: 600 },
  rankMult: { fontSize: '15px', fontWeight: 700, width: '55px', textAlign: 'right' as const },
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

  // Round results
  roundDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px 20px',
  },
  roundDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'background 0.3s',
  },

  standingsTable: {
    padding: '8px 20px',
    flex: 1,
  },
  standingsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '4px',
  },
  standingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    marginBottom: '2px',
    background: 'rgba(28, 20, 42, 0.5)',
  },

  // Final results
  finalHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 20px 16px',
    gap: '8px',
  },
  winnerTitle: {
    fontSize: '28px',
    fontWeight: 900,
    color: '#FFD700',
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
  },
  winnerScore: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.secondary,
  },
  winnerPayout: {
    fontSize: '32px',
    fontWeight: 900,
    color: '#14F195',
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
    padding: '12px',
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
  idleTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  idleDesc: {
    fontSize: '16px',
    color: theme.text.muted,
    textAlign: 'center' as const,
  },
};
