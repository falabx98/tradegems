import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { SolIcon } from '../ui/SolIcon';
import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ContentGame } from '../primitives/ContentContainer';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';

// ─── Types ───────────────────────────────────────────────────

interface BetEntry {
  id: number;
  feedType: string;
  game: string;
  username: string;
  betAmount: number;
  payout: number;
  multiplier: number;
  isWin: boolean;
  createdAt: string;
  direction?: string;
  riskTier?: string;
}

const GAME_LABELS: Record<string, string> = {
  solo_result: 'Solo',
  prediction_result: 'Predictions',
  rug_result: 'Rug Game',
  candleflip_result: 'Candleflip',
  mines_result: 'Mines',
  lottery_result: 'Lottery',
  trading_sim_result: 'Trading Sim',
};

const GAME_COLORS: Record<string, string> = {
  solo_result: theme.accent.purple,
  prediction_result: '#3B82F6',
  rug_result: '#F59E0B',
  candleflip_result: '#06B6D4',
  mines_result: '#10B981',
  lottery_result: '#EAB308',
  trading_sim_result: '#22D3EE',
};

function parseFeedEntry(item: any): BetEntry {
  const p = item.payload || {};
  return {
    id: item.id,
    feedType: item.feedType,
    game: GAME_LABELS[item.feedType] || item.feedType,
    username: p.username || 'Player',
    betAmount: p.betAmount || 0,
    payout: p.payout || 0,
    multiplier: p.multiplier || 0,
    isWin: p.resultType === 'win' || p.result === 'win' || (p.payout > p.betAmount),
    createdAt: item.createdAt,
    direction: p.direction,
    riskTier: p.riskTier,
  };
}

// ─── Filters ─────────────────────────────────────────────────

type GameFilter = 'all' | string;
type ResultFilter = 'all' | 'win' | 'loss';

// ─── Main Screen ─────────────────────────────────────────────

export function HistoryScreen() {
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.userId);
  const profile = useGameStore((s) => s.profile);

  const [allBets, setAllBets] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  useEffect(() => {
    loadBets();
  }, []);

  async function loadBets() {
    setLoading(true);
    try {
      const res = await api.getActivityFeed(100);
      const items = (res.data || [])
        .filter((item: any) => item.userId === userId)
        .map(parseFeedEntry);
      setAllBets(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Apply filters
  const filtered = allBets.filter(bet => {
    if (gameFilter !== 'all' && bet.feedType !== gameFilter) return false;
    if (resultFilter === 'win' && !bet.isWin) return false;
    if (resultFilter === 'loss' && bet.isWin) return false;
    return true;
  });

  // Stats
  const totalWagered = allBets.reduce((s, b) => s + b.betAmount, 0);
  const totalProfit = allBets.reduce((s, b) => s + (b.isWin ? b.payout - b.betAmount : -b.betAmount), 0);
  const winCount = allBets.filter(b => b.isWin).length;
  const winRate = allBets.length > 0 ? Math.round((winCount / allBets.length) * 100) : 0;
  const bestWin = allBets.filter(b => b.isWin).reduce((best, b) => Math.max(best, b.multiplier), 0);

  // Available game types from actual data
  const availableGames = [...new Set(allBets.map(b => b.feedType))];

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  return (
    <ContentGame style={{ display: 'flex', flexDirection: 'column', gap: gap.lg, paddingTop: gap.md, paddingBottom: gap.xl }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: ts('lg'), fontWeight: 700, color: theme.text.primary, margin: 0 }}>
          My Bets
        </h2>
        <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
          Your betting history across all games
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: gap.sm,
      }}>
        <StatCard label="Total Wagered" value={<>{formatSol(totalWagered)} <SolIcon size="0.85em" /></>} />
        <StatCard
          label="Net Profit"
          value={<>{totalProfit >= 0 ? '+' : ''}{formatSol(Math.abs(totalProfit))} <SolIcon size="0.85em" /></>}
          color={totalProfit >= 0 ? theme.accent.neonGreen : theme.accent.red}
        />
        <StatCard label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? theme.accent.neonGreen : theme.text.secondary} />
        <StatCard label="Best Win" value={bestWin > 0 ? `${bestWin.toFixed(2)}x` : '—'} color={theme.accent.amber} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: gap.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Game filter */}
        <div style={filterGroup}>
          <FilterPill active={gameFilter === 'all'} onClick={() => setGameFilter('all')}>All Games</FilterPill>
          {availableGames.map(g => (
            <FilterPill key={g} active={gameFilter === g} onClick={() => setGameFilter(g)} color={GAME_COLORS[g]}>
              {GAME_LABELS[g] || g}
            </FilterPill>
          ))}
        </div>
        {/* Result filter */}
        <div style={{ ...filterGroup, marginLeft: isMobile ? 0 : 'auto' }}>
          <FilterPill active={resultFilter === 'all'} onClick={() => setResultFilter('all')}>All</FilterPill>
          <FilterPill active={resultFilter === 'win'} onClick={() => setResultFilter('win')} color={theme.accent.neonGreen}>Wins</FilterPill>
          <FilterPill active={resultFilter === 'loss'} onClick={() => setResultFilter('loss')} color={theme.accent.red}>Losses</FilterPill>
        </div>
      </div>

      {/* Bets List */}
      <div style={{
        background: theme.bg.secondary,
        border: `1px solid ${theme.border.subtle}`,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: gap.lg }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 48, marginBottom: gap.sm,
                background: theme.bg.tertiary,
                borderRadius: theme.radius.md,
                animation: 'pulse 1.5s infinite',
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: `${gap.xl * 2}px ${gap.lg}px`, textAlign: 'center' }}>
            <Icon name="dice" size={32} style={{ color: theme.text.disabled, marginBottom: gap.sm, opacity: 0.5 }} />
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.secondary }}>
              {allBets.length === 0 ? 'No bets yet' : 'No matching bets'}
            </div>
            <div style={{ fontSize: ts('sm'), color: theme.text.muted, marginTop: gap.xs }}>
              {allBets.length === 0 ? 'Play any game to see your history here' : 'Try changing your filters'}
            </div>
          </div>
        ) : (
          filtered.map((bet) => {
            const gameColor = GAME_COLORS[bet.feedType] || theme.accent.purple;
            const profit = bet.isWin ? bet.payout - bet.betAmount : -bet.betAmount;
            const timeAgo = getTimeAgo(bet.createdAt);

            return (
              <div key={bet.id} style={betRow}>
                {/* Left: Game + amount */}
                <div style={{ display: 'flex', alignItems: 'center', gap: gap.sm, flex: 1, minWidth: 0 }}>
                  <Badge
                    variant="default"
                    size="sm"
                    style={{
                      background: `${gameColor}15`,
                      color: gameColor,
                      borderColor: `${gameColor}30`,
                      flexShrink: 0,
                      fontSize: 10,
                    }}
                  >
                    {bet.game}
                  </Badge>
                  <span className="mono" style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.text.secondary, flexShrink: 0 }}>
                    {formatSol(bet.betAmount)} <SolIcon size="0.85em" />
                  </span>
                  {bet.multiplier > 0 && (
                    <span className="mono" style={{
                      fontSize: ts('xs'),
                      fontWeight: 700,
                      color: bet.isWin ? theme.accent.neonGreen : theme.text.muted,
                    }}>
                      {bet.multiplier.toFixed(2)}x
                    </span>
                  )}
                </div>

                {/* Right: Result + time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: gap.sm, flexShrink: 0 }}>
                  <span className="mono" style={{
                    fontSize: ts('sm'),
                    fontWeight: 700,
                    color: bet.isWin ? theme.accent.neonGreen : theme.accent.red,
                  }}>
                    {profit >= 0 ? '+' : ''}{formatSol(Math.abs(profit))} <SolIcon size="0.85em" />
                  </span>
                  <span style={{ fontSize: ts('xs'), color: theme.text.muted, minWidth: 40, textAlign: 'right' }}>
                    {timeAgo}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <div style={{ fontSize: ts('xs'), color: theme.text.muted, textAlign: 'center' }}>
          Showing {filtered.length} of {allBets.length} bets
        </div>
      )}
    </ContentGame>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{
      background: theme.bg.secondary,
      border: `1px solid ${theme.border.subtle}`,
      borderRadius: theme.radius.lg,
      padding: `${theme.gap.md}px`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: color || theme.text.primary, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function FilterPill({ children, active, onClick, color }: {
  children: React.ReactNode; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px',
      fontSize: 11,
      fontWeight: 600,
      borderRadius: theme.radius.full,
      border: `1px solid ${active ? (color || theme.accent.purple) + '44' : theme.border.subtle}`,
      background: active ? (color || theme.accent.purple) + '15' : 'transparent',
      color: active ? (color || theme.accent.purple) : theme.text.muted,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ─── Styles ──────────────────────────────────────────────────

const betRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${theme.gap.sm}px ${theme.gap.md}px`,
  borderBottom: `1px solid ${theme.border.subtle}`,
  minHeight: 44,
  transition: 'background 0.1s ease',
};

const filterGroup: CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};
