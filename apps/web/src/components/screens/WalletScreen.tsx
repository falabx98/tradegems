import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { api, API_BASE, apiFetch } from '../../utils/api';
import { formatSol, solToLamports } from '../../utils/sol';


import { theme } from '../../styles/theme';
import { CheckIcon, GiftIcon, WalletIcon } from '../ui/GameIcons';
import { SolIcon } from '../ui/SolIcon';
import { PageHeader } from '../ui/PageHeader';
import { TabBar } from '../ui/TabBar';
import { ContentNarrow } from '../primitives/ContentContainer';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Transaction {
  id: string;
  type: string;
  asset: string;
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

type Tab = 'deposit' | 'withdraw' | 'pnl';
type WithdrawState = 'idle' | 'processing' | 'confirmed' | 'error';

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1, 5];

export function WalletScreen() {
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const isMobile = useIsMobile();

  const [tab, setTab] = useState<Tab>('deposit');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [copied, setCopied] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawTx, setWithdrawTx] = useState('');

  const [linkedAddress, setLinkedAddress] = useState<string | null>(null);

  const [depositBonusUsed, setDepositBonusUsed] = useState<boolean | null>(null);

  useEffect(() => {
    syncProfile(); // Refresh balance on mount
    loadTransactions();
    loadLinkedWallet();
    loadDepositAddress();
    loadDepositBonusStatus();
  }, []);

  async function loadDepositAddress() {
    try {
      const info = await api.getDepositInfo('SOL');
      setTreasuryAddress(info.address);
    } catch {}
  }

  async function loadTransactions() {
    setLoading(true);
    try {
      const res = await api.getTransactions(50) as any;
      setTransactions(res.data || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  async function loadDepositBonusStatus() {
    try {
      const status = await api.getBonusStatus();
      setDepositBonusUsed(status.claimed);
    } catch {}
  }

  async function loadLinkedWallet() {
    try {
      const linked = await apiFetch<any[]>('/v1/wallet/linked').catch(() => []);
      if (Array.isArray(linked) && linked.length > 0) {
        setLinkedAddress(linked[0].address);
        setWithdrawDest(linked[0].address);
      }
    } catch {}
  }


  async function handleWithdraw() {
    setWithdrawError('');
    setWithdrawTx('');
    const lamports = solToLamports(parseFloat(withdrawAmount));
    if (lamports < 10_000_000) {
      setWithdrawError('Minimum withdrawal is 0.01 SOL');
      return;
    }
    if (!withdrawDest || withdrawDest.length < 32) {
      setWithdrawError('Enter a valid Solana address');
      return;
    }
    try {
      setWithdrawState('processing');
      const result = await api.requestWithdrawal({
        asset: 'SOL',
        amount: String(lamports),
        destination: withdrawDest,
      });
      setWithdrawTx(result.txHash || '');
      setWithdrawState('confirmed');
      await syncProfile();
      await loadTransactions();
      setTimeout(() => setWithdrawState('idle'), 3000);
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal failed');
      setWithdrawState('error');
    }
  }


  function formatTxType(type: string) {
    switch (type) {
      case 'bet_lock': return 'Bet Placed';
      case 'bet_unlock': return 'Refund';
      case 'bet_settle': return 'Settled';
      case 'payout_credit': return 'Won';
      case 'admin_adjustment': return 'Credit';
      case 'deposit_confirmed': return 'Deposit';
      case 'withdraw_complete': return 'Withdraw';
      case 'rakeback_credit': return 'Rakeback';
      case 'signup_bonus': return 'Bonus';
      default: return type.replace(/_/g, ' ');
    }
  }

  function txColor(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock', 'signup_bonus'].includes(type)) return '#00E701';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '#FF3333';
    return theme.text.secondary;
  }

  function txSign(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock', 'signup_bonus'].includes(type)) return '+';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '-';
    return '';
  }

  function txIcon(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock', 'signup_bonus'].includes(type)) {
      return (
        <div style={{ ...s.txIconCircle, background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E701" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 15 12 9 18 15" /></svg>
        </div>
      );
    }
    return (
      <div style={{ ...s.txIconCircle, background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF3333" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
    );
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div style={s.root}>
      <PageHeader title="Wallet" subtitle="Deposit, withdraw, and track your balance" icon={<WalletIcon size={20} color={theme.accent.purple} />} />
      <div style={isMobile ? s.twoColMobile : s.twoCol}>
        {/* ── Left Column: Balance + Deposit/Withdraw ── */}
        <div style={isMobile ? s.leftColMobile : s.leftCol}>

          {/* ── Balance Hero ── */}
          <div style={s.balanceCard}>
            <div style={s.balanceTop}>
              <div style={s.balanceLabelRow}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: 28, height: 28 }} />
                <span style={s.balanceLabel}>Total Balance</span>
              </div>
              <div style={{ ...s.balanceValue, background: theme.gradient.primary, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} className="mono">
                {formatSol(profile.balance, 4)}
                <span style={{ ...s.balanceSuffix, WebkitTextFillColor: theme.text.muted, background: 'none' }}>SOL</span>
              </div>
            </div>
            {/* Balance breakdown */}
            <div style={{ display: 'flex', gap: theme.gap.lg, marginTop: theme.gap.sm, padding: `${theme.gap.sm}px 0`, borderTop: `1px solid ${theme.border.subtle}` }}>
              <div>
                <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Available</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: theme.accent.neonGreen }}>{formatSol(profile.balance, 4)} <SolIcon size="0.8em" /></div>
              </div>
              {profile.lockedBalance > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>In Play</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: theme.accent.amber }}>{formatSol(profile.lockedBalance, 4)} <SolIcon size="0.8em" /></div>
                </div>
              )}
              {profile.lockedBalance > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Total</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary }}>{formatSol(profile.balance + profile.lockedBalance, 4)} <SolIcon size="0.8em" /></div>
                </div>
              )}
            </div>
            {linkedAddress && (
              <div style={s.linkedRow}>
                <span style={s.linkedDot} />
                <span style={s.linkedText} className="mono">
                  {linkedAddress.slice(0, 6)}...{linkedAddress.slice(-4)}
                </span>
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <TabBar
            tabs={[
              { id: 'deposit', label: 'Deposit' },
              { id: 'withdraw', label: 'Withdraw' },
              { id: 'pnl', label: 'P&L' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as Tab)}
          />

          {/* ── Deposit Tab ── */}
          {tab === 'deposit' && (
            <div style={s.card}>
              <div style={s.section}>
                {/* Deposit Address */}
                <div style={s.depositAddressCard}>
                  <div style={s.depositAddressLabel}>Deposit Address</div>
                  <div style={s.depositAddressDesc}>Send SOL to this address from any wallet</div>
                  {treasuryAddress ? (
                    <>
                      <div style={s.depositAddressBox}>
                        <span style={s.depositAddressText} className="mono">{treasuryAddress}</span>
                      </div>
                      <button
                        style={{
                          ...s.copyBtn,
                          background: copied ? 'rgba(46, 204, 113, 0.1)' : theme.bg.elevated,
                          borderColor: copied ? 'rgba(46, 204, 113, 0.3)' : theme.border.medium,
                          color: copied ? '#00E701' : theme.accent.purple,
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(treasuryAddress);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? <><CheckIcon size={14} color="#00E701" /> Copied!</> : 'Copy Address'}
                      </button>
                    </>
                  ) : (
                    <div style={s.depositAddressBox}>
                      <span style={{ ...s.depositAddressText, color: theme.text.muted }} className="mono">
                        {isAuthenticated ? 'Loading...' : 'Login to see your deposit address'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Deposit guidance */}
                <div style={{ display: 'flex', gap: theme.gap.md, marginTop: theme.gap.sm, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.text.muted }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    Confirms in ~30-60 seconds
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.text.muted }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    Min: 0.01 SOL
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.text.muted }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Solana network only
                  </div>
                </div>


                {/* 100% Deposit Bonus Banner */}
                {depositBonusUsed === false && (
                  <div style={s.bonusBanner}>
                    <div style={s.bonusBannerHeader}>
                      <GiftIcon size={18} color="#00E701" />
                      <span style={{ ...s.bonusBannerTitle, color: '#00E701' }}>100% First Deposit Bonus</span>
                    </div>
                    <div style={s.bonusBannerDesc}>
                      Deposit any amount and we'll <strong style={{ color: theme.accent.purple }}>double it</strong>. Your first deposit gets matched 100% — deposit 1 SOL, play with 2 SOL!
                    </div>
                  </div>
                )}

                <div style={s.howItWorks}>
                  <div style={s.howTitle}>How it works</div>
                  {['Send SOL to your deposit address from any wallet', 'Balance updates automatically — no manual verification', depositBonusUsed === false ? 'First deposit doubled with 100% bonus!' : 'Bets placed instantly from balance — no wallet popups'].map((text, i) => (
                    <div key={i} style={s.howStep}>
                      <span style={s.howNum}>{i + 1}</span>
                      <span style={s.howText}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Withdraw Tab ── */}
          {tab === 'withdraw' && (
            <div style={s.card}>
              <div style={s.section}>
                <div style={s.fieldLabel}>Amount</div>
                <div style={s.amountInputRow}>
                  <input
                    type="number" step="0.01" min="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    style={s.amountInput} className="mono" placeholder="0.00"
                  />
                  <span style={s.amountSuffix}>SOL</span>
                </div>

                <div style={s.quickRow}>
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      style={withdrawAmount === String(amt) ? s.quickBtnActive : s.quickBtn}
                      onClick={() => setWithdrawAmount(String(amt))}
                    >
                      {amt}
                    </button>
                  ))}
                  <button
                    style={s.quickBtn}
                    onClick={() => {
                      const max = profile.balance / 1_000_000_000;
                      setWithdrawAmount(String(Math.floor(max * 100) / 100));
                    }}
                  >
                    MAX
                  </button>
                </div>

                <div style={s.fieldLabel}>Destination Address</div>
                <input
                  type="text" value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  style={s.textInput} className="mono"
                  placeholder="Solana wallet address"
                />


                <div style={s.infoRow}>
                  <span style={s.infoDot}>i</span>
                  <span style={s.infoText}>Min withdrawal: 0.01 SOL. Network fees may apply.</span>
                </div>

                <button
                  style={{ ...s.withdrawBtn, opacity: withdrawState === 'processing' ? 0.6 : 1 }}
                  onClick={handleWithdraw}
                  disabled={withdrawState === 'processing'}
                >
                  {withdrawState === 'idle' || withdrawState === 'error'
                    ? 'Withdraw'
                    : withdrawState === 'processing' ? 'Processing...'
                    : 'Withdrawal Confirmed'}
                </button>

                {withdrawState === 'confirmed' && (
                  <div style={s.successMsg}>Sent!{withdrawTx && ` Tx: ${withdrawTx.slice(0, 12)}...`}</div>
                )}
                {withdrawError && <div style={s.errorMsg}>{withdrawError}</div>}
              </div>
            </div>
          )}

          {/* ── P&L Tab ── */}
          {tab === 'pnl' && <PnlChart />}

          {/* ── Promo Code ── */}
          <PromoCodeSection />

          {/* ── Send Tip ── */}
          <TipSection />
        </div>

        {/* ── Right Column: Transaction History ── */}
        <div style={s.rightCol}>
          <div style={s.historyCard}>
            <div style={s.historyHeader}>
              <span style={s.historyTitle}>Transactions</span>
              <span style={s.historyCount} className="mono">{transactions.length}</span>
            </div>
            <div style={s.historyList}>
              {loading ? (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '8px', background: theme.bg.elevated, animation: 'pulse 1.5s infinite' }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
                        <div style={{ width: 80, height: 12, borderRadius: 4, background: theme.bg.elevated, animation: 'pulse 1.5s infinite' }} />
                        <div style={{ width: 50, height: 10, borderRadius: 4, background: theme.bg.tertiary, animation: 'pulse 1.5s infinite' }} />
                      </div>
                      <div style={{ width: 60, height: 12, borderRadius: 4, background: theme.bg.elevated, animation: 'pulse 1.5s infinite' }} />
                    </div>
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div style={s.emptyState}>
                  <WalletIcon size={32} color={theme.text.muted} />
                  <span style={s.emptyTitle}>No Transactions Yet</span>
                  <span style={s.emptyDesc}>Deposit SOL to get started</span>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} style={s.txRow}>
                    {txIcon(tx.type)}
                    <div style={s.txLeft}>
                      <span style={{ ...s.txType, color: txColor(tx.type) }}>{formatTxType(tx.type)}</span>
                      <span style={s.txDate}>{timeAgo(tx.createdAt)}</span>
                    </div>
                    <div style={s.txRight}>
                      <span style={{ ...s.txAmount, color: txColor(tx.type) }} className="mono">
                        {txSign(tx.type)}{formatSol(Math.abs(Number(tx.amount)), 4)}
                      </span>
                      <span style={s.txBalance} className="mono">
                        Bal: {formatSol(Number(tx.balanceAfter), 2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PnlChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<Array<{ date: string; balance: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getPnlHistory();
        setData(res.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const values = data.map(d => d.balance / 1e9);
    const minV = Math.min(...values) * 0.95;
    const maxV = Math.max(...values) * 1.05;
    const range = maxV - minV || 1;
    const startVal = values[0];

    const padX = 40;
    const padY = 20;
    const chartW = w - padX - 10;
    const chartH = h - padY * 2;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padY + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(w - 10, y); ctx.stroke();
      const val = maxV - (range / 4) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), padX - 4, y + 4);
    }

    // Line path
    const points: [number, number][] = values.map((v, i) => {
      const x = padX + (i / (values.length - 1)) * chartW;
      const y = padY + (1 - (v - minV) / range) * chartH;
      return [x, y];
    });

    // Fill
    const startY = padY + (1 - (startVal - minV) / range) * chartH;
    ctx.beginPath();
    ctx.moveTo(points[0][0], startY);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], startY);
    ctx.closePath();

    const lastVal = values[values.length - 1];
    const isUp = lastVal >= startVal;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isUp) {
      grad.addColorStop(0, 'rgba(52,211,153,0.2)');
      grad.addColorStop(1, 'rgba(52,211,153,0)');
    } else {
      grad.addColorStop(0, 'rgba(248,113,113,0.2)');
      grad.addColorStop(1, 'rgba(248,113,113,0)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.strokeStyle = isUp ? '#00E701' : '#FF3333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Start line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, startY);
    ctx.lineTo(w - 10, startY);
    ctx.stroke();
    ctx.setLineDash([]);

  }, [data]);

  return (
    <div style={s.card}>
      <div style={s.section}>
        <div style={s.fieldLabel}>Balance Over Time</div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: theme.text.muted }}>Loading...</div>
        ) : data.length < 2 ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: theme.text.muted, fontSize: '14px' }}>
            Play more rounds to see your P&L chart
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '220px', borderRadius: '8px', background: theme.bg.tertiary }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Promo Code Section ──────────────────────────────────────────────────────

function PromoCodeSection() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const syncProfile = useGameStore((s) => s.syncProfile);

  const handleRedeem = async () => {
    if (!code.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      const res = await api.redeemBonusCode(code.trim());
      setStatus('success');
      setMessage(res.message || `Bonus applied! +${formatSol(res.amount)} SOL`);
      setCode('');
      syncProfile();
    } catch (err: any) {
      setStatus('error');
      const msg = err?.error?.message || err?.message || 'Invalid or expired code';
      setMessage(msg);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.section}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, marginBottom: 8 }}>🎁 Promo Code</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Enter code..."
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setStatus('idle'); }}
            style={{ ...s.amountInput, flex: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            className="mono"
          />
          <button
            onClick={handleRedeem}
            disabled={!code.trim() || status === 'loading'}
            style={{
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: status === 'loading' ? theme.bg.elevated : theme.accent.purple,
              border: 'none',
              borderRadius: 8,
              cursor: !code.trim() || status === 'loading' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: !code.trim() ? 0.5 : 1,
              minWidth: 80,
            }}
          >
            {status === 'loading' ? '...' : 'Redeem'}
          </button>
        </div>
        {status === 'success' && <div style={{ fontSize: 11, color: theme.accent.neonGreen, marginTop: 6 }}>{message}</div>}
        {status === 'error' && <div style={{ fontSize: 11, color: theme.accent.red, marginTop: 6 }}>{message}</div>}
      </div>
    </div>
  );
}

// ─── Tip Section ─────────────────────────────────────────────────────────────

function TipSection() {
  const [toUsername, setToUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const syncProfile = useGameStore((s) => s.syncProfile);

  const handleSend = async () => {
    if (status === 'idle') {
      if (!toUsername.trim() || !amount.trim() || parseFloat(amount) <= 0) return;
      setStatus('confirm');
      return;
    }
    if (status !== 'confirm') return;
    setStatus('loading');
    try {
      const lamports = Math.round(parseFloat(amount) * 1_000_000_000);
      const res = await apiFetch<{ success: boolean }>('/v1/wallet/tip', {
        method: 'POST',
        body: JSON.stringify({ toUsername: toUsername.trim(), amount: lamports }),
      });
      setStatus('success');
      setMessage(`Sent ${amount} SOL to @${toUsername}`);
      setToUsername('');
      setAmount('');
      syncProfile();
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.error?.message || err?.message || 'Failed to send tip');
    }
  };

  const cancel = () => { setStatus('idle'); setMessage(''); };

  return (
    <div style={s.card}>
      <div style={s.section}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, marginBottom: 8 }}>💎 Send Tip</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            placeholder="Username"
            value={toUsername}
            onChange={e => { setToUsername(e.target.value); setStatus('idle'); }}
            style={s.amountInput}
            disabled={status === 'loading' || status === 'confirm'}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              step="0.001"
              min="0.001"
              max="10"
              placeholder="Amount (SOL)"
              value={amount}
              onChange={e => { setAmount(e.target.value); setStatus('idle'); }}
              style={{ ...s.amountInput, flex: 1 }}
              className="mono"
              disabled={status === 'loading' || status === 'confirm'}
            />
            {status === 'confirm' ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={handleSend} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#fff', background: theme.accent.neonGreen, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm</button>
                <button onClick={cancel} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: theme.text.muted, background: theme.bg.elevated, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={!toUsername.trim() || !amount.trim() || status === 'loading'}
                style={{
                  padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#fff',
                  background: status === 'loading' ? theme.bg.elevated : theme.accent.purple,
                  border: 'none', borderRadius: 8,
                  cursor: !toUsername.trim() || !amount.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: !toUsername.trim() || !amount.trim() ? 0.5 : 1, minWidth: 80,
                }}
              >
                {status === 'loading' ? '...' : 'Send'}
              </button>
            )}
          </div>
        </div>
        {status === 'confirm' && <div style={{ fontSize: 11, color: theme.accent.amber, marginTop: 6 }}>Send {amount} SOL to @{toUsername}?</div>}
        {status === 'success' && <div style={{ fontSize: 11, color: theme.accent.neonGreen, marginTop: 6 }}>{message}</div>}
        {status === 'error' && <div style={{ fontSize: 11, color: theme.accent.red, marginTop: 6 }}>{message}</div>}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    minHeight: '100%',
    boxSizing: 'border-box' as const,
    maxWidth: '1100px',
    margin: '0 auto',
    width: '100%',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '420px 1fr',
    gap: '16px',
    flex: 1,
    minHeight: 0,
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  twoColMobile: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    flex: 1,
  },
  leftColMobile: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    maxWidth: '480px',
    margin: '0 auto',
    width: '100%',
  },

  // Balance Card
  balanceCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    padding: '20px',
  },
  balanceTop: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  balanceLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  balanceLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
    letterSpacing: '-0.5px',
  },
  balanceSuffix: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.text.muted,
    marginLeft: '8px',
    verticalAlign: 'middle',
  },
  linkedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: `1px solid ${theme.border.subtle}`,
  },
  linkedDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#00E701',
    display: 'inline-block',
  },
  linkedText: {
    fontSize: '13px',
    color: theme.text.muted,
  },

  // Tabs
  tabBar: {
    display: 'flex',
    gap: '2px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    padding: '3px',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: theme.text.muted,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tabActive: {
    flex: 1,
    padding: '10px 0',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // Card
  card: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    padding: '16px',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // Amount Input
  amountInputRow: {
    display: 'flex',
    alignItems: 'center',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    padding: '0 14px',
  },
  amountInput: {
    flex: 1,
    padding: '12px 0',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '20px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    width: '100%',
  },
  amountSuffix: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.muted,
    flexShrink: 0,
  },

  // Quick Amounts
  quickRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  quickBtn: {
    padding: '6px 14px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.secondary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.15s',
  },
  quickBtnActive: {
    padding: '6px 14px',
    background: 'rgba(139, 92, 246, 0.1)',
    border: `1px solid ${theme.border.accent}`,
    borderRadius: '6px',
    color: theme.accent.purple,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },

  // Buttons
  primaryBtn: {
    padding: '14px',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '4px',
    transition: 'opacity 0.15s',
  },
  withdrawBtn: {
    padding: '14px',
    background: theme.danger,
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '4px',
    transition: 'opacity 0.15s',
  },
  linkBtn: {
    padding: '10px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '6px',
    color: theme.accent.purple,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center' as const,
  },
  copyBtn: {
    padding: '10px',
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },

  // Info
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  infoDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: theme.bg.elevated,
    color: theme.accent.purple,
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    fontSize: '12px',
    color: theme.text.muted,
    lineHeight: 1.4,
  },

  // Text Input
  textInput: {
    width: '100%',
    padding: '12px 14px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },

  // Deposit Address
  depositAddressCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '16px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
  },
  depositAddressLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  depositAddressDesc: {
    fontSize: '13px',
    color: theme.text.muted,
  },
  depositAddressBox: {
    padding: '10px 12px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    wordBreak: 'break-all' as const,
  },
  depositAddressText: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.secondary,
    lineHeight: 1.5,
  },
  depositDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '4px 0',
  },
  depositDividerLine: {
    flex: 1,
    height: '1px',
    background: theme.border.subtle,
  },
  depositDividerText: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
    whiteSpace: 'nowrap' as const,
  },

  // How It Works
  howItWorks: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '14px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    marginTop: '4px',
  },
  howTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  howStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  howNum: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: theme.bg.elevated,
    color: theme.accent.purple,
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '1px',
  },
  howText: {
    fontSize: '13px',
    color: theme.text.muted,
    lineHeight: 1.4,
  },

  // Messages
  successMsg: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#00E701',
    textAlign: 'center' as const,
  },
  errorMsg: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#FF3333',
    textAlign: 'center' as const,
  },

  // Transaction History
  historyCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: theme.bg.tertiary,
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  historyTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  historyCount: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.accent.purple,
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.subtle}`,
    padding: '2px 10px',
    borderRadius: '12px',
  },
  historyList: {
    flex: 1,
    overflow: 'auto',
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    transition: 'background 0.1s',
  },
  txIconCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  txType: {
    fontSize: '14px',
    fontWeight: 600,
  },
  txDate: {
    fontSize: '12px',
    color: theme.text.muted,
  },
  txRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '2px',
  },
  txAmount: {
    fontSize: '14px',
    fontWeight: 700,
  },
  txBalance: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  txBadge: {
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.secondary,
    marginTop: '4px',
  },
  emptyDesc: {
    fontSize: '13px',
    color: theme.text.muted,
  },

  // Bonus Banner
  bonusBanner: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '14px',
    background: 'rgba(139, 92, 246, 0.04)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderRadius: '8px',
  },
  bonusBannerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bonusBannerTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#8b5cf6',
  },
  bonusBannerDesc: {
    fontSize: '13px',
    color: theme.text.muted,
    lineHeight: 1.5,
  },
  bonusProgressWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  bonusProgressBar: {
    height: '4px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  bonusProgressFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${theme.accent.purple}, ${theme.accent.purple})`,
    borderRadius: '2px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  bonusProgressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: 600,
  },
  bonusUnlockedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 14px',
    background: 'rgba(46, 204, 113, 0.04)',
    border: '1px solid rgba(46, 204, 113, 0.15)',
    borderRadius: '8px',
  },
  bonusUnlockedText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#00E701',
  },
};
