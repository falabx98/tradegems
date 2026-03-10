import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { theme } from '../../styles/theme';
import { RiskTier } from '../../types/game';
import { generateChartPath } from '../../engine/chartGenerator';
import { SeededRandom } from '../../engine/seededRandom';
import { api } from '../../utils/api';
import { formatSol, lamportsToSol, solToLamports } from '../../utils/sol';

const BET_OPTIONS = [
  { label: '0.01', lamports: 10_000_000 },
  { label: '0.05', lamports: 50_000_000 },
  { label: '0.1',  lamports: 100_000_000 },
  { label: '0.25', lamports: 250_000_000 },
  { label: '0.5',  lamports: 500_000_000 },
  { label: '1',    lamports: 1_000_000_000 },
  { label: '2',    lamports: 2_000_000_000 },
  { label: '5',    lamports: 5_000_000_000 },
];

const RISK_OPTIONS: { tier: RiskTier; label: string; tag: string; color: string }[] = [
  { tier: 'conservative', label: 'Conservative', tag: '0.80x gain · 0.85x loss', color: theme.success },
  { tier: 'balanced', label: 'Balanced', tag: '1.0x gain · 1.0x loss', color: theme.warning },
  { tier: 'aggressive', label: 'Aggressive', tag: '1.25x gain · 1.40x loss', color: theme.danger },
];

interface FeedItem {
  user: string;
  mult: string;
  amount: string;
  win: boolean;
  time: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function LobbyScreen() {
  const { mode, setMode, betAmount, setBetAmount, riskTier, setRiskTier, startRound, profile, syncProfile } = useGameStore();
  const [crediting, setCrediting] = useState(false);
  const [activityFeed, setActivityFeed] = useState<FeedItem[]>([]);
  const [liveStats, setLiveStats] = useState({ active: 0, volume: '0', topWin: '1.0x' });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getLeaderboard('profit', 'daily') as any;
        const data = res.data || [];
        const feed: FeedItem[] = data.slice(0, 7).map((entry: any) => {
          const score = Number(entry.score || 0);
          const isWin = score > 0;
          return {
            user: entry.username || 'anon',
            mult: `${(score / 10000).toFixed(1)}x`,
            amount: `${isWin ? '+' : ''}${formatSol(score)} SOL`,
            win: isWin,
            time: 'today',
          };
        });
        if (feed.length > 0) setActivityFeed(feed);

        const topScore = data.reduce((max: number, e: any) => Math.max(max, Number(e.score || 0)), 0);
        const totalVol = data.reduce((sum: number, e: any) => sum + Number(e.score || 0), 0);
        setLiveStats({
          active: data.length,
          volume: `${formatSol(totalVol)}`,
          topWin: `${(topScore / 10000).toFixed(1)}x`,
        });
      } catch {
        // Keep defaults
      }
    })();
  }, []);

  const handleGetCredits = async () => {
    setCrediting(true);
    try {
      await api.devCredit(2_000_000_000);
      await syncProfile();
    } catch (err) {
      console.error('Failed to credit:', err);
    }
    setCrediting(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.columns}>
        {/* Left column: Configuration */}
        <div style={styles.leftCol}>
          <ChartPreview />

          {/* Mode */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Mode</span>
            </div>
            <div style={styles.modeRow}>
              <button
                onClick={() => setMode('solo')}
                style={{
                  ...styles.modeBtn,
                  ...(mode === 'solo' ? styles.modeBtnActive : {}),
                }}
              >
                Solo
              </button>
              <button
                onClick={() => setMode('battle')}
                style={{
                  ...styles.modeBtn,
                  ...(mode === 'battle' ? styles.modeBtnActive : {}),
                }}
              >
                Battle
              </button>
            </div>
          </div>

          {/* Position size */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Position size</span>
              <span style={styles.panelValue} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', marginRight: '5px', verticalAlign: 'middle' }} />
                {formatSol(betAmount)}
              </span>
            </div>
            <div style={styles.betGrid}>
              {BET_OPTIONS.map((opt) => (
                <button
                  key={opt.lamports}
                  onClick={() => setBetAmount(opt.lamports)}
                  disabled={opt.lamports > profile.balance}
                  style={{
                    ...styles.betChip,
                    ...(betAmount === opt.lamports ? styles.betChipActive : {}),
                    opacity: opt.lamports > profile.balance ? 0.25 : 1,
                  }}
                  className="mono"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Risk */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Risk</span>
            </div>
            <div style={styles.riskGrid}>
              {RISK_OPTIONS.map(({ tier, label, tag, color }) => (
                <button
                  key={tier}
                  onClick={() => setRiskTier(tier)}
                  style={{
                    ...styles.riskCard,
                    ...(riskTier === tier ? {
                      border: `1px solid ${color}40`,
                      background: `${color}08`,
                    } : {}),
                  }}
                >
                  <div style={{
                    ...styles.riskIndicator,
                    background: riskTier === tier ? color : theme.text.muted,
                  }} />
                  <div style={styles.riskInfo}>
                    <span style={{
                      ...styles.riskLabel,
                      color: riskTier === tier ? color : theme.text.secondary,
                    }}>{label}</span>
                    <span style={styles.riskTag} className="mono">{tag}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Start Round Button */}
          <button
            onClick={startRound}
            disabled={betAmount > profile.balance}
            style={{
              ...styles.executeBtn,
              opacity: betAmount > profile.balance ? 0.4 : 1,
            }}
          >
            <span style={styles.executeBtnText}>
              {mode === 'solo' ? 'Start Round' : 'Find Battle'}
            </span>
            <span style={styles.executeBtnSub} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />
              {formatSol(betAmount)} · {riskTier}
            </span>
          </button>
        </div>

        {/* Right column: Activity & Stats */}
        <div style={styles.rightCol}>
          {/* Stats */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Stats</span>
            </div>
            <div style={styles.statsBody}>
              <StatRow label="Balance" value={`${formatSol(profile.balance)} SOL`} color="#c084fc" icon />
              {profile.balance < 5 && (
                <button
                  onClick={handleGetCredits}
                  disabled={crediting}
                  style={styles.creditBtn}
                >
                  {crediting ? 'Crediting...' : 'Get 2 SOL dev credits'}
                </button>
              )}
              <StatRow label="Level" value={`${profile.level}`} />
              <StatRow label="VIP" value={profile.vipTier} color={theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary} />
              <StatRow label="Rounds" value={`${profile.roundsPlayed}`} />
              <StatRow label="Best" value={`${profile.bestMultiplier.toFixed(1)}x`} color={theme.game.multiplier} />
              <StatRow label="XP" value={`${profile.xp}/${profile.xpToNext}`} color={theme.accent.purple} />
              <div style={styles.xpBarContainer}>
                <div style={{
                  ...styles.xpBar,
                  width: `${(profile.xp / profile.xpToNext) * 100}%`,
                }} />
              </div>
            </div>
          </div>

          {/* Recent plays */}
          <div style={{ ...styles.panel, flex: 1 }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Recent plays</span>
              <span style={styles.liveBadge}>LIVE</span>
            </div>
            <div style={styles.feedList}>
              {(activityFeed.length > 0 ? activityFeed : [
                { user: 'waiting...', mult: '—', amount: '—', win: true, time: '' },
              ]).map((item, i) => (
                <div key={i} style={styles.feedRow}>
                  <span style={styles.feedUser}>{item.user}</span>
                  <span style={{
                    ...styles.feedMult,
                    color: item.win ? theme.game.multiplier : theme.game.divider,
                  }} className="mono">
                    {item.mult}
                  </span>
                  <span style={{
                    ...styles.feedAmount,
                    color: item.win ? theme.game.multiplier : theme.game.divider,
                  }} className="mono">
                    {item.amount}
                  </span>
                  <span style={styles.feedTime}>{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div style={styles.quickStats}>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>Players</span>
              <span style={styles.quickStatValue} className="mono">{liveStats.active}</span>
            </div>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>24h vol</span>
              <span style={styles.quickStatValue} className="mono">
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />
                {liveStats.volume}
              </span>
            </div>
            <div style={styles.quickStatItem}>
              <span style={styles.quickStatLabel}>Top win</span>
              <span style={styles.quickStatValue} className="mono">{liveStats.topWin}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function StatRow({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: boolean }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color || theme.text.primary }} className="mono">
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />}
        {value}
      </span>
    </div>
  );
}

function ChartPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    const rng = new SeededRandom(String(Date.now() % 10000));
    const path = generateChartPath(rng);

    // Background
    ctx.fillStyle = theme.bg.primary;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Chart fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(153, 69, 255, 0.06)');
    gradient.addColorStop(1, 'rgba(153, 69, 255, 0.0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < path.points.length; i++) {
      const x = (i / path.points.length) * w;
      const y = h - (path.points[i].price * h);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Chart line with blue→purple gradient
    const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
    lineGrad.addColorStop(0, '#9945FF');
    lineGrad.addColorStop(0.5, '#8b7bff');
    lineGrad.addColorStop(1, '#9945FF');

    ctx.beginPath();
    for (let i = 0; i < path.points.length; i++) {
      const x = (i / path.points.length) * w;
      const y = h - (path.points[i].price * h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Overlay text
    ctx.fillStyle = 'rgba(153, 69, 255, 0.1)';
    ctx.font = 'bold 40px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PREVIEW', w / 2, h / 2 + 14);
  }, []);

  return (
    <div style={styles.chartPreview}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', borderRadius: '8px' }}
      />
      <div style={styles.chartOverlay}>
        <span style={styles.chartOverlayText}>Next round preview</span>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '16px',
    flex: 1,
    minHeight: 0,
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Chart Preview
  chartPreview: {
    position: 'relative',
    height: '180px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: `1px solid ${theme.border.subtle}`,
  },
  chartOverlay: {
    position: 'absolute',
    bottom: '8px',
    left: '10px',
  },
  chartOverlayText: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },

  // Panels
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    flex: 1,
  },
  panelValue: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },

  // Mode Toggle
  modeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1px',
    background: theme.border.subtle,
  },
  modeBtn: {
    padding: '12px',
    background: theme.bg.secondary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    transition: 'all 0.15s ease',
  },
  modeBtnActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.08)',
  },

  // Bet Grid
  betGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: theme.border.subtle,
  },
  betChip: {
    padding: '10px 4px',
    background: theme.bg.secondary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'all 0.12s ease',
    textAlign: 'center',
  },
  betChipActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.08)',
  },

  // Risk Profile
  riskGrid: {
    display: 'flex',
    flexDirection: 'column',
  },
  riskCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    transition: 'all 0.15s ease',
    textAlign: 'left',
  },
  riskIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
  riskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  riskLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
  },
  riskTag: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.muted,
  },

  // Execute Button
  executeBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '14px 24px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  executeBtnText: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  },
  executeBtnSub: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
  },

  // Stats
  statsBody: {
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  statValue: {
    fontSize: '13px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
  creditBtn: {
    padding: '6px 12px',
    background: 'rgba(153, 69, 255, 0.08)',
    border: `1px solid rgba(153, 69, 255, 0.15)`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 600,
    color: '#c084fc',
    marginTop: '2px',
  },
  xpBarContainer: {
    height: '3px',
    background: theme.bg.tertiary,
    borderRadius: '2px',
    marginTop: '4px',
    overflow: 'hidden',
  },
  xpBar: {
    height: '100%',
    background: '#9945FF',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },

  // Live Feed
  liveBadge: {
    fontSize: '9px',
    fontWeight: 600,
    color: theme.success,
    padding: '2px 6px',
    background: `${theme.success}15`,
    borderRadius: '4px',
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
  },
  feedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  feedUser: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.secondary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  feedMult: {
    fontSize: '12px',
    fontWeight: 700,
    minWidth: '38px',
    textAlign: 'right',
  },
  feedAmount: {
    fontSize: '12px',
    fontWeight: 600,
    minWidth: '70px',
    textAlign: 'right',
  },
  feedTime: {
    fontSize: '10px',
    color: theme.text.muted,
    minWidth: '38px',
    textAlign: 'right',
  },

  // Quick Stats
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    background: theme.border.subtle,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  quickStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '10px 8px',
    background: theme.bg.secondary,
  },
  quickStatLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  quickStatValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
  },
};
