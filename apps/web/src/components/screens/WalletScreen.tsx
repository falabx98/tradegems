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

  useEffect(() => {
    loadTransactions();
    loadLinkedWallet();
    loadDepositAddress();
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
      default: return type.replace(/_/g, ' ');
    }
  }

  function txColor(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock'].includes(type)) return '#34d399';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '#f87171';
    return theme.text.secondary;
  }

  function txSign(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock'].includes(type)) return '+';
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return '-';
    return '';
  }

  return (
    <div style={s.root}>
      {/* ── Balance Hero ── */}
      <div style={s.balanceCard}>
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
      <div style={s.tabBar}>
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
        <div style={s.card}>

          <div style={s.section}>
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

              {isPhantomInstalled() ? (
                <button
                  style={{
                    ...s.primaryBtn,
                    opacity: depositState === 'sending' || depositState === 'verifying' ? 0.7 : 1,
                  }}
                  onClick={handleDeposit}
                  disabled={depositState === 'sending' || depositState === 'verifying'}
                >
                  {depositState === 'idle' || depositState === 'error'
                    ? 'Deposit with Phantom'
                    : depositState === 'sending'
                    ? 'Approve in Phantom...'
                    : depositState === 'verifying'
                    ? 'Confirming on-chain...'
                    : 'Deposit Confirmed!'}
                </button>
              ) : (
                <a
                  href="https://phantom.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.installPhantomLink}
                >
                  Install Phantom Wallet to deposit
                </a>
              )}

              {depositState === 'confirmed' && <div style={s.successMsg}>Deposit confirmed and credited!</div>}
              {depositError && <div style={s.errorMsg}>{depositError}</div>}

              {/* How it works info */}
              <div style={s.howItWorks}>
                <div style={s.howTitle}>How it works</div>
                <div style={s.howStep}>
                  <span style={s.howNum}>1</span>
                  <span style={s.howText}>Deposit SOL from your Phantom wallet</span>
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
        <div style={s.card}>
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

            <button
              className="btn-3d btn-3d-danger"
              style={{
                padding: '14px',
                fontSize: '14px',
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
      <div style={s.historyCard}>
        <div style={s.historyHeader}>
          <span style={s.historyTitle}>Transactions</span>
          <span style={s.historyCount} className="mono">{transactions.length}</span>
        </div>
        <div style={s.historyList}>
          {loading ? (
            <div style={s.emptyState}>Loading...</div>
          ) : transactions.length === 0 ? (
            <div style={s.emptyState}>No transactions yet</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} style={s.txRow}>
                <div style={s.txLeft}>
                  <span style={{ ...s.txBadge, color: txColor(tx.type) }}>
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
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16162a 100%)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
    borderRadius: '16px',
    padding: '24px',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#8888a0',
    marginBottom: '6px',
  },
  balanceValue: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
    letterSpacing: '-0.5px',
  },
  balanceSuffix: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#8888a0',
    marginLeft: '8px',
    verticalAlign: 'middle',
  },
  solBadge: {
    width: '48px',
    height: '48px',
    background: 'rgba(153, 69, 255, 0.1)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  linkedText: {
    fontSize: '12px',
    color: '#6b6b8a',
  },

  // ── Tabs ──
  tabBar: {
    display: 'flex',
    gap: '4px',
    background: '#13131f',
    borderRadius: '12px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    color: '#6b6b8a',
    fontSize: '14px',
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
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Card ──
  card: {
    background: '#151522',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '14px',
    padding: '20px',
  },

  // ── Section ──
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  fieldLabel: {
    fontSize: '12px',
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
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    width: '100%',
  },
  amountSuffix: {
    fontSize: '13px',
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
    fontSize: '12px',
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
    fontSize: '12px',
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
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    fontSize: '11px',
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
    fontSize: '12px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },

  // ── Primary Button ──
  primaryBtn: {
    padding: '14px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '4px',
    transition: 'opacity 0.15s',
  },

  // ── Link Wallet ──
  linkBtn: {
    padding: '10px',
    background: 'rgba(153, 69, 255, 0.08)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center' as const,
  },

  // ── Install Link ──
  installPhantomLink: {
    display: 'block',
    padding: '14px',
    background: 'rgba(139, 139, 245, 0.1)',
    border: '1px solid rgba(139, 139, 245, 0.2)',
    borderRadius: '10px',
    color: '#8b8bf5',
    fontSize: '14px',
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
    background: 'rgba(153, 69, 255, 0.04)',
    border: '1px solid rgba(153, 69, 255, 0.1)',
    borderRadius: '10px',
    marginTop: '4px',
  },
  howTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#8888a0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
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
    background: 'rgba(153, 69, 255, 0.15)',
    color: '#c084fc',
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '1px',
  },
  howText: {
    fontSize: '12px',
    color: '#8888a0',
    lineHeight: 1.4,
  },

  // ── Messages ──
  successMsg: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#34d399',
    textAlign: 'center' as const,
  },
  errorMsg: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#f87171',
    textAlign: 'center' as const,
  },

  // ── Transaction History ──
  historyCard: {
    background: '#151522',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '14px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  historyTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#ececef',
  },
  historyCount: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b6b8a',
    background: 'rgba(255,255,255,0.04)',
    padding: '2px 10px',
    borderRadius: '20px',
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
    fontSize: '13px',
    fontWeight: 700,
  },
  txDate: {
    fontSize: '11px',
    color: '#555570',
  },
  txAmount: {
    fontSize: '14px',
    fontWeight: 700,
  },
  emptyState: {
    padding: '32px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: '#555570',
  },
};
