import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { api } from '../../utils/api';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { playButtonClick, playBetPlaced, playRoundEnd, hapticLight, hapticMedium } from '../../utils/sounds';

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
    const incomplete = tickets.some((t) => t.numbers.includes(null) || t.gemBall === null);
    if (incomplete) {
      setError('Fill all numbers on every ticket (or use Auto-fill)');
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
      setTickets([createEmptyTicket()]);
      // Refresh draw
      const d = await api.getLotteryCurrentDraw();
      if (d?.id) setDraw(d);
    } catch (e: any) {
      setError(e?.message || 'Failed to purchase tickets');
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
  if (loading) {
    return (
      <div style={s.container}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: theme.text.muted }}>
          Loading lottery...
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* Hero Banner */}
      <div style={s.hero}>
        <div style={s.heroDecor}>
          {/* Gem balls */}
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: 'absolute', left: '5%', top: '10%', opacity: 0.5 }}>
            <circle cx="40" cy="40" r="38" fill="url(#gb1)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
            <text x="40" y="48" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">5</text>
            <defs><radialGradient id="gb1" cx="35%" cy="35%"><stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#5b21b6" /></radialGradient></defs>
          </svg>
          <svg width="60" height="60" viewBox="0 0 60 60" style={{ position: 'absolute', right: '8%', top: '15%', opacity: 0.4 }}>
            <circle cx="30" cy="30" r="28" fill="url(#gb2)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
            <text x="30" y="37" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">3</text>
            <defs><radialGradient id="gb2" cx="35%" cy="35%"><stop offset="0%" stopColor="#c084fc" /><stop offset="100%" stopColor="#7c3aed" /></radialGradient></defs>
          </svg>
          <svg width="50" height="50" viewBox="0 0 50 50" style={{ position: 'absolute', right: '25%', bottom: '10%', opacity: 0.3 }}>
            <circle cx="25" cy="25" r="23" fill="url(#gb3)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <text x="25" y="32" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">9</text>
            <defs><radialGradient id="gb3" cx="35%" cy="35%"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#4338ca" /></radialGradient></defs>
          </svg>
        </div>
        <div style={s.heroContent}>
          <div style={s.heroIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5">
              <path d="M6 3h12l4 6-10 13L2 9z" />
            </svg>
          </div>
          {draw && (
            <>
              <div style={s.heroTitle}>Join Draw #{draw.drawNumber}</div>
              <div style={s.heroDate}>{formatDate(draw.drawDate)} at {formatTime(draw.drawDate)}</div>
              <div style={s.heroJackpot}>{formatSol(estimatedJackpot)} SOL</div>
              <div style={s.heroSub}>Estimated Jackpot</div>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PLAY TAB
   ══════════════════════════════════════════════════════════════ */
function PlayTab({ draw, entryType, setEntryType, tickets, setTicketCount, autoFillAll, clearAll, autoFillOne, removeTicket, pickerOpen, setPickerOpen, selectNumber, selectGemBall, ticketPrice, totalCost, buying, handleBuy, isAuthenticated, balance, isMobile }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Step 1 + Step 2 row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
        {/* Step 1: Entry Type */}
        <div style={s.stepCard}>
          <div style={s.stepHeader}>1. Select Entry Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
            <button
              onClick={() => setEntryType('standard')}
              style={entryType === 'standard' ? { ...s.entryOption, ...s.entryOptionActive } : s.entryOption}
            >
              <span style={s.entryLabel}>Standard entry</span>
              <span style={s.entryPrice}>
                <img src="/sol-coin.png" alt="" style={{ width: 16, height: 16 }} />
                {formatSol(draw.standardPrice)} SOL
              </span>
            </button>
            <button
              onClick={() => setEntryType('power')}
              style={entryType === 'power' ? { ...s.entryOption, ...s.entryOptionPower } : s.entryOption}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={s.entryLabel}>Power entry</span>
                <span style={{ fontSize: '10px', color: theme.text.muted, marginTop: '2px' }}>Guaranteed GemBall match</span>
              </div>
              <span style={s.entryPrice}>
                <img src="/sol-coin.png" alt="" style={{ width: 16, height: 16 }} />
                {formatSol(draw.powerPrice)} SOL
              </span>
            </button>
          </div>
        </div>

        {/* Step 2: Number of Entries */}
        <div style={s.stepCard}>
          <div style={s.stepHeader}>2. Select Number of Entries</div>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min={1}
                max={MAX_TICKETS}
                value={tickets.length}
                onChange={(e) => setTicketCount(parseInt(e.target.value) || 1)}
                style={s.countInput}
              />
              {[1, 5, 10, 25].map((n) => (
                <button key={n} onClick={() => setTicketCount(n)} style={s.countPill}>{n}</button>
              ))}
              <button onClick={() => setTicketCount(MAX_TICKETS)} style={s.countPill}>Max</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: theme.text.muted, fontSize: '13px' }}>Total cost</span>
              <span style={{ color: theme.text.primary, fontSize: '15px', fontWeight: 600, fontFamily: 'monospace' }}>
                {formatSol(totalCost)} SOL
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Choose Numbers */}
      <div style={s.stepCard}>
        <div style={{ ...s.stepHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>3. Choose Lottery Numbers</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={autoFillAll} style={s.actionBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Auto-fill All
            </button>
            <button onClick={clearAll} style={s.actionBtn}>Clear All</button>
          </div>
        </div>

        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '30px', paddingBottom: '4px' }}>
            <span style={{ color: theme.text.muted, fontSize: '11px', width: isMobile ? '180px' : '240px' }}>Numbers</span>
            <span style={{ color: '#a78bfa', fontSize: '11px' }}>GemBall</span>
          </div>

          {tickets.map((ticket: TicketEntry, tIdx: number) => (
            <div key={ticket.id} style={s.ticketRow}>
              <span style={s.ticketNum}>{tIdx + 1}</span>
              {/* Main numbers */}
              <div style={{ display: 'flex', gap: '6px' }}>
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
              {/* Actions */}
              <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                <button onClick={() => autoFillOne(tIdx)} style={s.iconBtn} title="Auto-fill">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                </button>
                {tickets.length > 1 && (
                  <button onClick={() => removeTicket(tIdx)} style={s.iconBtn} title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ color: theme.text.muted, fontSize: '11px' }}>Total cost</div>
            <div style={{ color: theme.text.primary, fontWeight: 700, fontFamily: 'monospace', fontSize: '16px' }}>
              {formatSol(totalCost)} SOL
            </div>
          </div>
          <div>
            <div style={{ color: theme.text.muted, fontSize: '11px' }}>Tickets</div>
            <div style={{ color: theme.text.primary, fontWeight: 600, fontSize: '16px' }}>{tickets.length}</div>
          </div>
        </div>
        <button
          onClick={handleBuy}
          disabled={buying || !isAuthenticated || totalCost > balance}
          style={{
            ...s.buyBtn,
            opacity: (buying || !isAuthenticated || totalCost > balance) ? 0.5 : 1,
          }}
        >
          {!isAuthenticated ? 'Sign In to Play' : buying ? 'Buying...' : totalCost > balance ? 'Insufficient Balance' : 'Buy Now'}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ color: theme.text.primary, fontWeight: 600, fontSize: '14px' }}>
            {slot === 'main' ? `Pick Number (Slot ${(slotIdx ?? 0) + 1})` : 'Pick GemBall'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.text.muted, cursor: 'pointer', fontSize: '18px' }}>x</button>
        </div>
        {slot === 'main' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {Array.from({ length: MAIN_RANGE.max }, (_, i) => i + 1).map((n) => {
              const used = usedNumbers.includes(n) && currentTicket.numbers[slotIdx ?? 0] !== n;
              return (
                <button
                  key={n}
                  disabled={used}
                  onClick={() => onSelectNumber(ticketIdx, slotIdx ?? 0, n)}
                  style={{
                    ...s.pickerNum,
                    opacity: used ? 0.3 : 1,
                    background: currentTicket.numbers[slotIdx ?? 0] === n ? theme.accent.purple : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '6px' }}>
            {Array.from({ length: GEMBALL_RANGE.max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => onSelectGemBall(ticketIdx, n)}
                style={{
                  ...s.pickerGem,
                  background: currentTicket.gemBall === n ? '#7c3aed' : 'rgba(139,92,246,0.15)',
                }}
              >
                {n}
              </button>
            ))}
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          Prev
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: theme.text.primary, fontWeight: 600, fontSize: '15px' }}>Draw #{viewDrawNumber}</div>
          {viewDraw && <div style={{ color: theme.text.muted, fontSize: '12px' }}>{new Date(viewDraw.drawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          {viewDrawNumber === maxDraw && <span style={s.currentBadge}>Current</span>}
        </div>
        <button
          onClick={() => viewDrawNumber < maxDraw && setViewDrawNumber(viewDrawNumber + 1)}
          style={s.drawNavBtn}
          disabled={viewDrawNumber >= maxDraw}
        >
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* Winning Numbers (completed draws) */}
      {viewDraw?.status === 'completed' && viewDraw.winningNumbers && (
        <div style={s.winningBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
            <span style={{ color: theme.text.muted, fontSize: '12px' }}>Winning Numbers</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {(viewDraw.winningNumbers as number[]).map((n: number, i: number) => (
              <div key={i} style={s.winBall}>{n}</div>
            ))}
            <div style={s.winGemBall}>{viewDraw.winningGemBall}</div>
          </div>
        </div>
      )}

      {viewDraw?.status === 'open' && (
        <div style={{ textAlign: 'center', padding: '20px', color: theme.text.muted, fontSize: '14px' }}>
          Draw has not happened yet. Buy tickets in the Play tab!
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
            <div style={{ textAlign: 'center', padding: '40px 16px', color: theme.text.muted }}>
              No tickets for this draw
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {myTickets.map((ticket: LotteryTicket, i: number) => (
                <div key={ticket.id} style={s.myTicketRow}>
                  <span style={{ color: theme.text.muted, fontSize: '12px', width: '24px' }}>{i + 1}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(ticket.numbers as number[]).map((n: number, ni: number) => {
                      const matched = viewDraw?.winningNumbers?.includes(n);
                      return (
                        <div key={ni} style={{ ...s.miniBall, background: matched ? '#22c55e' : 'rgba(255,255,255,0.08)', color: matched ? '#fff' : theme.text.secondary }}>
                          {n}
                        </div>
                      );
                    })}
                    {(() => {
                      const gbMatched = ticket.entryType === 'power' || ticket.gemBall === viewDraw?.winningGemBall;
                      return (
                        <div style={{ ...s.miniGem, background: gbMatched ? '#7c3aed' : 'rgba(139,92,246,0.15)', color: gbMatched ? '#fff' : '#a78bfa' }}>
                          {ticket.gemBall}
                        </div>
                      );
                    })()}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: ticket.entryType === 'power' ? '#a78bfa' : theme.text.muted }}>
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
            <div style={{ textAlign: 'center', padding: '40px 16px', color: theme.text.muted }}>
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
                  <div key={pt.tier} style={s.prizeRow}>
                    <span style={{ flex: 1, color: pt.tier === 1 ? '#fbbf24' : theme.text.primary, fontWeight: pt.tier === 1 ? 700 : 400 }}>
                      {pt.label}
                    </span>
                    <span style={{ flex: 1 }}>
                      <MatchPattern desc={pt.desc} />
                    </span>
                    <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: theme.text.primary }}>
                      {data ? `${formatSol(data.prizeAmount)} SOL` : '--'}
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
          background: i < mainCount ? '#fbbf24' : 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)',
        }} />
      ))}
      {hasGb && (
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#7c3aed',
          border: '1px solid rgba(139,92,246,0.5)',
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
    { num: '1', title: 'Choose Entry Type', desc: 'Pick Standard (0.10 SOL) for regular odds, or Power Entry (0.50 SOL) for a guaranteed GemBall match.', icon: '🎫' },
    { num: '2', title: 'Select Entries', desc: 'Choose how many tickets you want. More tickets = more chances to win the jackpot!', icon: '🔢' },
    { num: '3', title: 'Pick Your Numbers', desc: 'Select 5 numbers (1-36) and 1 GemBall (1-9), or use Auto-fill for random picks.', icon: '🎯' },
    { num: '4', title: 'Confirm & Pay', desc: 'Review your tickets and confirm. Funds are deducted immediately. Good luck!', icon: '✅' },
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
        {steps.map((step) => (
          <div key={step.num} style={s.howCard}>
            <span style={{ fontSize: '28px' }}>{step.icon}</span>
            <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '13px' }}>{step.num}. {step.title}</span>
            <span style={{ color: theme.text.muted, fontSize: '12px', lineHeight: '1.4' }}>{step.desc}</span>
          </div>
        ))}
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
        {info.map((item) => (
          <div key={item.title} style={s.infoCard}>
            <span style={{ color: theme.text.primary, fontWeight: 600, fontSize: '14px' }}>{item.title}</span>
            <span style={{ color: theme.text.muted, fontSize: '12px', lineHeight: '1.5' }}>{item.desc}</span>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Frequently Asked Questions</div>
        {faqs.map((faq, i) => (
          <div key={i} style={s.faqItem}>
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={s.faqQuestion}>
              <span>{faq.q}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
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

  // Hero
  hero: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #4a0eb8 0%, #7717ff 40%, #5b21b6 70%, #3b0764 100%)',
    padding: '32px 20px',
    textAlign: 'center',
    minHeight: '200px',
  },
  heroDecor: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  heroContent: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  heroIcon: { marginBottom: '4px' },
  heroTitle: { color: '#fff', fontSize: '18px', fontWeight: 600 },
  heroDate: { color: 'rgba(255,255,255,0.7)', fontSize: '13px' },
  heroJackpot: { color: '#fbbf24', fontSize: '42px', fontWeight: 800, fontFamily: 'monospace', textShadow: '0 2px 20px rgba(251,191,36,0.4)', marginTop: '8px' },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' },

  // Tabs
  tabBar: {
    display: 'flex',
    gap: '0',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '8px',
    padding: '3px',
    border: `1px solid ${theme.border.subtle}`,
  },
  tab: {
    flex: 1,
    padding: '10px 12px',
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
    background: theme.accent.purple,
    color: '#fff',
  },

  // Messages
  errorMsg: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#f87171',
    fontSize: '13px',
  },
  successMsg: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#34d399',
    fontSize: '13px',
  },

  // Step cards
  stepCard: {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    overflow: 'hidden',
  },
  stepHeader: {
    padding: '10px 14px',
    background: 'rgba(251,191,36,0.08)',
    borderBottom: '1px dashed rgba(251,191,36,0.2)',
    color: '#fbbf24',
    fontWeight: 700,
    fontSize: '14px',
  },

  // Entry type options
  entryOption: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '2px solid transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    width: '100%',
  },
  entryOptionActive: {
    borderColor: theme.accent.purple,
    background: 'rgba(119,23,255,0.1)',
  },
  entryOptionPower: {
    borderColor: '#7c3aed',
    background: 'rgba(124,58,237,0.1)',
  },
  entryLabel: { color: theme.text.primary, fontWeight: 500, fontSize: '14px' },
  entryPrice: { display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e', fontWeight: 600, fontFamily: 'monospace', fontSize: '14px' },

  // Count input
  countInput: {
    width: '60px',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.primary,
    fontSize: '14px',
    textAlign: 'center',
    fontFamily: 'monospace',
    outline: 'none',
  },
  countPill: {
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '20px',
    color: theme.text.secondary,
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.1s',
    fontWeight: 500,
  },

  // Action buttons
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
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
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  ticketNum: {
    color: theme.text.muted,
    fontSize: '12px',
    fontWeight: 600,
    width: '20px',
    textAlign: 'center',
  },

  // Number circles
  numCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: '2px solid rgba(255,255,255,0.1)',
    color: theme.text.muted,
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontWeight: 500,
  },
  numCircleFilled: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.12)',
    border: '2px solid rgba(255,255,255,0.3)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  gemCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139,92,246,0.12)',
    border: '2px solid rgba(139,92,246,0.3)',
    color: '#a78bfa',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginLeft: '4px',
  },
  gemCircleFilled: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#7c3aed',
    border: '2px solid #a78bfa',
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
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.muted,
    cursor: 'pointer',
  },

  // Number picker
  pickerOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  pickerCard: {
    background: '#141414',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
    padding: '16px',
    maxWidth: '340px',
    width: '90%',
  },
  pickerNum: {
    width: '100%',
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
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
    border: '1px solid rgba(139,92,246,0.3)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.1s',
  },

  // Buy bar
  buyBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    position: 'sticky',
    bottom: '70px',
    zIndex: 10,
    backdropFilter: 'blur(12px)',
  },
  buyBtn: {
    padding: '12px 28px',
    background: 'linear-gradient(135deg, #7717ff, #5b21b6)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },

  // Draw navigator
  drawNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  drawNavBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    background: 'none',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.secondary,
    fontSize: '13px',
    cursor: 'pointer',
  },
  currentBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'rgba(119,23,255,0.2)',
    borderRadius: '10px',
    color: '#a78bfa',
    fontSize: '10px',
    fontWeight: 600,
    marginTop: '4px',
  },

  // Winning numbers display
  winningBox: {
    padding: '20px',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    textAlign: 'center',
  },
  winBall: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #fbbf24, #d97706)',
    color: '#000',
    fontSize: '16px',
    fontWeight: 800,
  },
  winGemBall: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 800,
    marginLeft: '8px',
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
  },

  // My tickets
  myTicketRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
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
    borderRadius: '8px',
    overflow: 'hidden',
  },
  prizeHeader: {
    display: 'flex',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    borderBottom: `1px solid ${theme.border.subtle}`,
    color: theme.text.muted,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  prizeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    fontSize: '13px',
    color: theme.text.secondary,
  },

  // How to play
  howCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    textAlign: 'center',
    alignItems: 'center',
  },
  infoCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
  },
  faqItem: {
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  faqQuestion: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.03)',
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
  },
};
