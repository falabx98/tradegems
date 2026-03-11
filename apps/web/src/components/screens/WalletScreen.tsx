import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../utils/api';
import { formatSol, solToLamports } from '../../utils/sol';
import { isPhantomInstalled, connectPhantom, sendSolToTreasury, getConnectedAddress } from '../../utils/phantom';
import { theme } from '../../styles/theme';

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

type Tab = 'deposit' | 'withdraw';
type DepositState = 'idle' | 'sending' | 'verifying' | 'confirmed' | 'error';
type WithdrawState = 'idle' | 'processing' | 'confirmed' | 'error';

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1, 5];

export function WalletScreen() {
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const walletAddress = useAuthStore((s) => s.walletAddress);

  const [tab, setTab] = useState<Tab>('deposit');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Deposit address
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [copied, setCopied] = useState(false);

  // Phantom quick-send
  const [depositAmount, setDepositAmount] = useState('0.1');
  const [depositState, setDepositState] = useState<DepositState>('idle');
  const [depositError, setDepositError] = useState('');

  // Withdraw
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawTx, setWithdrawTx] = useState('');

  const [linkedAddress, setLinkedAddress] = useState<string | null>(walletAddress);

  // Bonus status
  const [bonusStatus, setBonusStatus] = useState<{
    claimed: boolean;
    bonusAmount: number;
    profitRequired: number;
    currentProfit: number;
    withdrawalUnlocked: boolean;
  } | null>(null);

  useEffect(() => {
    loadTransactions();
    loadLinkedWallet();
    loadDepositAddress();
    loadBonusStatus();
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

  async function loadBonusStatus() {
    try {
      const status = await api.getBonusStatus();
      setBonusStatus(status);
    } catch {}
  }

  async function loadLinkedWallet() {
    try {
      const token = localStorage.getItem('accessToken');
      const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
      const linked = await fetch(`${baseUrl}/v1/wallet/linked`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      }).then(r => r.json()).catch(() => []);
      if (Array.isArray(linked) && linked.length > 0) {
        setLinkedAddress(linked[0].address);
        setWithdrawDest(linked[0].address);
      }
    } catch {}
  }


  async function handleDeposit() {
    setDepositError('');
    const lamports = solToLamports(parseFloat(depositAmount));
    if (lamports < 10_000_000) {
      setDepositError('Minimum deposit is 0.01 SOL');
      return;
    }
    try {
      setDepositState('sending');
      let addr = getConnectedAddress();
      if (!addr) addr = await connectPhantom();
      const treasury = treasuryAddress || (await api.getDepositInfo('SOL')).address;
      const txHash = await sendSolToTreasury(treasury, lamports);
      setDepositState('verifying');
      await api.verifyDeposit(txHash);
      setDepositState('confirmed');
      await syncProfile();
      await loadTransactions();
      setTimeout(() => setDepositState('idle'), 3000);
    } catch (err: any) {
      setDepositError(err.message || 'Deposit failed');
      setDepositState('error');
    }
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

  async function handleLinkWallet() {
    try {
      const addr = await connectPhantom();
      await api.linkWallet(addr);
      setLinkedAddress(addr);
      setWithdrawDest(addr);
    } catch {}
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
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock', 'signup_bonus'].includes(type)) return '#34d399';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '#f87171';
    return theme.text.secondary;
  }

  function txSign(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock', 'signup_bonus'].includes(type)) return '+';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '-';
    return '';
  }

  return (
    <div style={s.root}>
      {/* ── Balance Hero ── */}
      <div style={s.balanceCard} className="gradient-border card-enter card-enter-1">
        <div style={s.balanceRow}>
          <div>
            <div style={s.balanceLabel}>Total Balance</div>
            <div style={s.balanceValue} className="mono">
              {formatSol(profile.balance, 4)}
              <span style={s.balanceSuffix}>SOL</span>
            </div>
          </div>
          <div style={s.solBadge}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: 36, height: 36 }} />
          </div>
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
      <div style={s.tabBar} className="card-enter card-enter-2">
        <button
          style={tab === 'deposit' ? s.tabActive : s.tab}
          onClick={() => setTab('deposit')}
        >
          Deposit
        </button>
        <button
          style={tab === 'withdraw' ? s.tabActive : s.tab}
          onClick={() => setTab('withdraw')}
        >
          Withdraw
        </button>
      </div>

      {/* ── Deposit Tab ── */}
      {tab === 'deposit' && (
        <div style={s.card} className="card-enter card-enter-3">

          <div style={s.section}>
              {/* ── Deposit Address Card ── */}
              <div style={s.depositAddressCard}>
                <div style={s.depositAddressLabel}>Your Deposit Address</div>
                <div style={s.depositAddressDesc}>
                  Send SOL to this address from any wallet
                </div>
                {treasuryAddress ? (
                  <>
                    <div style={s.depositAddressBox}>
                      <span style={s.depositAddressText} className="mono">
                        {treasuryAddress}
                      </span>
                    </div>
                    <button
                      style={{
                        ...s.copyBtn,
                        background: copied ? 'rgba(52, 211, 153, 0.15)' : 'rgba(153, 69, 255, 0.12)',
                        borderColor: copied ? 'rgba(52, 211, 153, 0.3)' : 'rgba(153, 69, 255, 0.3)',
                        color: copied ? '#34d399' : '#c084fc',
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(treasuryAddress);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? '✓ Copied!' : 'Copy Address'}
                    </button>
                  </>
                ) : (
                  <div style={s.depositAddressBox}>
                    <span style={{ ...s.depositAddressText, color: '#555570' }} className="mono">
                      Loading address...
                    </span>
                  </div>
                )}
              </div>

              {/* ── Divider ── */}
              <div style={s.depositDivider}>
                <div style={s.depositDividerLine} />
                <span style={s.depositDividerText}>or quick deposit</span>
                <div style={s.depositDividerLine} />
              </div>

              <div style={s.fieldLabel}>Amount</div>
              <div style={s.amountInputRow}>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  style={s.amountInput}
                  className="mono"
                  placeholder="0.00"
                />
                <span style={s.amountSuffix}>SOL</span>
              </div>

              {/* Quick amounts */}
              <div style={s.quickRow}>
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    style={depositAmount === String(amt) ? s.quickBtnActive : s.quickBtn}
                    onClick={() => setDepositAmount(String(amt))}
                  >
                    {amt}
                  </button>
                ))}
              </div>

              <button
                style={{
                  ...s.primaryBtn,
                  opacity: depositState === 'sending' || depositState === 'verifying' ? 0.7 : 1,
                }}
                onClick={handleDeposit}
                disabled={depositState === 'sending' || depositState === 'verifying'}
              >
                {depositState === 'idle' || depositState === 'error'
                  ? 'Connect Wallet for One-Click Deposit'
                  : depositState === 'sending'
                  ? 'Approve in Wallet...'
                  : depositState === 'verifying'
                  ? 'Confirming on-chain...'
                  : 'Deposit Confirmed!'}
              </button>

              {depositState === 'confirmed' && <div style={s.successMsg}>Deposit confirmed and credited!</div>}
              {depositError && <div style={s.errorMsg}>{depositError}</div>}

              {/* How it works info */}
              <div style={s.howItWorks}>
                <div style={s.howTitle}>How it works</div>
                <div style={s.howStep}>
                  <span style={s.howNum}>1</span>
                  <span style={s.howText}>Send SOL to your deposit address from any Solana wallet</span>
                </div>
                <div style={s.howStep}>
                  <span style={s.howNum}>2</span>
                  <span style={s.howText}>Your balance updates automatically — no manual verification needed</span>
                </div>
                <div style={s.howStep}>
                  <span style={s.howNum}>3</span>
                  <span style={s.howText}>Bets are placed instantly from your balance — no wallet popups per round</span>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* ── Withdraw Tab ── */}
      {tab === 'withdraw' && (
        <div style={s.card} className="card-enter card-enter-3">
          <div style={s.section}>
            <div style={s.fieldLabel}>Amount</div>
            <div style={s.amountInputRow}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                style={s.amountInput}
                className="mono"
                placeholder="0.00"
              />
              <span style={s.amountSuffix}>SOL</span>
            </div>

            {/* Quick amounts */}
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
              type="text"
              value={withdrawDest}
              onChange={(e) => setWithdrawDest(e.target.value)}
              style={s.textInput}
              className="mono"
              placeholder="Solana wallet address"
            />

            {!linkedAddress && isPhantomInstalled() && (
              <button style={s.linkBtn} onClick={handleLinkWallet}>
                Connect Phantom wallet
              </button>
            )}

            <div style={s.infoRow}>
              <span style={s.infoDot}>i</span>
              <span style={s.infoText}>Min withdrawal: 0.01 SOL. Network fees may apply.</span>
            </div>

            {/* Bonus lock info banner */}
            {bonusStatus && bonusStatus.claimed && !bonusStatus.withdrawalUnlocked && (
              <div style={s.bonusBanner}>
                <div style={s.bonusBannerHeader}>
                  <span style={s.bonusBannerIcon}>🔒</span>
                  <span style={s.bonusBannerTitle}>Welcome Bonus Locked</span>
                </div>
                <div style={s.bonusBannerDesc}>
                  Your <strong style={{ color: '#14F195' }}>1 SOL</strong> welcome bonus is not withdrawable yet. You need to earn <strong style={{ color: '#14F195' }}>1 SOL</strong> in net profit to unlock it.
                </div>
                <div style={s.bonusProgressWrap}>
                  <div style={s.bonusProgressBar}>
                    <div style={{
                      ...s.bonusProgressFill,
                      width: `${Math.max(0, Math.min(100, (bonusStatus.currentProfit / bonusStatus.profitRequired) * 100))}%`,
                    }} />
                  </div>
                  <div style={s.bonusProgressLabels}>
                    <span className="mono" style={{ color: bonusStatus.currentProfit >= 0 ? '#34d399' : '#f87171' }}>
                      {(bonusStatus.currentProfit / 1_000_000_000).toFixed(4)} SOL
                    </span>
                    <span className="mono" style={{ color: '#8888a0' }}>
                      / {(bonusStatus.profitRequired / 1_000_000_000).toFixed(1)} SOL
                    </span>
                  </div>
                </div>
                <div style={s.bonusTerms}>
                  <div style={s.bonusTermTitle}>Terms</div>
                  <ul style={s.bonusTermList}>
                    <li>The 1 SOL bonus is free to play with immediately</li>
                    <li>Withdrawals are restricted to deposited funds only until the profit goal is reached</li>
                    <li>Once you reach 1 SOL net profit, the bonus + all earnings become fully withdrawable</li>
                    <li>Net profit = total winnings - total wagered</li>
                  </ul>
                </div>
              </div>
            )}

            {bonusStatus && bonusStatus.claimed && bonusStatus.withdrawalUnlocked && (
              <div style={s.bonusUnlockedBanner}>
                <span style={{ fontSize: '18px' }}>🎉</span>
                <span style={s.bonusUnlockedText}>
                  Bonus unlocked! Your full balance is withdrawable.
                </span>
              </div>
            )}

            <button
              className="btn-3d btn-3d-danger"
              style={{
                padding: '14px',
                fontSize: '16px',
                width: '100%',
                marginTop: '4px',
                opacity: withdrawState === 'processing' ? 0.7 : 1,
              }}
              onClick={handleWithdraw}
              disabled={withdrawState === 'processing'}
            >
              {withdrawState === 'idle' || withdrawState === 'error'
                ? 'Withdraw'
                : withdrawState === 'processing'
                ? 'Processing...'
                : 'Withdrawal Confirmed'}
            </button>

            {withdrawState === 'confirmed' && (
              <div style={s.successMsg}>
                Sent!{withdrawTx && ` Tx: ${withdrawTx.slice(0, 12)}...`}
              </div>
            )}
            {withdrawError && <div style={s.errorMsg}>{withdrawError}</div>}
          </div>
        </div>
      )}

      {/* ── Transaction History ── */}
      <div style={s.historyCard} className="card-enter card-enter-4">
        <div style={s.historyHeader}>
          <span style={s.historyTitle}>Transactions</span>
          <span style={s.historyCount} className="mono">{transactions.length}</span>
        </div>
        <div style={s.historyList}>
          {loading ? (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 0', borderBottom: '1px solid rgba(153, 69, 255, 0.06)',
                }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(153, 69, 255, 0.08)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ width: '100px', height: '14px', borderRadius: '4px', background: 'rgba(153, 69, 255, 0.08)', animation: 'pulse 1.5s infinite' }} />
                    <div style={{ width: '60px', height: '10px', borderRadius: '4px', background: 'rgba(153, 69, 255, 0.05)', animation: 'pulse 1.5s infinite', animationDelay: '0.2s' }} />
                  </div>
                  <div style={{ width: '70px', height: '14px', borderRadius: '4px', background: 'rgba(153, 69, 255, 0.06)', animation: 'pulse 1.5s infinite', animationDelay: '0.3s' }} />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div style={s.emptyState}>No transactions yet</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} style={s.txRow} className="table-row-hover">
                <div style={s.txLeft}>
                  <span style={{ ...s.txBadge, color: txColor(tx.type) }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: txColor(tx.type), boxShadow: `0 0 6px ${txColor(tx.type)}`, display: 'inline-block', flexShrink: 0 }} />
                    {formatTxType(tx.type)}
                  </span>
                  <span style={s.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span style={{ ...s.txAmount, color: txColor(tx.type) }} className="mono">
                  {txSign(tx.type)}{formatSol(Math.abs(Number(tx.amount)), 4)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles (Shuffle.com-inspired dark casino theme) ─────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    height: '100%',
    overflow: 'auto',
    maxWidth: '480px',
    margin: '0 auto',
  },

  // ── Balance Card ──
  balanceCard: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#8888a0',
    marginBottom: '6px',
  },
  balanceValue: {
    fontSize: '34px',
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
    letterSpacing: '-0.5px',
    textShadow: '0 0 20px rgba(153, 69, 255, 0.4), 0 0 40px rgba(153, 69, 255, 0.15)',
  },
  balanceSuffix: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#8888a0',
    marginLeft: '8px',
    verticalAlign: 'middle',
  },
  solBadge: {
    width: '48px',
    height: '48px',
    background: 'rgba(153, 69, 255, 0.18)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 12px rgba(153, 69, 255, 0.2)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
  },
  linkedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
  },
  linkedDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#34d399',
    display: 'inline-block',
    boxShadow: '0 0 6px rgba(52, 211, 153, 0.5)',
  },
  linkedText: {
    fontSize: '14px',
    color: '#6b6b8a',
  },

  // ── Tabs ──
  tabBar: {
    display: 'flex',
    gap: '4px',
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '14px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    color: '#6b6b8a',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tabActive: {
    flex: 1,
    padding: '10px 0',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 0 12px rgba(153, 69, 255, 0.3)',
  },

  // ── Card ──
  card: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(153, 69, 255, 0.18)',
    borderRadius: '14px',
    padding: '20px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },

  // ── Section ──
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  fieldLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#8888a0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // ── Amount Input ──
  amountInputRow: {
    display: 'flex',
    alignItems: 'center',
    background: '#111118',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '0 14px',
  },
  amountInput: {
    flex: 1,
    padding: '14px 0',
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
    fontSize: '15px',
    fontWeight: 600,
    color: '#6b6b8a',
    flexShrink: 0,
  },

  // ── Quick Amount Pills ──
  quickRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  quickBtn: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#8888a0',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.15s',
  },
  quickBtnActive: {
    padding: '6px 14px',
    background: 'rgba(153, 69, 255, 0.12)',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },

  // ── Info ──
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  infoDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: 'rgba(153, 69, 255, 0.12)',
    color: '#9945FF',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    fontSize: '13px',
    color: '#6b6b8a',
    lineHeight: 1.4,
  },

  // ── Text Input ──
  textInput: {
    width: '100%',
    padding: '12px 14px',
    background: '#111118',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },

  // ── Primary Button ──
  primaryBtn: {
    padding: '14px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '4px',
    transition: 'opacity 0.15s',
    boxShadow: '0 4px 0 #7325d4, 0 6px 12px rgba(153, 69, 255, 0.3)',
  },

  // ── Link Wallet ──
  linkBtn: {
    padding: '10px',
    background: 'rgba(153, 69, 255, 0.08)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center' as const,
  },

  // ── Deposit Address Card ──
  depositAddressCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '18px',
    background: 'rgba(153, 69, 255, 0.06)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '12px',
  },
  depositAddressLabel: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#c084fc',
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  depositAddressDesc: {
    fontSize: '14px',
    color: '#8888a0',
    marginTop: '-4px',
  },
  depositAddressBox: {
    padding: '12px',
    background: '#111118',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    wordBreak: 'break-all' as const,
  },
  depositAddressText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#e8e8f0',
    lineHeight: 1.5,
    letterSpacing: '0.3px',
  },
  copyBtn: {
    padding: '10px',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
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
    background: 'rgba(255,255,255,0.06)',
  },
  depositDividerText: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#555570',
    whiteSpace: 'nowrap' as const,
  },

  // ── Install Link ──
  installPhantomLink: {
    display: 'block',
    padding: '14px',
    background: 'rgba(139, 139, 245, 0.1)',
    border: '1px solid rgba(139, 139, 245, 0.2)',
    borderRadius: '10px',
    color: '#8b8bf5',
    fontSize: '16px',
    fontWeight: 600,
    textAlign: 'center' as const,
    textDecoration: 'none',
    marginTop: '4px',
  },

  // ── How it works ──
  howItWorks: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '14px',
    background: 'rgba(153, 69, 255, 0.06)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
    borderRadius: '10px',
    marginTop: '4px',
    backdropFilter: 'blur(8px)',
  },
  howTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#8888a0',
    fontFamily: "'Orbitron', sans-serif",
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
    background: 'rgba(153, 69, 255, 0.2)',
    color: '#c084fc',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '1px',
    boxShadow: '0 0 8px rgba(153, 69, 255, 0.3)',
  },
  howText: {
    fontSize: '14px',
    color: '#8888a0',
    lineHeight: 1.4,
  },

  // ── Messages ──
  successMsg: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#34d399',
    textAlign: 'center' as const,
  },
  errorMsg: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f87171',
    textAlign: 'center' as const,
  },

  // ── Transaction History ──
  historyCard: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(153, 69, 255, 0.18)',
    borderRadius: '14px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'rgba(32, 24, 48, 0.95)',
    borderBottom: '1px solid rgba(153, 69, 255, 0.08)',
  },
  historyTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ececef',
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  historyCount: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.18)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    padding: '2px 10px',
    borderRadius: '20px',
    boxShadow: '0 0 8px rgba(153, 69, 255, 0.15)',
  },
  historyList: {
    flex: 1,
    overflow: 'auto',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  txLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
  },
  txBadge: {
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  txDate: {
    fontSize: '13px',
    color: '#555570',
  },
  txAmount: {
    fontSize: '16px',
    fontWeight: 700,
  },
  emptyState: {
    padding: '32px',
    textAlign: 'center' as const,
    fontSize: '15px',
    color: '#555570',
  },

  // ── Bonus Banner ──
  bonusBanner: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '14px',
    background: 'rgba(251, 191, 36, 0.06)',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    borderRadius: '10px',
  },
  bonusBannerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bonusBannerIcon: {
    fontSize: '18px',
  },
  bonusBannerTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#fbbf24',
  },
  bonusBannerDesc: {
    fontSize: '14px',
    color: '#8888a0',
    lineHeight: 1.5,
  },
  bonusProgressWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  bonusProgressBar: {
    height: '6px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  bonusProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #9945FF, #14F195)',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  bonusProgressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    fontWeight: 600,
  },
  bonusTerms: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    borderTop: '1px solid rgba(251, 191, 36, 0.1)',
    paddingTop: '10px',
    marginTop: '2px',
  },
  bonusTermTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#6b6b8a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  bonusTermList: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '13px',
    color: '#6b6b8a',
    lineHeight: 1.6,
    listStyleType: 'disc' as const,
  },
  bonusUnlockedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 14px',
    background: 'rgba(52, 211, 153, 0.08)',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    borderRadius: '10px',
  },
  bonusUnlockedText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#34d399',
  },
};
