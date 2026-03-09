// ─── Wallet Types ────────────────────────────────────────────────────────────

export type Asset = 'USDC' | 'SOL';
export type DepositStatus = 'pending' | 'confirming' | 'confirmed' | 'failed' | 'expired';
export type WithdrawalStatus =
  | 'pending_review'
  | 'approved'
  | 'processing'
  | 'broadcast'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export type LedgerEntryType =
  | 'bet_lock'
  | 'bet_unlock'
  | 'bet_settle'
  | 'payout_credit'
  | 'deposit_pending'
  | 'deposit_confirmed'
  | 'withdraw_lock'
  | 'withdraw_complete'
  | 'withdraw_cancel'
  | 'rakeback_credit'
  | 'admin_adjustment';

export interface Balance {
  asset: Asset;
  available: string;  // BigInt as string for JSON safety
  locked: string;
  pending: string;
}

export interface BalanceSet {
  balances: Balance[];
}

export interface LedgerEntry {
  id: string;
  userId: string;
  asset: Asset;
  entryType: LedgerEntryType;
  amount: string;
  balanceAfter: string;
  referenceType: string;
  referenceId: string;
  createdAt: string;
}

export interface DepositInstructions {
  asset: Asset;
  address: string;
  minimumAmount: string;
  requiredConfirmations: number;
}

export interface Deposit {
  id: string;
  asset: Asset;
  amount: string;
  txHash?: string;
  status: DepositStatus;
  confirmations: number;
  createdAt: string;
}

export interface WithdrawRequest {
  asset: Asset;
  amount: string;
  destination: string;
}

export interface Withdrawal {
  id: string;
  asset: Asset;
  amount: string;
  fee: string;
  destination: string;
  txHash?: string;
  status: WithdrawalStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'rakeback' | 'adjustment';
  asset: Asset;
  amount: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface LinkedWallet {
  id: string;
  chain: string;
  address: string;
  walletType: string;
  isPrimary: boolean;
  createdAt: string;
}
