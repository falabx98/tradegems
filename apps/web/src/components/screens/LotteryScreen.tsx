import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { gameTrack } from '../../utils/analytics';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { playButtonClick, playBetPlaced, playRoundEnd, hapticLight, hapticMedium } from '../../utils/sounds';
import { PageHeader } from '../ui/PageHeader';
import { StatCard } from '../ui/StatCard';
import { GameHeader } from '../game/GameHeader';
import { HowToPlayInline } from '../game/HowToPlayInline';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { SolIcon } from '../ui/SolIcon';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { EmptyState } from '../primitives/EmptyState';
import { Skeleton } from '../primitives/Skeleton';
import { CountUpNumber } from '../game/CountUpNumber';

/* ─── Types ─── */
interface LotteryDraw {
  id: string;
  drawNumber: number;
  status: string;
  drawDate: string;
  standardPrice: number;
  powerPrice: number;
  totalTickets: number;
  prizePool: number;
  rolloverPool: number;
  winningNumbers: number[] | null;
  winningGemBall: number | null;
  createdAt: string;
  drawnAt: string | null;
}

interface TicketEntry {
  id: string;
  entryType: 'standard' | 'power';
  numbers: (number | null)[];
  gemBall: number | null;
}

interface LotteryTicket {
  id: string;
  drawId: string;
  entryType: string;
  numbers: number[];
  gemBall: number;
  cost: number;
  purchasedAt: string;
}

interface PrizeTier {
  tier: number;
  label: string;
  mainMatch: number;
  gemBallMatch: boolean;
  percentage: number;
  prizeAmount: number;
  winners: number;
}

/* ─── Constants ─── */
const MAIN_RANGE = { min: 1, max: 36 };
const GEMBALL_RANGE = { min: 1, max: 9 };
const NUMS_PER_TICKET = 5;
const MAX_TICKETS = 50;

const PRIZE_TIER_LABELS = [
  { tier: 1, label: 'Jackpot', desc: '5 + GB' },
  { tier: 2, label: '2nd', desc: '5' },
  { tier: 3, label: '3rd', desc: '4 + GB' },
  { tier: 4, label: '4th', desc: '4' },
  { tier: 5, label: '5th', desc: '3 + GB' },
  { tier: 6, label: '6th', desc: '3' },
  { tier: 7, label: '7th', desc: '2 + GB' },
  { tier: 8, label: '8th', desc: '1 + GB' },
  { tier: 9, label: '9th', desc: 'GB only' },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function createEmptyTicket(): TicketEntry {
  return { id: generateId(), entryType: 'standard', numbers: [null, null, null, null, null], gemBall: null };
}

function autoFillTicket(entryType: 'standard' | 'power'): TicketEntry {
  const nums = new Set<number>();
  while (nums.size < NUMS_PER_TICKET) nums.add(Math.floor(Math.random() * MAIN_RANGE.max) + 1);
  const gb = Math.floor(Math.random() * GEMBALL_RANGE.max) + 1;
  return { id: generateId(), entryType, numbers: [...nums].sort((a, b) => a - b), gemBall: gb };
}

/* ─── Main Component ─── */
export function LotteryScreen() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useGameStore((s) => s.profile);
  const balance = profile?.balance ?? 0;

  // Core state
  const [tab, setTab] = useState<'play' | 'tickets' | 'howtoplay'>('play');
  const [draw, setDraw] = useState<LotteryDraw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Play tab
  const [entryType, setEntryType] = useState<'standard' | 'power'>('standard');
  const [tickets, setTickets] = useState<TicketEntry[]>([createEmptyTicket()]);
  const [buying, setBuying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<{ ticketIdx: number; slot: 'main' | 'gem'; slotIdx?: number } | null>(null);

  // Tickets tab
  const [viewDrawNumber, setViewDrawNumber] = useState<number>(0);
  const [viewDraw, setViewDraw] = useState<LotteryDraw | null>(null);
  const [myTickets, setMyTickets] = useState<LotteryTicket[]>([]);
  const [prizeTiers, setPrizeTiers] = useState<PrizeTier[]>([]);
  const [ticketsSubTab, setTicketsSubTab] = useState<'my' | 'prizes'>('my');
  const [drawHistory, setDrawHistory] = useState<LotteryDraw[]>([]);

  // Fetch current draw
  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const draw = await api.getLotteryCurrentDraw();
        if (mounted && draw?.id) {
          setDraw(draw);
          setViewDrawNumber(draw.drawNumber);
        }
      } catch { /* ignore */ }
      if (mounted) setLoading(false);
    };
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // Fetch draw for tickets tab
  useEffect(() => {
    if (tab !== 'tickets' || !viewDrawNumber) return;
    let mounted = true;
    (async () => {
      try {
        const d = await api.getLotteryDrawByNumber(viewDrawNumber);
        if (mounted) setViewDraw(d?.id ? d : null);
        if (d?.id && isAuthenticated) {
          const tix = await api.getMyLotteryTickets(d.id);
          if (mounted) setMyTickets(Array.isArray(tix) ? tix : []);
        }
        if (d?.id && d.status === 'completed') {
          const pr = await api.getLotteryPrizes(d.id);
          if (mounted) setPrizeTiers(pr?.tiers || []);
        }
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [tab, viewDrawNumber, isAuthenticated]);

  // Fetch history on tickets tab
  useEffect(() => {
    if (tab !== 'tickets') return;
    (async () => {
      try {
        const draws = await api.getLotteryHistory(20);
        setDrawHistory(Array.isArray(draws) ? draws : []);
      } catch { /* ignore */ }
    })();
  }, [tab]);

  /* ─── Actions ─── */
  const ticketPrice = draw ? (entryType === 'power' ? draw.powerPrice : draw.standardPrice) : 0;
  const totalCost = tickets.length * ticketPrice;

  const setTicketCount = (count: number) => {
    const c = Math.max(1, Math.min(MAX_TICKETS, count));
    const newTickets: TicketEntry[] = [];
    for (let i = 0; i < c; i++) {
      newTickets.push(tickets[i] ? { ...tickets[i], entryType } : autoFillTicket(entryType));
    }
    setTickets(newTickets);
  };

  const autoFillAll = () => {
    setTickets(tickets.map((t) => {
      const filled = autoFillTicket(t.entryType);
      return { ...filled, id: t.id, entryType };
    }));
  };

  const clearAll = () => {
    setTickets(tickets.map((t) => ({ ...t, numbers: [null, null, null, null, null], gemBall: null })));
  };

  const autoFillOne = (idx: number) => {
    const updated = [...tickets];
    const filled = autoFillTicket(entryType);
    updated[idx] = { ...filled, id: updated[idx].id, entryType };
    setTickets(updated);
  };

  const removeTicket = (idx: number) => {
    if (tickets.length <= 1) return;
    setTickets(tickets.filter((_, i) => i !== idx));
  };

  const selectNumber = (ticketIdx: number, slotIdx: number, num: number) => {
    const updated = [...tickets];
    const t = { ...updated[ticketIdx], numbers: [...updated[ticketIdx].numbers] };
    t.numbers[slotIdx] = num;
    updated[ticketIdx] = t;
    setTickets(updated);
    setPickerOpen(null);
  };

  const selectGemBall = (ticketIdx: number, num: number) => {
    const updated = [...tickets];
    updated[ticketIdx] = { ...updated[ticketIdx], gemBall: num };
    setTickets(updated);
    setPickerOpen(null);
  };

  const handleBuy = async () => {
    if (!draw || buying) return;
    gameTrack.start('lottery', totalCost);
    const incomplete = tickets.some((t) => t.numbers.includes(null) || t.gemBall === null);
    if (incomplete) {
      setError('Fill all numbers on every ticket (or use Auto-fill)');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setBuying(true);
    setError('');
    setSuccess('');
    try {
      playBetPlaced();
      hapticMedium();
      await api.buyLotteryTickets(draw.id, tickets.map((t) => ({
        entryType: t.entryType,
        numbers: t.numbers as number[],
        gemBall: t.gemBall as number,
      })));
      setSuccess(`${tickets.length} ticket${tickets.length > 1 ? 's' : ''} purchased!`);
      setTimeout(() => setSuccess(''), 4000);
      setTickets([createEmptyTicket()]);
      // Refresh draw
      const d = await api.getLotteryCurrentDraw();
      if (d?.id) setDraw(d);
    } catch (e: any) {
      setError(e?.message || 'Failed to purchase tickets');
      setTimeout(() => setError(''), 4000);
    }
    setBuying(false);
  };

  // Update entry type on all tickets when changed
  useEffect(() => {
    setTickets((prev) => prev.map((t) => ({ ...t, entryType })));
  }, [entryType]);

  /* ─── Helpers ─── */
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const estimatedJackpot = draw ? Math.floor((draw.prizePool + draw.rolloverPool) * 0.95 * 0.4) : 0;

  /* ─── Render ─── */
  const LOTTERY_ATMOSPHERE = 'radial-gradient(ellipse at 50% 40%, rgba(234,179,8,0.04) 0%, transparent 70%)';

  const lotteryHeader = (
    <GameHeader title="Lottery" subtitle="Jackpot Draws" icon={
      <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2" strokeLinecap="round"><path d="M6 3h12l4 6-10 13L2 9z" /></svg>
      </div>
    }
    howToPlay={
      <HowToPlayInline steps={[
        { icon: '🎯', label: 'Pick 5 numbers + 1 Gem Ball', desc: 'Choose from 1-36 for main numbers and 1-9 for the Gem Ball' },
        { icon: '🎫', label: 'Buy Standard or Power entry', desc: 'Power entry costs more but doubles your winnings' },
        { icon: '💎', label: 'Match numbers to win', desc: 'More matches = bigger prizes. Match all 5 + Gem Ball for the Jackpot!' },
      ]} />
    }
    />
  );

  if (loading) {
    return (
      <CasinoGameLayout
        rail={<GameControlRail><Skeleton variant="rect" height="200px" /><Skeleton variant="rect" height="40px" /></GameControlRail>}
        stage={
          <GameStage atmosphere={LOTTERY_ATMOSPHERE} style={{ minHeight: isMobile ? 200 : 300, padding: theme.gap.lg }}>
            {!isMobile && <div style={{ marginBottom: theme.gap.md }}>{lotteryHeader}</div>}
            <Skeleton variant="rect" height="160px" />
          </GameStage>
        }
      />
    );
  }

  /* ─── CONTROL RAIL ─── */
  const railContent = (
    <GameControlRail>
      {/* Tabs */}
      <div style={s.tabBar}>
        {(['play', 'tickets', 'howtoplay'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); playButtonClick(); }}
            style={tab === t ? { ...s.tab, ...s.tabActive } : s.tab}
          >
            {t === 'play' ? 'Play Lottery' : t === 'tickets' ? 'Tickets & Prizes' : 'How To Play'}
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && <div style={s.errorMsg}>{error}</div>}
      {success && <div style={s.successMsg}>{success}</div>}

      {/* Tab Content */}
      {tab === 'play' && !draw && (
        <Card variant="panel">
          <EmptyState
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="1.5" strokeLinecap="round"><path d="M6 3h12l4 6-10 13L2 9z" /></svg>}
            title="Next Draw Coming Soon"
          />
        </Card>
      )}
      {tab === 'play' && draw && <PlayTab
        draw={draw} entryType={entryType} setEntryType={setEntryType}
        tickets={tickets} setTicketCount={setTicketCount} autoFillAll={autoFillAll}
        clearAll={clearAll} autoFillOne={autoFillOne} removeTicket={removeTicket}
        pickerOpen={pickerOpen} setPickerOpen={setPickerOpen}
        selectNumber={selectNumber} selectGemBall={selectGemBall}
        ticketPrice={ticketPrice} totalCost={totalCost}
        buying={buying} handleBuy={handleBuy}
        isAuthenticated={isAuthenticated} balance={balance} isMobile={isMobile}
      />}
      {tab === 'tickets' && <TicketsTab
        viewDraw={viewDraw} viewDrawNumber={viewDrawNumber}
        setViewDrawNumber={setViewDrawNumber} draw={draw}
        myTickets={myTickets} prizeTiers={prizeTiers}
        ticketsSubTab={ticketsSubTab} setTicketsSubTab={setTicketsSubTab}
        drawHistory={drawHistory} isMobile={isMobile}
      />}
      {tab === 'howtoplay' && <HowToPlayTab isMobile={isMobile} />}
    </GameControlRail>
  );

  /* ─── GAME STAGE ─── */
  const stageContent = (
    <GameStage atmosphere={LOTTERY_ATMOSPHERE} style={{ minHeight: isMobile ? 200 : 340, padding: theme.gap.lg }}>
      {/* Desktop header inside stage */}
      {!isMobile && <div style={{ marginBottom: theme.gap.md }}>{lotteryHeader}</div>}

      {/* Jackpot Banner */}
      <div style={s.jackpotBanner}>
        <div style={s.jackpotBannerDecor} aria-hidden>
          <svg width="70" height="70" viewBox="0 0 80 80" style={{ position: 'absolute', left: '4%', top: '50%', transform: 'translateY(-50%)', opacity: 0.18 }}>
            <circle cx="40" cy="40" r="38" fill="url(#gb1)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <text x="40" y="48" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">5</text>
            <defs><radialGradient id="gb1" cx="35%" cy="35%"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#5b21b6" /></radialGradient></defs>
          </svg>
          <svg width="50" height="50" viewBox="0 0 60 60" style={{ position: 'absolute', right: '6%', top: '50%', transform: 'translateY(-50%)', opacity: 0.15 }}>
            <circle cx="30" cy="30" r="28" fill="url(#gb2)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <text x="30" y="37" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">3</text>
            <defs><radialGradient id="gb2" cx="35%" cy="35%"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#7c3aed" /></radialGradient></defs>
          </svg>
        </div>
        <div style={s.jackpotBannerContent}>
          {draw ? (
            <>
              <div style={s.jackpotDrawLabel}>DRAW #{draw.drawNumber} &bull; <DrawCountdown drawDate={draw.drawDate} /></div>
              <CountUpNumber
                value={estimatedJackpot / 1e9}
                from={0}
                duration={1500}
                decimals={estimatedJackpot >= 1e9 ? 2 : 4}
                suffix={<> <SolIcon size="0.9em" /></>}
                style={s.jackpotAmount}
              />
              <div style={s.jackpotSubLabel}>Estimated Jackpot</div>
            </>
          ) : (
            <div style={{ color: theme.text.muted, fontSize: '14px' }}>No active draw — next draw coming soon!</div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      {draw && (
        <div style={{ display: 'flex', gap: theme.gap.sm, flexWrap: 'wrap' }}>
          <StatCard
            label="Prize Pool"
            value={`${formatSol(draw.prizePool + draw.rolloverPool)} SOL`}
            color={theme.accent.lavender}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            }
          />
          <StatCard
            label="Tickets Sold"
            value={draw.totalTickets.toLocaleString()}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></svg>
            }
          />
          <StatCard
            label="Rollover"
            value={draw.rolloverPool > 0 ? `${formatSol(draw.rolloverPool)} SOL` : '--'}
            color={draw.rolloverPool > 0 ? theme.accent.amber : undefined}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            }
          />
        </div>
      )}

    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = draw ? (
    <GameFooterBar>
      <span>Draw #{draw.drawNumber}</span>
      <span>Provably Fair · {draw.totalTickets} tickets</span>
    </GameFooterBar>
  ) : <GameFooterBar><span /></GameFooterBar>;

  return (
    <>
      {isMobile && <div style={{ padding: `${theme.gap.sm}px 12px` }}>{lotteryHeader}</div>}
      <CasinoGameLayout
        rail={railContent}
        stage={stageContent}
        footer={footerContent}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   DRAW COUNTDOWN
   ══════════════════════════════════════════════════════════════ */
function DrawCountdown({ drawDate }: { drawDate: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const diff = new Date(drawDate).getTime() - now;
  if (diff <= 0) return <span style={{ color: theme.accent.amber }}>Drawing now...</span>;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const isUrgent = diff < 30 * 60 * 1000; // last 30 minutes
  return (
    <span style={{ color: isUrgent ? theme.accent.red : theme.accent.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
      {isUrgent && <Icon name="clock" size={12} style={{ marginRight: 4 }} />}{hours}h {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   PLAY TAB
   ══════════════════════════════════════════════════════════════ */
function PlayTab({ draw, entryType, setEntryType, tickets, setTicketCount, autoFillAll, clearAll, autoFillOne, removeTicket, pickerOpen, setPickerOpen, selectNumber, selectGemBall, ticketPrice, totalCost, buying, handleBuy, isAuthenticated, balance, isMobile }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Step 1 + Step 2 row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Step 1: Entry Type */}
        <div style={s.stepCard}>
          <div style={s.stepHeader}>1. Select Entry Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px' }}>
            <button
              onClick={() => setEntryType('standard')}
              style={entryType === 'standard' ? { ...s.entryOption, ...s.entryOptionActive } : s.entryOption}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                <span style={s.entryLabel}>Standard entry</span>
                <span style={{ fontSize: '11px', color: theme.text.muted }}>5 numbers + GemBall</span>
              </div>
              <span style={s.entryPrice}>
                <img src="/sol-coin.png" alt="" style={{ width: 14, height: 14 }} />
                {formatSol(draw.standardPrice)} <SolIcon size="0.9em" />
              </span>
            </button>
            <button
              onClick={() => setEntryType('power')}
              style={entryType === 'power' ? { ...s.entryOption, ...s.entryOptionPower } : s.entryOption}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={s.entryLabel}>Power entry</span>
                  <span style={s.powerBadge}>POWER</span>
                </div>
                <span style={{ fontSize: '11px', color: theme.text.muted }}>Guaranteed GemBall match</span>
              </div>
              <span style={s.entryPrice}>
                <img src="/sol-coin.png" alt="" style={{ width: 14, height: 14 }} />
                {formatSol(draw.powerPrice)} <SolIcon size="0.9em" />
              </span>
            </button>
          </div>
        </div>

        {/* Step 2: Number of Entries */}
        <div style={s.stepCard}>
          <div style={s.stepHeader}>2. Number of Entries</div>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={1}
                max={MAX_TICKETS}
                value={tickets.length}
                onChange={(e) => setTicketCount(parseInt(e.target.value) || 1)}
                style={s.countInput}
              />
              {[1, 5, 10, 25].map((n) => (
                <button key={n} onClick={() => setTicketCount(n)} style={tickets.length === n ? { ...s.countPill, ...s.countPillActive } : s.countPill}>{n}</button>
              ))}
              <button onClick={() => setTicketCount(MAX_TICKETS)} style={s.countPill}>Max</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: theme.bg.tertiary, borderRadius: theme.radius.sm }}>
              <span style={{ color: theme.text.muted, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total cost</span>
              <span style={{ color: theme.text.primary, fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
                {formatSol(totalCost)} <SolIcon size="0.9em" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Choose Numbers */}
      <div style={s.stepCard}>
        <div style={{ ...s.stepHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>3. Choose Lottery Numbers</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={autoFillAll} style={s.actionBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Auto-fill All
            </button>
            <button onClick={clearAll} style={s.actionBtn}>Clear All</button>
          </div>
        </div>

        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '28px', paddingBottom: '4px' }}>
            <span style={{ color: theme.text.muted, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: isMobile ? '186px' : '246px' }}>Numbers (1–36)</span>
            <span style={{ color: theme.accent.lavender, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>GemBall</span>
          </div>

          {tickets.map((ticket: TicketEntry, tIdx: number) => {
            const missingNums = ticket.numbers.filter((n: number | null) => n === null).length;
            const missingGem = ticket.gemBall === null;
            const isComplete = missingNums === 0 && !missingGem;
            const missingCount = missingNums + (missingGem ? 1 : 0);
            return (
            <div key={ticket.id} style={{
              ...s.ticketRow,
              borderColor: isComplete ? 'rgba(0,231,1,0.15)' : theme.border.subtle,
              background: isComplete ? 'rgba(0,231,1,0.02)' : theme.bg.secondary,
            }}>
              <span style={s.ticketNum}>{tIdx + 1}</span>
              {/* Main numbers */}
              <div style={{ display: 'flex', gap: '5px' }}>
                {ticket.numbers.map((n: number | null, nIdx: number) => (
                  <button
                    key={nIdx}
                    onClick={() => setPickerOpen({ ticketIdx: tIdx, slot: 'main', slotIdx: nIdx })}
                    style={n !== null ? s.numCircleFilled : s.numCircle}
                  >
                    {n !== null ? n : '?'}
                  </button>
                ))}
              </div>
              {/* GemBall */}
              <button
                onClick={() => setPickerOpen({ ticketIdx: tIdx, slot: 'gem' })}
                style={ticket.gemBall !== null ? s.gemCircleFilled : s.gemCircle}
              >
                {ticket.gemBall !== null ? ticket.gemBall : 'GB'}
              </button>
              {/* Completion indicator */}
              {isComplete ? (
                <span style={{ color: theme.accent.neonGreen, fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>✓</span>
              ) : (
                <span style={{ color: theme.text.muted, fontSize: '10px', whiteSpace: 'nowrap' }}>{missingCount} left</span>
              )}
              {/* Actions */}
              <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                <button onClick={() => autoFillOne(tIdx)} style={s.iconBtn} title="Auto-fill">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                </button>
                {tickets.length > 1 && (
                  <button onClick={() => removeTicket(tIdx)} style={s.iconBtn} title="Remove">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* Number Picker Popover */}
        {pickerOpen && (
          <NumberPicker
            slot={pickerOpen.slot}
            ticketIdx={pickerOpen.ticketIdx}
            slotIdx={pickerOpen.slotIdx}
            currentTicket={tickets[pickerOpen.ticketIdx]}
            onSelectNumber={selectNumber}
            onSelectGemBall={selectGemBall}
            onClose={() => setPickerOpen(null)}
          />
        )}
      </div>

      {/* Bottom Buy Bar */}
      <div style={s.buyBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div>
            <div style={{ color: theme.text.muted, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total cost</div>
            <div style={{ color: theme.text.primary, fontWeight: 700, fontFamily: 'monospace', fontSize: '17px' }}>
              {formatSol(totalCost)} <SolIcon size="0.9em" />
            </div>
          </div>
          <div style={{ width: '1px', height: '32px', background: theme.border.medium }} />
          <div>
            <div style={{ color: theme.text.muted, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tickets</div>
            <div style={{ color: theme.text.primary, fontWeight: 700, fontSize: '17px' }}>{tickets.length}</div>
          </div>
        </div>
        <button
          onClick={handleBuy}
          disabled={buying || !isAuthenticated || totalCost > balance}
          className="btn-3d-primary"
          style={{
            opacity: (buying || !isAuthenticated || totalCost > balance) ? 0.5 : 1,
            padding: '12px 32px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: (buying || !isAuthenticated || totalCost > balance) ? 'not-allowed' : 'pointer',
          }}
        >
          {!isAuthenticated ? 'Sign In to Play' : buying ? 'Buying...' : totalCost > balance ? 'Insufficient Balance' : 'Buy Tickets'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   NUMBER PICKER
   ══════════════════════════════════════════════════════════════ */
function NumberPicker({ slot, ticketIdx, slotIdx, currentTicket, onSelectNumber, onSelectGemBall, onClose }: {
  slot: 'main' | 'gem'; ticketIdx: number; slotIdx?: number;
  currentTicket: TicketEntry;
  onSelectNumber: (tIdx: number, sIdx: number, n: number) => void;
  onSelectGemBall: (tIdx: number, n: number) => void;
  onClose: () => void;
}) {
  const usedNumbers = currentTicket.numbers.filter((n): n is number => n !== null);

  return (
    <div style={s.pickerOverlay} onClick={onClose}>
      <div style={s.pickerCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '12px', borderBottom: `1px solid ${theme.border.medium}` }}>
          <span style={{ color: theme.text.primary, fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {slot === 'main' ? `Pick Number — Slot ${(slotIdx ?? 0) + 1}` : 'Pick GemBall (1–9)'}
          </span>
          <button onClick={onClose} style={{ background: theme.bg.tertiary, border: `1px solid ${theme.border.medium}`, borderRadius: theme.radius.md, color: theme.text.secondary, cursor: 'pointer', width: '36px', height: '36px', minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>
        {slot === 'main' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {Array.from({ length: MAIN_RANGE.max }, (_, i) => i + 1).map((n) => {
              const used = usedNumbers.includes(n) && currentTicket.numbers[slotIdx ?? 0] !== n;
              const selected = currentTicket.numbers[slotIdx ?? 0] === n;
              return (
                <button
                  key={n}
                  disabled={used}
                  onClick={() => onSelectNumber(ticketIdx, slotIdx ?? 0, n)}
                  style={{
                    ...s.pickerNum,
                    opacity: used ? 0.25 : 1,
                    background: selected ? theme.gradient.primary : theme.bg.tertiary,
                    border: selected ? 'none' : `1px solid ${theme.border.medium}`,
                    color: selected ? '#fff' : theme.text.secondary,
                    fontWeight: selected ? 700 : 500,
                    transform: selected ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '6px' }}>
            {Array.from({ length: GEMBALL_RANGE.max }, (_, i) => i + 1).map((n) => {
              const selected = currentTicket.gemBall === n;
              return (
                <button
                  key={n}
                  onClick={() => onSelectGemBall(ticketIdx, n)}
                  style={{
                    ...s.pickerGem,
                    background: selected ? theme.gradient.primary : 'rgba(139,92,246,0.08)',
                    border: selected ? 'none' : `1px solid ${theme.border.accent}`,
                    color: selected ? '#fff' : theme.accent.lavender,
                    fontWeight: selected ? 700 : 500,
                    transform: selected ? 'scale(1.12)' : 'scale(1)',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TICKETS & PRIZES TAB
   ══════════════════════════════════════════════════════════════ */
function TicketsTab({ viewDraw, viewDrawNumber, setViewDrawNumber, draw, myTickets, prizeTiers, ticketsSubTab, setTicketsSubTab, drawHistory, isMobile }: any) {
  const maxDraw = draw?.drawNumber || viewDrawNumber;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Draw Navigator */}
      <div style={s.drawNav}>
        <button
          onClick={() => viewDrawNumber > 1 && setViewDrawNumber(viewDrawNumber - 1)}
          style={s.drawNavBtn}
          disabled={viewDrawNumber <= 1}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          Prev
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: theme.text.primary, fontWeight: 700, fontSize: '15px' }}>Draw #{viewDrawNumber}</div>
          {viewDraw && <div style={{ color: theme.text.muted, fontSize: '12px', marginTop: '2px' }}>{new Date(viewDraw.drawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          {viewDrawNumber === maxDraw && <span style={s.currentBadge}>LIVE</span>}
        </div>
        <button
          onClick={() => viewDrawNumber < maxDraw && setViewDrawNumber(viewDrawNumber + 1)}
          style={s.drawNavBtn}
          disabled={viewDrawNumber >= maxDraw}
        >
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* Winning Numbers (completed draws) */}
      {viewDraw?.status === 'completed' && viewDraw.winningNumbers && (
        <div style={s.winningBox}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: theme.text.muted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Winning Numbers</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            {(viewDraw.winningNumbers as number[]).map((n: number, i: number) => (
              <div key={i} style={s.winBall}>{n}</div>
            ))}
            <div style={{ width: '1px', height: '36px', background: theme.border.medium, margin: '0 4px' }} />
            <div style={s.winGemBall}>{viewDraw.winningGemBall}</div>
          </div>
        </div>
      )}

      {viewDraw?.status === 'open' && (
        <div style={{ textAlign: 'center', padding: '24px 16px', background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg, color: theme.text.muted, fontSize: '14px' }}>
          Draw has not happened yet — buy tickets in the Play tab!
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${theme.border.subtle}` }}>
        {(['my', 'prizes'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setTicketsSubTab(st)}
            style={ticketsSubTab === st ? { ...s.subTab, ...s.subTabActive } : s.subTab}
          >
            {st === 'my' ? 'My Tickets' : 'Prizes & Results'}
          </button>
        ))}
      </div>

      {/* My Tickets */}
      {ticketsSubTab === 'my' && (
        <div>
          {myTickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: theme.text.muted, background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg }}>
              <Icon name="ticket" size={28} style={{ color: theme.text.disabled, marginBottom: 8, opacity: 0.4 }} />
              No tickets for this draw
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {myTickets.map((ticket: LotteryTicket, i: number) => (
                <div key={ticket.id} style={s.myTicketRow}>
                  <span style={{ color: theme.text.muted, fontSize: '11px', fontWeight: 600, width: '22px', textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(ticket.numbers as number[]).map((n: number, ni: number) => {
                      const matched = viewDraw?.winningNumbers?.includes(n);
                      return (
                        <div key={ni} style={{ ...s.miniBall, background: matched ? theme.accent.green : theme.bg.tertiary, color: matched ? theme.bg.primary : theme.text.secondary, border: matched ? 'none' : `1px solid ${theme.border.medium}` }}>
                          {n}
                        </div>
                      );
                    })}
                    {(() => {
                      const gbMatched = ticket.entryType === 'power' || ticket.gemBall === viewDraw?.winningGemBall;
                      return (
                        <div style={{ ...s.miniGem, background: gbMatched ? theme.accent.violet : 'rgba(139,92,246,0.1)', color: gbMatched ? '#fff' : theme.accent.lavender, border: gbMatched ? 'none' : `1px solid ${theme.border.accent}` }}>
                          {ticket.gemBall}
                        </div>
                      );
                    })()}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', color: ticket.entryType === 'power' ? theme.accent.lavender : theme.text.muted, background: ticket.entryType === 'power' ? 'rgba(167,139,250,0.1)' : theme.bg.tertiary, padding: '2px 6px', borderRadius: theme.radius.sm, border: ticket.entryType === 'power' ? `1px solid ${theme.border.accent}` : `1px solid ${theme.border.subtle}` }}>
                    {ticket.entryType === 'power' ? 'POWER' : 'STD'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prizes & Results */}
      {ticketsSubTab === 'prizes' && (
        <div>
          {viewDraw?.status !== 'completed' ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: theme.text.muted, background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: theme.radius.lg }}>
              Prizes available after draw completes
            </div>
          ) : (
            <div style={s.prizeTable}>
              <div style={s.prizeHeader}>
                <span style={{ flex: 1 }}>Division</span>
                <span style={{ flex: 1 }}>Match</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Prize</span>
                <span style={{ width: '60px', textAlign: 'right' }}>Winners</span>
              </div>
              {PRIZE_TIER_LABELS.map((pt) => {
                const data = prizeTiers.find((p: PrizeTier) => p.tier === pt.tier);
                return (
                  <div key={pt.tier} style={{ ...s.prizeRow, background: pt.tier === 1 ? 'rgba(139,92,246,0.04)' : 'transparent' }}>
                    <span style={{ flex: 1, color: pt.tier === 1 ? theme.accent.purple : theme.text.primary, fontWeight: pt.tier === 1 ? 700 : 400 }}>
                      {pt.label}
                    </span>
                    <span style={{ flex: 1 }}>
                      <MatchPattern desc={pt.desc} />
                    </span>
                    <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: pt.tier === 1 ? theme.accent.lavender : theme.text.primary, fontWeight: pt.tier === 1 ? 700 : 400 }}>
                      {data ? <>{formatSol(data.prizeAmount)} <SolIcon size="0.9em" /></> : '--'}
                    </span>
                    <span style={{ width: '60px', textAlign: 'right', color: theme.text.muted }}>
                      {data?.winners ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchPattern({ desc }: { desc: string }) {
  const parts = desc.split(' + ');
  const mainCount = parseInt(parts[0]) || 0;
  const hasGb = parts.includes('GB') || desc === 'GB only';
  const isGbOnly = desc === 'GB only';

  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {!isGbOnly && Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          background: i < mainCount ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)',
        }} />
      ))}
      {hasGb && (
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#7c3aed',
          border: '1px solid rgba(59,130,246,0.5)',
          marginLeft: isGbOnly ? 0 : 4,
        }} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   HOW TO PLAY TAB
   ══════════════════════════════════════════════════════════════ */
function HowToPlayTab({ isMobile }: { isMobile: boolean }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const steps = [
    { num: '1', title: 'Choose Entry Type', desc: 'Pick Standard (0.10 SOL) for regular odds, or Power Entry (0.50 SOL) for a guaranteed GemBall match.' },
    { num: '2', title: 'Select Entries', desc: 'Choose how many tickets you want. More tickets = more chances to win the jackpot!' },
    { num: '3', title: 'Pick Your Numbers', desc: 'Select 5 numbers (1-36) and 1 GemBall (1-9), or use Auto-fill for random picks.' },
    { num: '4', title: 'Confirm & Pay', desc: 'Review your tickets and confirm. Funds are deducted immediately. Good luck!' },
  ];

  const info = [
    { title: 'Checking Numbers', desc: 'After the draw, check the Tickets & Prizes tab to see if your numbers match. Matched numbers are highlighted green.' },
    { title: 'Claiming Winnings', desc: 'Winnings are automatically credited to your balance after each draw. No manual claiming needed!' },
    { title: 'Power Entry', desc: 'Power entries cost more but guarantee your GemBall matches. This means you can\'t win less than Tier 9 and have better odds at every tier.' },
    { title: 'Draw Schedule', desc: 'Draws happen every Friday. The prize pool grows as more tickets are sold throughout the week.' },
  ];

  const faqs = [
    { q: 'What is a Standard Entry?', a: 'A standard entry costs 0.10 SOL. You pick 5 numbers from 1-36 and 1 GemBall from 1-9. You win prizes based on how many numbers match the draw.' },
    { q: 'What is a Power Entry?', a: 'A power entry costs 0.50 SOL. It works like a standard entry but your GemBall is guaranteed to match, giving you much better odds at every prize tier.' },
    { q: 'How are winners determined?', a: 'After the draw, each ticket is checked against the winning numbers. Prizes are split among all winners in each tier. More number matches = higher prize tier.' },
    { q: 'What if nobody wins the Jackpot?', a: 'If no ticket matches all 5 numbers + GemBall, the jackpot allocation rolls over to the next draw, making the next jackpot even bigger!' },
    { q: 'How many tickets can I buy?', a: 'You can buy up to 50 tickets per transaction for a single draw.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Steps */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {steps.map((step) => (
          <div key={step.num} style={s.howCard}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: theme.accent.purple, fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{step.num}. {step.title}</span>
              <span style={{ color: theme.text.muted, fontSize: '11px', lineHeight: '1.5', textAlign: 'center' }}>{step.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Info cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {info.map((item) => (
          <div key={item.title} style={s.infoCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: '3px', height: '14px', background: theme.gradient.primary, borderRadius: '2px' }} />
              <span style={{ color: theme.text.primary, fontWeight: 600, fontSize: '13px' }}>{item.title}</span>
            </div>
            <span style={{ color: theme.text.muted, fontSize: '12px', lineHeight: '1.6' }}>{item.desc}</span>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ color: theme.accent.purple, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          FAQ
        </div>
        {faqs.map((faq, i) => (
          <div key={i} style={s.faqItem}>
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={s.faqQuestion}>
              <span>{faq.q}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, color: theme.text.muted }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {openFaq === i && (
              <div style={s.faqAnswer}>{faq.a}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════ */
const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '0 16px 100px 16px',
    maxWidth: '960px',
    margin: '0 auto',
    width: '100%',
  },

  // Jackpot Banner
  jackpotBanner: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: `linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(139,92,246,0.10) 50%, rgba(234,179,8,0.08) 100%)`,
    border: '1px solid rgba(234,179,8,0.15)',
    padding: '28px 24px',
    textAlign: 'center',
  },
  jackpotBannerDecor: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  jackpotBannerContent: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  jackpotDrawLabel: { color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '6px' },
  jackpotAmount: { color: '#EAB308', fontSize: '46px', fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, textShadow: '0 0 24px rgba(234,179,8,0.3), 0 2px 12px rgba(0,0,0,0.3)' },
  jackpotSubLabel: { color: 'rgba(255,255,255,0.65)', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '1px', marginTop: '4px' },

  // Tabs
  tabBar: {
    display: 'flex',
    gap: '4px',
    background: theme.bg.elevated,
    borderRadius: '8px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    color: theme.text.muted,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: theme.bg.surface,
    color: '#fff',
    fontWeight: 600,
  },

  // Messages
  errorMsg: {
    background: 'rgba(255,71,87,0.08)',
    border: `1px solid rgba(255,71,87,0.25)`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    color: theme.accent.red,
    fontSize: '13px',
  },
  successMsg: {
    background: 'rgba(0,220,130,0.08)',
    border: `1px solid rgba(0,220,130,0.25)`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    color: theme.accent.green,
    fontSize: '13px',
  },

  // Step cards
  stepCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  stepHeader: {
    padding: '10px 14px',
    background: 'rgba(139,92,246,0.07)',
    borderBottom: `1px solid ${theme.border.accent}`,
    color: theme.accent.purple,
    fontWeight: 700,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // Entry type options
  entryOption: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: theme.bg.tertiary,
    border: `2px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    transition: 'all 0.15s',
    width: '100%',
  },
  entryOptionActive: {
    borderColor: theme.accent.purple,
    background: 'rgba(139,92,246,0.08)',
  },
  entryOptionPower: {
    borderColor: theme.accent.violet,
    background: 'rgba(124,58,237,0.08)',
  },
  entryLabel: { color: theme.text.primary, fontWeight: 600, fontSize: '14px' },
  entryPrice: { display: 'flex', alignItems: 'center', gap: '5px', color: theme.accent.green, fontWeight: 700, fontFamily: 'monospace', fontSize: '13px' },
  powerBadge: { display: 'inline-flex', alignItems: 'center', padding: '1px 6px', background: 'rgba(139,92,246,0.15)', border: `1px solid ${theme.border.accent}`, borderRadius: theme.radius.sm, color: theme.accent.lavender, fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px' },

  // Count input
  countInput: {
    width: '60px',
    padding: '8px 10px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm,
    color: theme.text.primary,
    fontSize: '14px',
    textAlign: 'center',
    fontFamily: 'monospace',
    outline: 'none',
  },
  countPill: {
    padding: '6px 12px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.full,
    color: theme.text.secondary,
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.1s',
    fontWeight: 500,
  },
  countPillActive: {
    background: 'rgba(139,92,246,0.12)',
    border: `1px solid ${theme.border.accent}`,
    color: theme.accent.lavender,
  },

  // Action buttons
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm,
    color: theme.text.secondary,
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: 500,
  },

  // Ticket row
  ticketRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: theme.bg.tertiary,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.border.subtle}`,
  },
  ticketNum: {
    color: theme.text.muted,
    fontSize: '11px',
    fontWeight: 700,
    width: '18px',
    textAlign: 'center',
  },

  // Number circles
  numCircle: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.bg.elevated,
    border: `2px solid ${theme.border.medium}`,
    color: theme.text.muted,
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontWeight: 500,
  },
  numCircleFilled: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.gradient.primary,
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  gemCircle: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139,92,246,0.07)',
    border: `2px solid ${theme.border.accent}`,
    color: theme.accent.lavender,
    fontSize: '9px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginLeft: '4px',
  },
  gemCircleFilled: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.gradient.primary,
    border: `2px solid ${theme.accent.lavender}`,
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginLeft: '4px',
  },
  iconBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm,
    color: theme.text.muted,
    cursor: 'pointer',
  },

  // Number picker
  pickerOverlay: {
    position: 'fixed',
    inset: 0,
    background: theme.bg.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  pickerCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.lg,
    padding: '18px',
    maxWidth: '340px',
    width: '90%',
    boxShadow: theme.shadow.lg,
  },
  pickerNum: {
    width: '100%',
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  pickerGem: {
    width: '100%',
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },

  // Buy bar
  buyBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.lg,
    position: 'sticky',
    bottom: '70px',
    zIndex: 10,
    boxShadow: theme.shadow.md,
  },

  // Draw navigator
  drawNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
  },
  drawNavBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '7px 14px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.sm,
    color: theme.text.secondary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  currentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    background: 'rgba(0,220,130,0.12)',
    border: '1px solid rgba(0,220,130,0.25)',
    borderRadius: theme.radius.full,
    color: theme.accent.green,
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginTop: '4px',
  },

  // Winning numbers display
  winningBox: {
    padding: '20px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    textAlign: 'center',
  },
  winBall: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.gradient.primary,
    color: '#fff',
    fontSize: '16px',
    fontWeight: 800,
    boxShadow: theme.shadow.glow,
  },
  winGemBall: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.accent.violet,
    border: `2px solid ${theme.accent.lavender}`,
    color: '#fff',
    fontSize: '16px',
    fontWeight: 800,
    boxShadow: theme.shadow.glow,
  },

  // Sub-tabs
  subTab: {
    flex: 1,
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: theme.text.muted,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'center',
  },
  subTabActive: {
    color: theme.accent.purple,
    borderBottomColor: theme.accent.purple,
    fontWeight: 700,
  },

  // My tickets
  myTicketRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: theme.bg.card,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.border.subtle}`,
  },
  miniBall: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
  },
  miniGem: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    marginLeft: '4px',
  },

  // Prize table
  prizeTable: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: theme.bg.card,
  },
  prizeHeader: {
    display: 'flex',
    padding: '10px 14px',
    background: theme.bg.elevated,
    borderBottom: `1px solid ${theme.border.medium}`,
    color: theme.text.muted,
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  prizeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    fontSize: '13px',
    color: theme.text.secondary,
  },

  // How to play
  howCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '18px 14px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    textAlign: 'center',
    alignItems: 'center',
  },
  infoCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px',
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
  },
  faqItem: {
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    background: theme.bg.card,
  },
  faqQuestion: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '12px 14px',
    background: theme.bg.card,
    border: 'none',
    color: theme.text.primary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
  },
  faqAnswer: {
    padding: '10px 14px',
    color: theme.text.muted,
    fontSize: '12px',
    lineHeight: '1.6',
    borderTop: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
};
