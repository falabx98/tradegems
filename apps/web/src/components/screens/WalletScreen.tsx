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

type DepositState = 'idle' | 'sending' | 'verifying' | 'confirmed' | 'error';
type VerifyState = 'idle' | 'verifying' | 'confirmed' | 'error';
type WithdrawState = 'idle' | 'processing' | 'confirmed' | 'error';

export function WalletScreen() {
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const walletAddress = useAuthStore((s) => s.walletAddress);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Treasury address
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [addressLoading, setAddressLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Manual txHash verification
  const [manualTxHash, setManualTxHash] = useState('');
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyError, setVerifyError] = useState('');

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
    loadTreasuryAddress();
  }, []);

  async function loadTreasuryAddress() {
    setAddressLoading(true);
    try {
      const info = await api.getDepositInfo('SOL');
      setTreasuryAddress(info.address);
    } catch {} finally {
      setAddressLoading(false);
    }
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

  async function handleCopyAddress() {
    if (!treasuryAddress) return;
    try {
      await navigator.clipboard.writeText(treasuryAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleVerifyTxHash() {
    setVerifyError('');
    const hash = manualTxHash.trim();
    if (!hash || hash.length < 64) {
      setVerifyError('Enter a valid transaction hash (64+ characters)');
      return;
    }

    try {
      setVerifyState('verifying');
      const result = await api.verifyDeposit(hash);

      if (result.status === 'confirmed') {
        setVerifyState('confirmed');
        await syncProfile();
        await loadTransactions();
        setTimeout(() => {
          setVerifyState('idle');
          setManualTxHash('');
        }, 3000);
      } else {
        setVerifyError('Transaction is still confirming. Please wait and try again.');
        setVerifyState('idle');
      }
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed. Check the transaction hash.');
      setVerifyState('error');
    }
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
      case 'bet_lock': return 'Bet lock';
      case 'bet_unlock': return 'Refund';
      case 'bet_settle': return 'Settle';
      case 'payout_credit': return 'Payout';
      case 'admin_adjustment': return 'Credit';
      case 'deposit_confirmed': return 'Deposit';
      case 'withdraw_complete': return 'Withdraw';
      case 'rakeback_credit': return 'Rakeback';
      default: return type.replace(/_/g, ' ');
    }
  }

  function txColor(type: string) {
    if (['payout_credit', 'admin_adjustment', 'deposit_confirmed', 'rakeback_credit', 'bet_unlock'].includes(type)) return theme.success;
    if (['bet_lock', 'bet_settle', 'withdraw_complete'].includes(type)) return theme.danger;
    return theme.text.secondary;
  }

  return (
    <div style={styles.container}>
      {/* Balance Card */}
      <div style={styles.balanceCard}>
        <div style={styles.balanceHeader}>
          <span style={styles.balanceLabel}>Available balance</span>
          <span style={styles.balanceCurrency}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', marginRight: '5px', verticalAlign: 'middle' }} />
            SOL
          </span>
        </div>
        <div style={styles.balanceAmount} className="mono">
          {formatSol(profile.balance, 4)}
        </div>
        {linkedAddress && (
          <div style={styles.walletAddr}>
            <span style={styles.walletAddrLabel}>Linked</span>
            <span style={styles.walletAddrValue} className="mono">
              {linkedAddress.slice(0, 6)}...{linkedAddress.slice(-4)}
            </span>
          </div>
        )}
        {!linkedAddress && isPhantomInstalled() && (
          <button style={styles.linkBtn} onClick={handleLinkWallet}>
            Link Phantom wallet
          </button>
        )}
      </div>

      {/* Deposit / Withdraw Stack */}
      <div style={styles.actionsCol}>
        {/* Deposit Card */}
        <div style={styles.actionCard}>
          <div style={styles.actionHeader}>
            <span style={styles.actionTitle}>Deposit</span>
          </div>
          <div style={styles.actionBody}>
            {/* Section 1: Treasury Address */}
            <div style={styles.section}>
              <div style={styles.labelRow}>
                <span style={styles.sectionLabel}>Send SOL to this address</span>
                <span style={styles.minBadge}>Min: 0.01 SOL</span>
              </div>
              <div style={styles.addressBox}>
                {addressLoading ? (
                  <span style={styles.addressLoading}>Loading address...</span>
                ) : treasuryAddress ? (
                  <>
                    <span style={styles.addressText} className="mono">{treasuryAddress}</span>
                    <button
                      style={copied ? styles.copiedBtn : styles.copyBtn}
                      onClick={handleCopyAddress}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <>
                    <span style={styles.addressLoading}>Failed to load address</span>
                    <button style={styles.copyBtn} onClick={loadTreasuryAddress}>Retry</button>
                  </>
                )}
              </div>
              <span style={styles.sectionHint}>Send from any wallet: Phantom, Solflare, exchange, etc.</span>
            </div>

            <div style={styles.divider} />

            {/* Section 2: Verify Transaction */}
            <div style={styles.section}>
              <span style={styles.sectionLabel}>Verify your deposit</span>
              <input
                type="text"
                value={manualTxHash}
                onChange={(e) => setManualTxHash(e.target.value)}
                style={styles.txHashInput}
                className="mono"
                placeholder="Paste transaction hash..."
              />
              <button
                style={{
                  ...styles.verifyBtn,
                  opacity: verifyState === 'verifying' ? 0.6 : 1,
                }}
                onClick={handleVerifyTxHash}
                disabled={verifyState === 'verifying'}
              >
                {verifyState === 'idle' || verifyState === 'error' ? 'Verify Deposit' :
                 verifyState === 'verifying' ? 'Verifying...' : 'Confirmed!'}
              </button>
              {verifyState === 'confirmed' && <div style={styles.successMsg}>Deposit confirmed and credited!</div>}
              {verifyError && <div style={styles.errorMsg}>{verifyError}</div>}
            </div>

            {/* Section 3: Phantom Quick Send */}
            {isPhantomInstalled() && (
              <>
                <div style={styles.divider} />
                <div style={styles.section}>
                  <span style={styles.phantomLabel}>Or send directly with Phantom</span>
                  <div style={styles.phantomRow}>
                    <div style={styles.inputRow}>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        style={styles.input}
                        className="mono"
                        placeholder="0.1"
                      />
                      <span style={styles.inputSuffix}>
                        <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />
                        SOL
                      </span>
                    </div>
                    <button
                      style={{
                        ...styles.phantomBtn,
                        opacity: depositState === 'sending' || depositState === 'verifying' ? 0.6 : 1,
                      }}
                      onClick={handleDeposit}
                      disabled={depositState === 'sending' || depositState === 'verifying'}
                    >
                      {depositState === 'idle' || depositState === 'error' ? 'Send with Phantom' :
                       depositState === 'sending' ? 'Sending...' :
                       depositState === 'verifying' ? 'Verifying...' : 'Confirmed!'}
                    </button>
                  </div>
                  {depositState === 'confirmed' && <div style={styles.successMsg}>Sent and confirmed!</div>}
                  {depositError && <div style={styles.errorMsg}>{depositError}</div>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Withdraw Card */}
        <div style={styles.actionCard}>
          <div style={styles.actionHeader}>
            <span style={styles.actionTitle}>Withdraw</span>
          </div>
          <div style={styles.actionBody}>
            <div style={styles.inputRow}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                style={styles.input}
                className="mono"
                placeholder="0.1"
              />
              <span style={styles.inputSuffix}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'middle' }} />
                SOL
              </span>
            </div>
            <input
              type="text"
              value={withdrawDest}
              onChange={(e) => setWithdrawDest(e.target.value)}
              style={{ ...styles.input, width: '100%', fontSize: '11px' }}
              className="mono"
              placeholder="Destination address"
            />
            <button
              style={{
                ...styles.withdrawBtn,
                opacity: withdrawState === 'processing' ? 0.6 : 1,
              }}
              onClick={handleWithdraw}
              disabled={withdrawState === 'processing'}
            >
              {withdrawState === 'idle' || withdrawState === 'error' ? 'Withdraw' :
               withdrawState === 'processing' ? 'Processing...' : 'Confirmed'}
            </button>
            {withdrawState === 'confirmed' && (
              <div style={styles.successMsg}>Sent!{withdrawTx && ` ${withdrawTx.slice(0, 12)}...`}</div>
            )}
            {withdrawError && <div style={styles.errorMsg}>{withdrawError}</div>}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <span style={styles.panelTitle}>Transactions</span>
          <span style={styles.panelCount} className="mono">{transactions.length}</span>
        </div>
        <div style={styles.txList}>
          {loading ? (
            <div style={styles.empty}>Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div style={styles.empty}>No transactions yet. Deposit SOL to get started!</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} style={styles.txRow}>
                <div style={styles.txLeft}>
                  <span style={{ ...styles.txType, color: txColor(tx.type) }}>
                    {formatTxType(tx.type)}
                  </span>
                  <span style={styles.txDesc}>{tx.referenceType || '—'}</span>
                </div>
                <div style={styles.txRight}>
                  <span style={{ ...styles.txAmount, color: txColor(tx.type) }} className="mono">
                    {Number(tx.amount) > 0 ? '+' : ''}{formatSol(Number(tx.amount), 4)}
                  </span>
                  <span style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', height: '100%', overflow: 'auto' },
  balanceCard: { background: theme.bg.card, border: `1px solid ${theme.border.subtle}`, borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' },
  balanceHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: '12px', fontWeight: 500, color: theme.text.muted },
  balanceCurrency: { fontSize: '11px', fontWeight: 600, color: theme.accent.cyan, display: 'flex', alignItems: 'center' },
  balanceAmount: { fontSize: '36px', fontWeight: 900, color: theme.text.primary, lineHeight: 1, letterSpacing: '-1px' },
  walletAddr: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' },
  walletAddrLabel: { fontSize: '11px', fontWeight: 500, color: theme.text.muted },
  walletAddrValue: { fontSize: '11px', color: theme.text.secondary },
  linkBtn: { marginTop: '8px', padding: '8px 16px', background: 'rgba(139, 139, 245, 0.08)', border: '1px solid rgba(139, 139, 245, 0.15)', borderRadius: '6px', color: theme.accent.purple, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start' },

  // Layout
  actionsCol: { display: 'flex', flexDirection: 'column', gap: '12px' },
  actionCard: { background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: '8px', overflow: 'hidden' },
  actionHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${theme.border.subtle}`, background: theme.bg.tertiary },
  actionTitle: { fontSize: '13px', fontWeight: 600, color: theme.text.secondary },
  actionBody: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },

  // Sections
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: '12px', fontWeight: 600, color: theme.text.secondary },
  sectionHint: { fontSize: '11px', color: theme.text.muted },
  minBadge: { fontSize: '10px', fontWeight: 600, color: theme.warning, padding: '2px 8px', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.12)', borderRadius: '4px' },
  divider: { height: '1px', background: theme.border.subtle, margin: '4px 0' },

  // Treasury address
  addressBox: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${theme.border.medium}`, borderRadius: '8px' },
  addressText: { flex: 1, fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: theme.text.primary, wordBreak: 'break-all' as const, lineHeight: 1.4 },
  addressLoading: { flex: 1, fontSize: '12px', color: theme.text.muted },
  copyBtn: { padding: '6px 14px', background: 'rgba(153, 69, 255, 0.1)', border: '1px solid rgba(153, 69, 255, 0.2)', borderRadius: '6px', color: theme.accent.purple, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 },
  copiedBtn: { padding: '6px 14px', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '6px', color: theme.success, fontSize: '12px', fontWeight: 600, cursor: 'default', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 },

  // Verify
  txHashInput: { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${theme.border.medium}`, borderRadius: '6px', color: theme.text.primary, fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', outline: 'none' },
  verifyBtn: { padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' },

  // Phantom quick-send
  phantomLabel: { fontSize: '11px', fontWeight: 500, color: theme.text.muted },
  phantomRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  phantomBtn: { padding: '8px 16px', background: 'rgba(139, 139, 245, 0.08)', border: '1px solid rgba(139, 139, 245, 0.15)', borderRadius: '6px', color: theme.accent.purple, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' },

  // Shared
  inputRow: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1 },
  input: { flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${theme.border.medium}`, borderRadius: '6px', color: theme.text.primary, fontSize: '13px', fontFamily: '"JetBrains Mono", monospace', outline: 'none' },
  inputSuffix: { fontSize: '11px', fontWeight: 600, color: theme.text.muted, display: 'flex', alignItems: 'center' },
  withdrawBtn: { padding: '10px', background: theme.gradient.solana, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
  successMsg: { fontSize: '11px', fontWeight: 600, color: theme.success },
  errorMsg: { fontSize: '11px', fontWeight: 600, color: theme.danger },

  // Transaction panel
  panel: { background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: '8px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' },
  panelHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${theme.border.subtle}`, background: theme.bg.tertiary },
  panelTitle: { fontSize: '13px', fontWeight: 600, color: theme.text.secondary, flex: 1 },
  panelCount: { fontSize: '12px', fontWeight: 700, color: theme.text.secondary },
  txList: { flex: 1, overflow: 'auto' },
  txRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${theme.border.subtle}` },
  txLeft: { display: 'flex', flexDirection: 'column', gap: '2px' },
  txType: { fontSize: '12px', fontWeight: 700 },
  txDesc: { fontSize: '10px', color: theme.text.muted },
  txRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
  txAmount: { fontSize: '13px', fontWeight: 700 },
  txDate: { fontSize: '10px', color: theme.text.muted },
  empty: { padding: '24px', textAlign: 'center', fontSize: '12px', color: theme.text.muted },
};
