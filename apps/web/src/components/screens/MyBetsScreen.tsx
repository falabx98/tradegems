import { useEffect, useState, type CSSProperties } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { SolIcon } from '../ui/SolIcon';
import { ContentGame } from '../primitives/ContentContainer';
import { SectionState } from '../primitives/SectionState';
import { getAvatarGradient, getInitials } from '../../utils/avatars';

// ─── Game label + color map ─────────────────────────────────

const GAME_MAP: Record<string, { label: string; color: string; route: string }> = {
  prediction_result: { label: 'Predictions', color: '#3B82F6', route: 'prediction' },
  solo_result:       { label: 'Solo',        color: '#8B5CF6', route: 'setup' },
  rug_result:        { label: 'Rug Game',    color: '#F59E0B', route: 'rug-game' },
  candleflip_result: { label: 'Candleflip',  color: '#06B6D4', route: 'candleflip' },
  mines_result:      { label: 'Mines',       color: '#10B981', route: 'mines' },
  lottery_result:    { label: 'Lottery',      color: '#EAB308', route: 'lottery' },
  trading_sim_result:{ label: 'Trading Sim',  color: '#0D9488', route: 'trading-sim' },
  tournament_result: { label: 'Tournament',   color: '#8B5CF6', route: 'trading-sim' },
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Games' },
  { key: 'prediction_result', label: 'Predictions' },
  { key: 'solo_result', label: 'Solo' },
  { key: 'rug_result', label: 'Rug Game' },
  { key: 'candleflip_result', label: 'Candleflip' },
  { key: 'mines_result', label: 'Mines' },
  { key: 'lottery_result', label: 'Lottery' },
  { key: 'trading_sim_result', label: 'Trading Sim' },
];

// ─── Component ──────────────────────────────────────────────

export function MyBetsScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();
  const { isAuthenticated } = useAuthStore();
  const { profile } = useGameStore();
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  const loadBets = () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    const gameFilter = filter === 'all' ? undefined : filter;
    api.getMyBets(50, gameFilter)
      .then(res => setBets(res.data || []))
      .catch(() => setError('Could not load your bets'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBets(); }, [isAuthenticated, filter]);

  // Stats summary
  const totalBets = bets.length;
  const wins = bets.filter(b => (b.payload?.payout || 0) > (b.payload?.betAmount || 0));
  const totalWagered = bets.reduce((sum, b) => sum + (b.payload?.betAmount || 0), 0);
  const totalPnl = bets.reduce((sum, b) => sum + ((b.payload?.payout || 0) - (b.payload?.betAmount || 0)), 0);
  const winRate = totalBets > 0 ? Math.round((wins.length / totalBets) * 100) : 0;

  if (!isAuthenticated) {
    return (
      <ContentGame style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: gap.lg }}>
        <div style={{ fontSize: ts('lg'), fontWeight: 700, color: theme.text.primary }}>Sign in to see your bets</div>
        <button onClick={() => go('auth')} style={ctaBtn}>Sign In</button>
      </ContentGame>
    );
  }

  return (
    <ContentGame style={{ display: 'flex', flexDirection: 'column', gap: gap.lg, paddingTop: gap.md, paddingBottom: gap.xl }}>

      {/* ─── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: gap.md }}>
        <button onClick={() => go('lobby')} style={backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={{ fontSize: ts('lg'), fontWeight: 700, color: theme.text.primary }}>My Bets</div>
          <div style={{ fontSize: ts('xs'), color: theme.text.muted }}>Your recent betting activity</div>
        </div>
      </div>

      {/* ─── Stats Summary ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: gap.sm,
      }}>
        <div style={statCard}>
          <div style={{ fontSize: ts('xs'), color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Bets</div>
          <div className="mono" style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.text.primary }}>{totalBets}</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: ts('xs'), color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Win Rate</div>
          <div className="mono" style={{ fontSize: ts('xl'), fontWeight: 700, color: winRate >= 50 ? theme.accent.neonGreen : theme.accent.red }}>{winRate}%</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: ts('xs'), color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wagered</div>
          <div className="mono" style={{ fontSize: ts('xl'), fontWeight: 700, color: theme.text.primary }}>{formatSol(totalWagered)} <SolIcon size="0.8em" /></div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: ts('xs'), color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>P&L</div>
          <div className="mono" style={{ fontSize: ts('xl'), fontWeight: 700, color: totalPnl >= 0 ? theme.accent.neonGreen : theme.accent.red }}>
            {totalPnl >= 0 ? '+' : ''}{formatSol(totalPnl)} <SolIcon size="0.8em" />
          </div>
        </div>
      </div>

      {/* ─── Filter Tabs ─── */}
      <div style={{
        display: 'flex',
        gap: gap.xs,
        overflowX: 'auto',
        scrollbarWidth: 'none' as any,
        padding: '2px 0',
      }}>
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...filterTab,
              background: filter === f.key ? theme.accent.purple : 'transparent',
              color: filter === f.key ? '#fff' : theme.text.muted,
              borderColor: filter === f.key ? theme.accent.purple : theme.border.subtle,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ─── Bet List ─── */}
      <SectionState
        loading={loading}
        error={error}
        empty={!loading && !error && bets.length === 0}
        onRetry={loadBets}
        skeletonRows={5}
        emptyIcon=""
        emptyTitle={filter === 'all' ? 'No bets yet' : 'No bets for this game'}
        emptySubtitle="Play a game to see your history here"
      >
      {bets.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          background: theme.bg.secondary,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.border.subtle}`,
          overflow: 'hidden',
        }}>
          {bets.map((bet, i) => {
            const p = bet.payload || {};
            const game = GAME_MAP[bet.feedType] || { label: 'Game', color: '#888', route: 'lobby' };
            const isWin = (p.payout || 0) > (p.betAmount || 0);
            const profit = (p.payout || 0) - (p.betAmount || 0);
            const multiplier = Number(p.multiplier) || 0;
            const timeAgo = getTimeAgo(bet.createdAt);

            return (
              <div key={bet.id} style={{
                ...betRow,
                borderTop: i > 0 ? `1px solid ${theme.border.subtle}` : 'none',
              }}>
                {/* Left: game badge + details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: gap.sm, flex: 1, minWidth: 0 }}>
                  <span style={{
                    ...gameBadge,
                    background: `${game.color}18`,
                    color: game.color,
                    borderColor: `${game.color}30`,
                  }}>
                    {game.label}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: ts('sm'), fontWeight: 600, color: theme.text.secondary }}>
                      {formatSol(p.betAmount || 0)} <SolIcon size="0.8em" />
                    </span>
                    <span style={{ fontSize: 10, color: theme.text.muted }}>{timeAgo}</span>
                  </div>
                </div>

                {/* Right: result */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {multiplier > 0 && (
                    <div className="mono" style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, marginBottom: 1 }}>
                      {multiplier.toFixed(2)}x
                    </div>
                  )}
                  <div className="mono" style={{
                    fontSize: ts('sm'),
                    fontWeight: 700,
                    color: isWin ? theme.accent.neonGreen : theme.accent.red,
                  }}>
                    {isWin ? '+' : ''}{formatSol(profit)} <SolIcon size="0.8em" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </SectionState>
    </ContentGame>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Styles ─────────────────────────────────────────────────

const statCard: CSSProperties = {
  padding: `${theme.gap.md}px`,
  background: theme.bg.secondary,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.border.subtle}`,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.gap.xs,
};

const filterTab: CSSProperties = {
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid',
  borderRadius: 20,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  transition: 'all 0.15s ease',
  fontFamily: 'inherit',
};

const betRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${theme.gap.md}px`,
  gap: theme.gap.md,
};

const gameBadge: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 700,
  border: '1px solid',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  letterSpacing: '0.02em',
};

const backBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: theme.radius.md,
  background: theme.bg.secondary,
  border: `1px solid ${theme.border.subtle}`,
  color: theme.text.secondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

const ctaBtn: CSSProperties = {
  padding: '12px 32px',
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  background: theme.accent.purple,
  border: 'none',
  borderRadius: theme.radius.lg,
  cursor: 'pointer',
};
