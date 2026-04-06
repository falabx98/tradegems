import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useIsMobile } from '../../hooks/useIsMobile';
import { gameTrack } from '../../utils/analytics';
import { apiFetch } from '../../utils/api';
import { toast } from '../../stores/toastStore';
import { theme } from '../../styles/theme';
import { GameHeader, RoundInfoFooter } from '../game';
import { BetPanel } from '../ui/BetPanel';
import { ResultOverlay } from '../game/ResultOverlay';
import { CountUpNumber } from '../game/CountUpNumber';
import { WinConfetti } from '../game/WinConfetti';
import { MultiplierPulse } from '../game/MultiplierPulse';
import { SolIcon } from '../ui/SolIcon';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';

/* ─── TYPES ─── */

interface RevealedCell {
  x: number;
  y: number;
  safe: boolean;
  multiplier: number;
  gemTier: 'emerald' | 'sapphire' | 'amethyst' | 'diamond';
}

interface MinesGamePublic {
  id: string;
  betAmount: number;
  mineCount: number;
  seedHash: string;
  status: 'active' | 'cashed_out' | 'lost';
  revealedCells: RevealedCell[];
  revealCount: number;
  currentMultiplier: number;
  createdAt: string;
}

interface GameOverPayload {
  seed: string;
  clientSeed: string;
  minePositions: { x: number; y: number }[];
}

interface RevealResponse {
  safe: boolean;
  position: { x: number; y: number };
  multiplier: number;
  gemTier: string;
  gameOver?: GameOverPayload;
}

interface CashoutResponse {
  payout: number;
  finalMultiplier: number;
  seed: string;
  clientSeed: string;
  minePositions: { x: number; y: number }[];
}

type GamePhase = 'setup' | 'playing' | 'won' | 'lost';

/* ─── CONSTANTS ─── */

const MINE_OPTIONS = [1, 3, 5, 7, 10] as const;
const RISK_LABELS: Record<number, string> = { 1: 'Casual', 3: 'Low', 5: 'Medium', 7: 'High', 10: 'Extreme' };

const BET_PRESETS = [
  { label: '0.1', lamports: 100_000_000 },
  { label: '0.5', lamports: 500_000_000 },
  { label: '1', lamports: 1_000_000_000 },
  { label: '5', lamports: 5_000_000_000 },
  { label: '10', lamports: 10_000_000_000 },
  { label: '50', lamports: 50_000_000_000 },
  { label: '100', lamports: 100_000_000_000 },
];

const GEM_TIER_COLORS: Record<string, string> = {
  emerald: '#10B981',
  sapphire: '#3b82f6',
  amethyst: '#8b5cf6',
  diamond: '#FFFFFF',
};

// Preload game assets
if (typeof window !== 'undefined') {
  const preload = (src: string) => { const img = new Image(); img.src = src; };
  preload('/mines_gem_green.png');
  preload('/mines_trap_crystal.png');
}

/* ─── COMPONENT ─── */

export function MinesScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuthStore();
  const { profile, syncProfile } = useGameStore();
  const balance = profile.balance;

  // ─── Game State ───
  const [phase, setPhase] = useState<GamePhase>('setup');
  const [game, setGame] = useState<MinesGamePublic | null>(null);
  const [mineCount, setMineCount] = useState(5);
  const [betAmount, setBetAmount] = useState(100_000_000);
  const [revealedCells, setRevealedCells] = useState<RevealedCell[]>([]);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [revealingTile, setRevealingTile] = useState<string | null>(null);

  // ─── Result State ───
  const [resultType, setResultType] = useState<'won' | 'lost' | null>(null);
  const [resultPayout, setResultPayout] = useState(0);
  const [resultMultiplier, setResultMultiplier] = useState(0);
  const [minePositions, setMinePositions] = useState<{ x: number; y: number }[]>([]);
  const [resultSeed, setResultSeed] = useState('');
  const [, setResultClientSeed] = useState('');
  const [showResult, setShowResult] = useState(false);

  const mountedRef = useRef(true);

  // ─── Check for active game on mount ───
  useEffect(() => {
    mountedRef.current = true;
    if (isAuthenticated) checkActiveGame();
    return () => { mountedRef.current = false; };
  }, [isAuthenticated]);

  const checkActiveGame = useCallback(async () => {
    try {
      const res = await apiFetch<{ game: MinesGamePublic | null }>('/v1/mines/active');
      if (!mountedRef.current) return;
      if (res.game) {
        setGame(res.game);
        setRevealedCells(res.game.revealedCells);
        setCurrentMultiplier(res.game.currentMultiplier);
        setMineCount(res.game.mineCount);
        setBetAmount(res.game.betAmount);
        setPhase('playing');
      }
    } catch {}
  }, []);

  // ─── Start Game ───
  const handleStart = useCallback(async () => {
    if (loading || !isAuthenticated) return;
    setLoading(true);
    gameTrack.start('mines', betAmount);
    try {
      const res = await apiFetch<{ success: boolean; game: MinesGamePublic }>('/v1/mines/start', {
        method: 'POST',
        body: JSON.stringify({ betAmount, mineCount }),
      });
      if (!mountedRef.current) return;
      setGame(res.game);
      setRevealedCells([]);
      setCurrentMultiplier(1.0);
      setMinePositions([]);
      setResultType(null);
      setShowResult(false);
      setPhase('playing');
      syncProfile();
    } catch (err: any) {
      const code = err?.code || err?.details?.code || err?.message || '';
      if (code.includes('ACTIVE_GAME_EXISTS') || code.includes('active')) {
        await checkActiveGame();
      } else {
        toast.error('Failed to start', err?.message || 'Please try again');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [betAmount, mineCount, loading, isAuthenticated, syncProfile, checkActiveGame]);

  // ─── Reveal Tile ───
  const handleReveal = useCallback(async (x: number, y: number) => {
    if (!game || phase !== 'playing' || revealingTile || loading) return;
    if (revealedCells.some(c => c.x === x && c.y === y)) return;

    const key = `${x}-${y}`;
    setRevealingTile(key);

    try {
      const res = await apiFetch<{ success: boolean; result: RevealResponse }>('/v1/mines/reveal', {
        method: 'POST',
        body: JSON.stringify({ gameId: game.id, x, y }),
      });
      if (!mountedRef.current) return;

      const { result } = res;
      const cell: RevealedCell = {
        x: result.position.x,
        y: result.position.y,
        safe: result.safe,
        multiplier: result.multiplier,
        gemTier: result.gemTier as RevealedCell['gemTier'],
      };

      const newRevealed = [...revealedCells, cell];
      setRevealedCells(newRevealed);

      if (result.safe) {
        setCurrentMultiplier(result.multiplier);
      }

      if (result.gameOver) {
        setMinePositions(result.gameOver.minePositions);
        setResultSeed(result.gameOver.seed);
        setResultClientSeed(result.gameOver.clientSeed);

        if (result.safe) {
          // Cap-hit auto-cashout
          const payout = Math.floor(game.betAmount * result.multiplier);
          setResultType('won');
          setResultPayout(payout);
          setResultMultiplier(result.multiplier);
          setPhase('won');
          setTimeout(() => setShowResult(true), 400);
          const profit = payout - game.betAmount;
          if (profit > 0) {
            toast.success('Max Win!', `+${(profit / 1e9).toFixed(4)} SOL added to balance`);
          }
        } else {
          setResultType('lost');
          setResultPayout(0);
          setResultMultiplier(0);
          setPhase('lost');
          setTimeout(() => setShowResult(true), 600);
          toast.info('Mine Hit', `${(game.betAmount / 1e9).toFixed(4)} SOL lost`);
        }
        syncProfile();
      }
    } catch (err: any) {
      if (err?.message?.includes('not active') || err?.message?.includes('EXPIRED')) {
        setPhase('setup');
        setGame(null);
        toast.warning('Game ended', 'Your game was resolved');
        syncProfile();
      }
    } finally {
      if (mountedRef.current) setRevealingTile(null);
    }
  }, [game, phase, revealingTile, loading, revealedCells, syncProfile]);

  // ─── Cash Out ───
  const handleCashout = useCallback(async () => {
    if (!game || phase !== 'playing' || loading || revealedCells.length < 1) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; result: CashoutResponse }>('/v1/mines/cashout', {
        method: 'POST',
        body: JSON.stringify({ gameId: game.id }),
      });
      if (!mountedRef.current) return;
      setMinePositions(res.result.minePositions);
      setResultSeed(res.result.seed);
      setResultClientSeed(res.result.clientSeed);
      setResultType('won');
      setResultPayout(res.result.payout);
      setResultMultiplier(res.result.finalMultiplier);
      gameTrack.cashout('mines', res.result.finalMultiplier);
      setPhase('won');
      setTimeout(() => setShowResult(true), 300);
      const profit = res.result.payout - (game?.betAmount || 0);
      if (profit > 0) {
        toast.success('Cashed Out!', `+${(profit / 1e9).toFixed(4)} SOL added to balance`);
      }
      syncProfile();
    } catch (err: any) {
      toast.error('Cashout failed', err?.message || 'Please try again');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [game, phase, loading, revealedCells, syncProfile]);

  // ─── Play Again ───
  const handlePlayAgain = useCallback(() => {
    setPhase('setup');
    setGame(null);
    setRevealedCells([]);
    setCurrentMultiplier(1.0);
    setMinePositions([]);
    setResultType(null);
    setResultPayout(0);
    setResultMultiplier(0);
    setShowResult(false);
  }, []);

  // ─── Helpers ───
  const solFormat = (lamports: number) => (lamports / 1e9).toFixed(lamports >= 1e9 ? 2 : lamports >= 1e7 ? 4 : 3);
  const isGameOver = phase === 'won' || phase === 'lost';
  const canCashout = phase === 'playing' && revealedCells.length >= 1 && !loading && !revealingTile;
  const cashoutValue = Math.floor(game?.betAmount ? game.betAmount * currentMultiplier : 0);
  const profit = resultPayout - (game?.betAmount || 0);

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  /* ─── CONTROL RAIL CONTENT ─── */
  const railContent = (
    <GameControlRail>
      {/* Multiplier Hero (during play / result) */}
      {phase !== 'setup' && (
        <div style={{
          textAlign: 'center',
          padding: `${gap.md}px`,
          background: theme.bg.secondary,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.border.subtle}`,
        }}>
          <MultiplierPulse value={currentMultiplier} enabled={phase === 'playing'}>
            <div style={{
              fontSize: isMobile ? ts('hero') : 32,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '-0.02em',
              color: isGameOver
                ? (resultType === 'won' ? theme.accent.neonGreen : theme.accent.red)
                : currentMultiplier >= 10 ? '#FF3333'
                : currentMultiplier >= 5 ? '#FF8C00'
                : currentMultiplier >= 3 ? '#FFD700'
                : theme.accent.neonGreen,
              textShadow: phase === 'playing'
                ? `0 0 ${Math.min(24, currentMultiplier * 4)}px ${
                    currentMultiplier >= 10 ? 'rgba(255,51,51,0.5)'
                    : currentMultiplier >= 5 ? 'rgba(255,140,0,0.4)'
                    : currentMultiplier >= 3 ? 'rgba(255,215,0,0.35)'
                    : `rgba(0, 231, 1, ${Math.min(0.4, currentMultiplier * 0.06)})`
                  }`
                : 'none',
              transition: 'text-shadow 0.3s ease',
            }}>
              {isGameOver
                ? (resultType === 'won' ? `${resultMultiplier.toFixed(2)}x` : '0.00x')
                : `${currentMultiplier.toFixed(2)}x`
              }
            </div>
          </MultiplierPulse>
          <div style={{
            fontSize: ts('sm'),
            color: theme.text.secondary,
            marginTop: gap.xs,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {isGameOver
              ? (resultType === 'won'
                ? <>{`+${solFormat(profit)}`} <SolIcon size="0.9em" /></>
                : <>{`-${solFormat(game?.betAmount || 0)}`} <SolIcon size="0.9em" /></>)
              : (revealedCells.length > 0
                ? <>Cash out: {solFormat(cashoutValue)} <SolIcon size="0.9em" /></>
                : <>Bet: {solFormat(game?.betAmount || 0)} <SolIcon size="0.9em" /></>)
            }
          </div>
        </div>
      )}

      {/* Cash Out Button (during play) */}
      {phase === 'playing' && (
        <button
          onClick={handleCashout}
          disabled={!canCashout}
          style={canCashout ? cashoutActive : cashoutDisabled}
        >
          {revealedCells.length < 1
            ? 'Reveal a tile first'
            : loading
              ? 'Cashing out...'
              : <>CASH OUT  ·  {currentMultiplier.toFixed(2)}x  ·  {solFormat(cashoutValue)} <SolIcon size="0.9em" /></>
          }
        </button>
      )}

      {/* Setup: Mine Count Selector */}
      {phase === 'setup' && (
        <div style={{
          padding: `${gap.md}px`,
          background: theme.bg.secondary,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{
            fontSize: ts('sm'),
            fontWeight: 600,
            color: theme.text.secondary,
            marginBottom: gap.sm,
            display: 'flex',
            alignItems: 'center',
            gap: gap.sm,
          }}>
            Mines: <span style={{ color: theme.accent.purple }}>{mineCount}</span>
            <span style={{
              fontSize: ts('xs'),
              padding: '2px 8px',
              borderRadius: theme.radius.full,
              background: 'rgba(139, 92, 246, 0.1)',
              color: theme.accent.purple,
              fontWeight: 500,
            }}>{RISK_LABELS[mineCount]}</span>
          </div>
          <div style={{ display: 'flex', gap: gap.sm }}>
            {MINE_OPTIONS.map(count => (
              <button
                key={count}
                onClick={() => setMineCount(count)}
                style={count === mineCount ? pillActive : pillDefault}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Setup: Bet Panel */}
      {phase === 'setup' && (
        <BetPanel
          presets={BET_PRESETS}
          selectedAmount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          feeRate={0}
          submitLabel="Start Game"
          onSubmit={handleStart}
          submitDisabled={loading || !isAuthenticated}
          submitLoading={loading}
          submitVariant="success"
          compact
        />
      )}

      {/* Result actions */}
      {isGameOver && !isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: gap.sm }}>
          <button onClick={handlePlayAgain} style={btnPrimary}>
            Play Again
          </button>
          <button onClick={() => go('lobby')} style={btnGhost}>
            Lobby
          </button>
        </div>
      )}
    </GameControlRail>
  );

  /* ─── GAME STAGE CONTENT ─── */
  const stageContent = (
    <GameStage
      atmosphere="radial-gradient(ellipse at 50% 40%, rgba(16,185,129,0.05) 0%, transparent 70%)"
      style={{ padding: isMobile ? 10 : 12 }}
    >
      {/* Header inside stage on desktop */}
      {!isMobile && (
        <div style={{ padding: `0 ${gap.sm}px` }}>
          <GameHeader
            title="Mines"
            subtitle="Reveal or Ruin"
            backTo="lobby"
            howToPlay={
              <div style={{ padding: `${gap.md}px 0`, fontSize: ts('md'), color: theme.text.secondary, lineHeight: 1.6 }}>
                <b style={{ color: theme.text.primary }}>How to Play</b><br />
                1. Place a bet and choose how many mines to hide<br />
                2. Tap tiles to reveal gems — each gem increases your multiplier<br />
                3. Cash out anytime to lock your profit<br />
                4. Hit a mine and you lose your bet
              </div>
            }
          />
        </div>
      )}

      {/* 5x5 Grid — fills stage, centered vertically */}
      <div style={{
        flex: isMobile ? undefined : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: isMobile ? undefined : 0,
      }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: isMobile ? 5 : 10,
        width: isMobile ? '100%' : 'min(100%, calc(100vh - 200px))',
        aspectRatio: '1',
        margin: '0 auto',
      }}>
        {Array.from({ length: 25 }, (_, i) => {
          const x = i % 5;
          const y = Math.floor(i / 5);
          const revealed = revealedCells.find(c => c.x === x && c.y === y);
          const isMinePos = isGameOver && minePositions.some(m => m.x === x && m.y === y);
          const isRevealing = revealingTile === `${x}-${y}`;
          const wasHit = revealed && !revealed.safe;

          let tileStyle: CSSProperties = { ...baseTile };
          let content: React.ReactNode = null;

          if (wasHit) {
            tileStyle = {
              ...tileStyle,
              background: 'rgba(255, 51, 51, 0.18)',
              border: '1px solid rgba(255, 51, 51, 0.5)',
              boxShadow: '0 0 20px rgba(255, 51, 51, 0.25), inset 0 0 12px rgba(255, 51, 51, 0.1)',
              animation: 'mineHit 0.3s ease',
            };
            content = <MineIcon style={{ width: '58%', height: '58%', animation: 'gemReveal 0.3s ease-out' }} />;
          } else if (revealed && revealed.safe) {
            const tierColor = GEM_TIER_COLORS[revealed.gemTier] || GEM_TIER_COLORS.emerald;
            tileStyle = {
              ...tileStyle,
              background: `radial-gradient(circle at 50% 40%, ${tierColor}18 0%, ${theme.bg.tertiary} 80%)`,
              border: `1px solid ${tierColor}35`,
              boxShadow: `inset 0 0 16px ${tierColor}10, 0 0 8px ${tierColor}08`,
            };
            content = <GemIcon color={tierColor} style={{ width: '58%', height: '58%', animation: 'gemReveal 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />;
          } else if (isGameOver && isMinePos) {
            tileStyle = {
              ...tileStyle,
              background: 'rgba(255, 51, 51, 0.06)',
              border: '1px solid rgba(255, 51, 51, 0.12)',
              opacity: 0.55,
            };
            content = <MineIcon style={{ width: '58%', height: '58%', opacity: 0.5 }} />;
          } else if (isGameOver) {
            tileStyle = { ...tileStyle, opacity: 0.3 };
            content = <GemIcon style={{ width: '58%', height: '58%', opacity: 0.4 }} />;
          } else {
            tileStyle = {
              ...tileStyle,
              background: `linear-gradient(145deg, ${theme.bg.elevated} 0%, ${theme.bg.tertiary} 100%)`,
              cursor: phase === 'playing' && !revealingTile ? 'pointer' : 'default',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.3)',
            };
            if (isRevealing) {
              tileStyle = { ...tileStyle, transform: 'scale(0.93)', opacity: 0.6 };
            }
          }

          return (
            <div
              key={`${x}-${y}`}
              style={tileStyle}
              onClick={() => {
                if (phase === 'playing' && !revealed && !isRevealing) {
                  handleReveal(x, y);
                }
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
      </div>

      {/* Confetti layer */}
      <WinConfetti active={showResult && resultType === 'won'} zIndex={8} />

      {/* Result Overlay */}
      <ResultOverlay
        visible={showResult}
        variant={resultType === 'won' ? 'win' : 'loss'}
        actionsDelay={resultType === 'won' ? 1500 : 800}
        actions={isMobile ? (
          <>
            <button onClick={handlePlayAgain} style={btnPrimary}>
              Play Again
            </button>
            <button onClick={() => go('lobby')} style={btnGhost}>
              Lobby
            </button>
          </>
        ) : undefined}
      >
        {resultType === 'won' ? (
          <>
            <div style={{
              fontSize: ts('sm'),
              fontWeight: 600,
              color: theme.accent.neonGreen,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: gap.xs,
            }}>
              {resultMultiplier >= 50 ? 'MAX WIN' : 'CASHED OUT'}
            </div>
            <CountUpNumber
              value={resultMultiplier}
              from={1}
              duration={1000}
              decimals={2}
              suffix="x"
              style={{
                fontSize: ts('hero'),
                fontWeight: 800,
                color: theme.accent.neonGreen,
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: '0 0 24px rgba(0, 231, 1, 0.4)',
              }}
            />
            <CountUpNumber
              value={profit / 1e9}
              from={0}
              duration={1200}
              decimals={profit >= 1e9 ? 2 : 4}
              prefix="+"
              suffix={<> <SolIcon size="0.9em" /></>}
              style={{
                fontSize: ts('xl'),
                fontWeight: 700,
                color: theme.accent.neonGreen,
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: gap.xs,
              }}
            />
          </>
        ) : (
          <>
            <div style={{
              fontSize: ts('sm'),
              fontWeight: 600,
              color: theme.accent.red,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: gap.xs,
            }}>
              MINE HIT
            </div>
            <div style={{
              fontSize: ts('hero'),
              fontWeight: 800,
              color: theme.accent.red,
              fontFamily: "'JetBrains Mono', monospace",
              opacity: 0.8,
            }}>
              0.00x
            </div>
            <div style={{
              fontSize: ts('xl'),
              fontWeight: 700,
              color: theme.accent.red,
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: gap.xs,
              opacity: 0.7,
            }}>
              -{solFormat(game?.betAmount || 0)} <SolIcon size="0.9em" />
            </div>
          </>
        )}
      </ResultOverlay>
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = (
    <GameFooterBar>
      <RoundInfoFooter
        seedHash={game?.seedHash || resultSeed || undefined}
        showVerify={isGameOver}
      />
    </GameFooterBar>
  );

  /* ─── RENDER ─── */

  return (
    <>
      {/* Mobile header */}
      {isMobile && (
        <div style={{ padding: `${gap.sm}px 12px` }}>
          <GameHeader
            title="Mines"
            subtitle="Reveal or Ruin"
            backTo="lobby"
            howToPlay={
              <div style={{ padding: `${gap.md}px 0`, fontSize: ts('md'), color: theme.text.secondary, lineHeight: 1.6 }}>
                <b style={{ color: theme.text.primary }}>How to Play</b><br />
                1. Place a bet and choose how many mines to hide<br />
                2. Tap tiles to reveal gems — each gem increases your multiplier<br />
                3. Cash out anytime to lock your profit<br />
                4. Hit a mine and you lose your bet
              </div>
            }
          />
        </div>
      )}
      <CasinoGameLayout
        rail={railContent}
        stage={stageContent}
        footer={footerContent}
      />
    </>
  );
}

/* ─── INLINE SVG ICONS ─── */

function GemIcon({ color = '#10B981', style }: { color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" style={{ pointerEvents: 'none', ...style }}>
      <defs>
        <linearGradient id="gem-main" x1="16" y1="8" x2="48" y2="56">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="gem-shine" x1="20" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Main gem body */}
      <polygon points="32,4 56,22 48,58 16,58 8,22" fill="url(#gem-main)" />
      {/* Top facet */}
      <polygon points="32,4 56,22 32,28 8,22" fill={color} opacity="0.8" />
      {/* Left facet */}
      <polygon points="8,22 32,28 16,58" fill={color} opacity="0.4" />
      {/* Right facet */}
      <polygon points="56,22 32,28 48,58" fill={color} opacity="0.6" />
      {/* Center line */}
      <polygon points="32,28 16,58 48,58" fill={color} opacity="0.3" />
      {/* Shine overlay */}
      <polygon points="32,4 44,16 32,24 20,16" fill="url(#gem-shine)" />
      {/* Sparkle dot */}
      <circle cx="24" cy="16" r="2" fill="#fff" opacity="0.8" />
    </svg>
  );
}

function MineIcon({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" style={{ pointerEvents: 'none', ...style }}>
      <defs>
        <radialGradient id="mine-glow" cx="50%" cy="45%">
          <stop offset="0%" stopColor="#FF4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#991111" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      {/* Outer body */}
      <circle cx="32" cy="34" r="18" fill="url(#mine-glow)" stroke="#FF3333" strokeWidth="1.5" strokeOpacity="0.5" />
      {/* Inner core */}
      <circle cx="32" cy="34" r="10" fill="#CC2222" opacity="0.8" />
      {/* Spikes */}
      <line x1="32" y1="10" x2="32" y2="16" stroke="#FF4444" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32" y1="52" x2="32" y2="58" stroke="#FF4444" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="10" y1="34" x2="16" y2="34" stroke="#FF4444" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="48" y1="34" x2="54" y2="34" stroke="#FF4444" strokeWidth="2.5" strokeLinecap="round" />
      {/* Diagonal spikes */}
      <line x1="16" y1="18" x2="20" y2="22" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" />
      <line x1="48" y1="18" x2="44" y2="22" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="50" x2="20" y2="46" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" />
      <line x1="48" y1="50" x2="44" y2="46" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" />
      {/* Highlight */}
      <circle cx="27" cy="29" r="3" fill="#fff" opacity="0.25" />
    </svg>
  );
}

/* ─── SHARED TILE STYLES ─── */

const baseTile: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: theme.bg.tertiary,
  border: `1px solid ${theme.border.subtle}`,
  borderRadius: theme.radius.md,
  aspectRatio: '1',
  transition: 'all 0.15s ease',
  userSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  minHeight: 44,
};

const tileImg: CSSProperties = {
  width: '62%',
  height: '62%',
  objectFit: 'contain',
  pointerEvents: 'none',
};

/* ─── BUTTON STYLES ─── */

const cashoutActive: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
  color: theme.text.inverse,
  background: theme.gradient.neonGreen,
  border: 'none',
  borderRadius: theme.radius.lg,
  cursor: 'pointer',
  boxShadow: '0 0 24px rgba(0, 231, 1, 0.25), 0 4px 12px rgba(0, 231, 1, 0.15)',
  letterSpacing: '0.01em',
  transition: 'all 0.15s ease',
  minHeight: 48,
};

const cashoutDisabled: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: theme.text.muted,
  background: theme.bg.tertiary,
  border: `1px solid ${theme.border.subtle}`,
  borderRadius: theme.radius.lg,
  cursor: 'not-allowed',
  opacity: 0.6,
  minHeight: 48,
};

const btnPrimary: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: theme.text.inverse,
  background: theme.gradient.neonGreen,
  border: 'none',
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  minHeight: 44,
};

const btnGhost: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: theme.text.secondary,
  background: theme.bg.tertiary,
  border: `1px solid ${theme.border.medium}`,
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  minHeight: 44,
};

const pillDefault: CSSProperties = {
  flex: 1,
  padding: '10px 0',
  fontSize: 14,
  fontWeight: 600,
  color: theme.text.secondary,
  background: theme.bg.tertiary,
  border: `1px solid ${theme.border.subtle}`,
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s ease',
  minHeight: 44,
};

const pillActive: CSSProperties = {
  flex: 1,
  padding: '10px 0',
  fontSize: 14,
  fontWeight: 700,
  color: '#FFFFFF',
  background: theme.accent.purple,
  border: '1px solid transparent',
  borderRadius: theme.radius.md,
  cursor: 'pointer',
  textAlign: 'center',
  boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
  minHeight: 44,
};
