import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { api } from '../../utils/api';

// ─── Mini Bar Chart (canvas) ─────────────────────────────────────────────────

function MiniBarChart({ data, color, label }: {
  data: number[]; color: string; label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...data, 1);
    const barW = Math.max(4, (w - (data.length - 1) * 2) / data.length);
    const gap = 2;

    data.forEach((v, i) => {
      const barH = (v / max) * (h - 4);
      const x = i * (barW + gap);
      const y = h - barH;

      ctx.fillStyle = `${color}40`;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();

      // Top highlight
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, Math.min(barH, 3), 2);
      ctx.fill();
    });
  }, [data, color]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{
        fontSize: '11px', fontWeight: 600, color: theme.text.muted,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{label}</span>
      <canvas ref={ref} style={{ width: '100%', height: '60px' }} />
    </div>
  );
}

// ─── Win Rate Ring ───────────────────────────────────────────────────────────

function WinRateRing({ rate }: { rate: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 100;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2);

    const cx = size / 2, cy = size / 2, r = 38;

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(153, 69, 255, 0.1)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Progress ring
    const angle = rate * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, angle);
    ctx.strokeStyle = rate >= 0.5 ? '#34d399' : '#f87171';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center text
    ctx.fillStyle = theme.text.primary;
    ctx.font = "bold 20px 'JetBrains Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(rate * 100).toFixed(0)}%`, cx, cy - 4);

    ctx.fillStyle = theme.text.muted;
    ctx.font = "600 10px 'Rajdhani', sans-serif";
    ctx.fillText('WIN RATE', cx, cy + 14);
  }, [rate]);

  return <canvas ref={ref} style={{ width: '100px', height: '100px' }} />;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, sub }: {
  label: string; value: string; accent: string; icon?: boolean; sub?: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
      padding: '14px', borderRadius: '12px',
      background: `${accent}06`, border: `1px solid ${accent}15`,
    }}>
      <span style={{
        fontSize: '12px', fontWeight: 600, color: theme.text.muted,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{label}</span>
      <span style={{
        fontSize: '22px', fontWeight: 800, color: accent,
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex', alignItems: 'center',
      }}>
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '22px', height: '22px', marginRight: '4px' }} />}
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: '12px', color: theme.text.muted }}>{sub}</span>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  finalMultiplier: string;
  payoutAmount: number;
  resultType: string;
  nodesHit: number;
  nodesMissed: number;
  xpAwarded: number;
  betAmount?: number;
  createdAt: string;
}

export function StatsScreen() {
  const isMobile = useIsMobile();
  const profile = useGameStore((s) => s.profile);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getRoundHistory(50) as any;
        setHistory(res.data || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Compute derived stats
  const wins = history.filter((h) => h.resultType === 'win').length;
  const losses = history.filter((h) => h.resultType === 'loss').length;
  const totalPayout = history.reduce((sum, h) => sum + (h.payoutAmount || 0), 0);
  const avgMult = history.length > 0
    ? history.reduce((sum, h) => sum + parseFloat(h.finalMultiplier || '1'), 0) / history.length
    : 0;

  // Build chart data from recent history (last 20 rounds)
  const recentMultipliers = history.slice(0, 20).map((h) => parseFloat(h.finalMultiplier || '1')).reverse();
  const recentNodes = history.slice(0, 20).map((h) => h.nodesHit).reverse();
  const recentXP = history.slice(0, 20).map((h) => h.xpAwarded).reverse();

  // Streak calculation
  let currentStreak = 0;
  let streakType: 'win' | 'loss' | null = null;
  for (const h of history) {
    if (!streakType) {
      streakType = h.resultType === 'win' ? 'win' : 'loss';
      currentStreak = 1;
    } else if ((h.resultType === 'win' && streakType === 'win') || (h.resultType === 'loss' && streakType === 'loss')) {
      currentStreak++;
    } else {
      break;
    }
  }

  const xpPercent = profile.xpToNext > 0 ? (profile.xp / profile.xpToNext) * 100 : 0;

  return (
    <div style={{
      ...s.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      <div style={s.header}>
        <h2 style={s.title}>Player Stats</h2>
        <div style={s.levelBadge}>
          <span style={s.levelLabel}>LVL</span>
          <span style={s.levelValue} className="mono">{profile.level}</span>
        </div>
      </div>

      {/* Top row: Win Rate + Key Stats */}
      <div style={{
        ...s.topRow,
        ...(isMobile ? { flexDirection: 'column' as const } : {}),
      }}>
        {/* Win Rate Ring */}
        <div style={s.ringCard}>
          <WinRateRing rate={profile.winRate} />
          <div style={s.ringMeta}>
            <div style={s.ringRow}>
              <span style={{ ...s.ringDot, background: '#34d399' }} />
              <span style={s.ringLabel}>Wins</span>
              <span style={{ ...s.ringValue, color: '#34d399' }} className="mono">{wins}</span>
            </div>
            <div style={s.ringRow}>
              <span style={{ ...s.ringDot, background: '#f87171' }} />
              <span style={s.ringLabel}>Losses</span>
              <span style={{ ...s.ringValue, color: '#f87171' }} className="mono">{losses}</span>
            </div>
            <div style={s.ringRow}>
              <span style={{ ...s.ringDot, background: '#9945FF' }} />
              <span style={s.ringLabel}>Streak</span>
              <span style={{
                ...s.ringValue,
                color: streakType === 'win' ? '#34d399' : streakType === 'loss' ? '#f87171' : theme.text.muted,
              }} className="mono">
                {currentStreak > 0 ? `${currentStreak}${streakType === 'win' ? 'W' : 'L'}` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Key stats grid */}
        <div style={s.statsGrid}>
          <StatCard label="Rounds" value={`${profile.roundsPlayed}`} accent="#c084fc" />
          <StatCard label="Wagered" value={formatSol(profile.totalWagered)} accent="#9945FF" icon sub="SOL" />
          <StatCard label="Won" value={formatSol(profile.totalWon)} accent="#34d399" icon sub="SOL" />
          <StatCard label="Best Multi" value={`${profile.bestMultiplier.toFixed(2)}x`} accent="#fbbf24" />
          <StatCard label="Avg Multi" value={avgMult > 0 ? `${avgMult.toFixed(2)}x` : '—'} accent="#5b8def" />
          <StatCard label="Balance" value={formatSol(profile.balance)} accent="#c084fc" icon sub="SOL" />
        </div>
      </div>

      {/* XP Progress */}
      <div style={s.xpSection}>
        <div style={s.xpHeader}>
          <span style={s.xpTitle}>Experience</span>
          <span style={s.xpVip} className="mono">
            VIP: <span style={{
              color: theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary,
              fontWeight: 800,
            }}>{profile.vipTier}</span>
          </span>
        </div>
        <div style={s.xpTrack}>
          <div style={{ ...s.xpFill, width: `${xpPercent}%` }} />
        </div>
        <div style={s.xpMeta}>
          <span className="mono" style={{ fontSize: '12px', color: theme.text.muted }}>
            {profile.xp} / {profile.xpToNext} XP
          </span>
          <span className="mono" style={{ fontSize: '12px', color: '#c084fc' }}>
            {xpPercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Charts Row */}
      {!loading && history.length > 0 && (
        <div style={{
          ...s.chartsRow,
          ...(isMobile ? { gridTemplateColumns: '1fr' } : {}),
        }}>
          <div style={s.chartCard}>
            <MiniBarChart data={recentMultipliers} color="#9945FF" label="Recent Multipliers (last 20)" />
          </div>
          <div style={s.chartCard}>
            <MiniBarChart data={recentNodes} color="#34d399" label="Nodes Hit (last 20)" />
          </div>
          <div style={s.chartCard}>
            <MiniBarChart data={recentXP} color="#fbbf24" label="XP Earned (last 20)" />
          </div>
        </div>
      )}

      {loading && (
        <div style={s.loadingWrap}>
          <div style={s.skeleton} />
          <div style={{ ...s.skeleton, width: '70%' }} />
          <div style={{ ...s.skeleton, width: '85%' }} />
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
    margin: 0,
    letterSpacing: '0.5px',
  },
  levelBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(153, 69, 255, 0.1)',
    border: `1px solid ${theme.border.subtle}`,
  },
  levelLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    letterSpacing: '1px',
  },
  levelValue: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#c084fc',
  },

  // Top Row
  topRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'stretch',
  },
  ringCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '14px',
    flexShrink: 0,
  },
  ringMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ringRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  ringDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  ringLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    width: '50px',
  },
  ringValue: {
    fontSize: '15px',
    fontWeight: 700,
  },

  // Stats Grid
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    flex: 1,
  },

  // XP Section
  xpSection: {
    padding: '16px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
  },
  xpHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  xpTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  xpVip: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  xpTrack: {
    height: '6px',
    background: theme.bg.primary,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #9945FF, #c084fc)',
    borderRadius: '3px',
    transition: 'width 1s ease',
  },
  xpMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '6px',
  },

  // Charts
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  chartCard: {
    padding: '14px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
  },

  // Loading
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '20px',
  },
  skeleton: {
    height: '16px',
    borderRadius: '4px',
    background: 'rgba(153, 69, 255, 0.08)',
    animation: 'pulse 1.5s infinite',
  },
};
