import { ReactNode, useState } from 'react';
import { theme } from '../../styles/theme';
import { formatSol, solToLamports, lamportsToSol } from '../../utils/sol';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { Button } from '../primitives/Button';
import { SolIcon } from './SolIcon';

export interface BetChoice {
  id: string;
  label: string;
  color: string;
  icon?: ReactNode;
  payout?: string;
  count?: number;
}

export interface BetPanelProps {
  /** @deprecated presets are no longer rendered — kept for API compat */
  presets?: Array<{ label: string; lamports: number }>;
  selectedAmount: number;
  onAmountChange: (lamports: number) => void;
  allowCustom?: boolean;
  showModifiers?: boolean;
  balance: number;
  feeRate?: number;
  minBet?: number;
  choices?: BetChoice[];
  selectedChoice?: string | null;
  onChoiceSelect?: (id: string) => void;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  submitVariant?: 'primary' | 'success' | 'danger';
  compact?: boolean;
  /** Extra controls (mine count, etc.) injected between amount and submit */
  children?: ReactNode;
}

// Quick-amount presets in lamports
const QUICK_AMOUNTS = [
  { label: '0.01', lamports: 10_000_000 },
  { label: '0.05', lamports: 50_000_000 },
  { label: '0.1',  lamports: 100_000_000 },
  { label: '0.5',  lamports: 500_000_000 },
];

export function BetPanel({
  selectedAmount,
  onAmountChange,
  balance,
  feeRate = 0.05,
  minBet = 1_000_000,
  choices,
  selectedChoice,
  onChoiceSelect,
  submitLabel,
  onSubmit,
  submitDisabled,
  submitLoading,
  submitVariant = 'primary',
  compact,
  children,
}: BetPanelProps) {
  const { isAuthenticated } = useAuthStore();
  const go = useAppNavigate();

  const fee = Math.floor(selectedAmount * feeRate);
  const totalCost = selectedAmount + fee;
  const canAfford = totalCost <= balance;
  const meetsMin = selectedAmount >= minBet;
  const disabled = submitDisabled || !canAfford || !meetsMin || submitLoading;

  // Editable input value — tracks user typing
  const [inputValue, setInputValue] = useState(formatSol(selectedAmount));
  const [isFocused, setIsFocused] = useState(false);

  const syncInput = (lamports: number) => {
    onAmountChange(lamports);
    setInputValue(formatSol(lamports));
  };

  const handleInputChange = (raw: string) => {
    setInputValue(raw);
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) {
      onAmountChange(solToLamports(val));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setInputValue(formatSol(selectedAmount));
  };

  const handleHalf = () => {
    const half = Math.max(minBet, Math.floor(selectedAmount / 2));
    syncInput(half);
  };

  const handleDouble = () => {
    const doubled = selectedAmount * 2;
    const dFee = Math.floor(doubled * feeRate);
    if (doubled + dFee <= balance) {
      syncInput(doubled);
    }
  };

  // Keep input in sync when selectedAmount changes externally
  if (!isFocused && inputValue !== formatSol(selectedAmount)) {
    setInputValue(formatSol(selectedAmount));
  }

  // ── Unauthenticated ──
  if (!isAuthenticated) {
    return (
      <div style={{ ...s.panel, ...(compact ? { gap: '8px' } : {}) }}>
        <div style={s.signInWrap}>
          <div style={s.signInTitle}>Sign in to play</div>
          <div style={s.signInSub}>Sign in to start betting</div>
          <Button variant="primary" size="lg" fullWidth onClick={() => go('auth')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.panel, ...(compact ? { gap: '10px' } : {}) }}>

      {/* ── Bet Amount ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionLabel}>BET AMOUNT</span>
          <span className="mono" style={s.balanceValue}>
            {formatSol(balance)} <SolIcon size="0.85em" />
          </span>
        </div>

        <div style={{
          ...s.amountRow,
          borderColor: isFocused ? theme.accent.primary : theme.border.default,
          boxShadow: isFocused ? '0 0 0 3px rgba(139, 92, 246, 0.12)' : 'none',
        }}>
          <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          <input
            type="number"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="mono"
            step="0.01"
            min="0"
            style={s.amountInput}
          />
          <button
            onClick={handleHalf}
            disabled={selectedAmount <= minBet}
            style={{ ...s.inlineBtn, opacity: selectedAmount <= minBet ? 0.3 : 1 }}
          >
            ½
          </button>
          <div style={s.divider} />
          <button
            onClick={handleDouble}
            disabled={selectedAmount * 2 + Math.floor(selectedAmount * 2 * feeRate) > balance}
            style={{ ...s.inlineBtn, opacity: selectedAmount * 2 + Math.floor(selectedAmount * 2 * feeRate) > balance ? 0.3 : 1 }}
          >
            2×
          </button>
        </div>

        {/* Quick amount selectors */}
        <div style={s.quickRow}>
          {QUICK_AMOUNTS.map((qa) => {
            const isActive = selectedAmount === qa.lamports;
            const canSelect = qa.lamports + Math.floor(qa.lamports * feeRate) <= balance;
            return (
              <button
                key={qa.label}
                onClick={() => canSelect && syncInput(qa.lamports)}
                disabled={!canSelect}
                style={{
                  ...s.quickBtn,
                  background: isActive ? 'rgba(139, 92, 246, 0.12)' : theme.bg.elevated,
                  borderColor: isActive ? 'rgba(139, 92, 246, 0.3)' : theme.border.default,
                  color: isActive ? theme.accent.primary : theme.text.secondary,
                  opacity: canSelect ? 1 : 0.35,
                }}
              >
                {qa.label}
              </button>
            );
          })}
        </div>

        {/* Fee */}
        <div style={s.feeLine}>
          <span>Fee ({(feeRate * 100).toFixed(0)}%)</span>
          <span className="mono" style={s.feeValue}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '12px', height: '12px' }} />
            {formatSol(fee)}
          </span>
        </div>
      </div>

      {/* ── Choices (direction, risk tier, etc.) ── */}
      {choices && choices.length > 0 && (
        <div style={s.section}>
          <span style={s.sectionLabel}>PICK</span>
          <div style={s.choiceGrid}>
            {choices.map((c) => {
              const active = selectedChoice === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onChoiceSelect?.(c.id)}
                  style={{
                    ...s.choiceCard,
                    borderColor: active ? c.color : theme.border.default,
                    background: active ? `${c.color}12` : theme.bg.elevated,
                  }}
                >
                  {c.icon && <div style={{ color: c.color, display: 'flex' }}>{c.icon}</div>}
                  <span style={{ ...s.choiceLabel, color: active ? c.color : theme.text.primary }}>{c.label}</span>
                  {c.payout && <span className="mono" style={s.choicePayout}>{c.payout}</span>}
                  {c.count !== undefined && <span style={s.choiceCount}>{c.count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Extra controls (injected by each game) ── */}
      {children}

      {/* ── Submit ── */}
      <Button
        variant={submitVariant}
        size="lg"
        fullWidth
        onClick={onSubmit}
        disabled={disabled}
        loading={submitLoading}
        style={{ padding: '14px', borderRadius: '8px' }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const }}>
            {submitLabel}
          </span>
          <span className="mono" style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '14px', height: '14px' }} />
            {formatSol(totalCost)} <SolIcon size="0.9em" />
          </span>
        </span>
      </Button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    background: theme.bg.surface,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    letterSpacing: '0.8px',
  },
  balanceValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  // ── Amount row: input + ½ + 2× inside one bordered box ──
  amountRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: theme.bg.base,
    borderRadius: theme.radius.md,
    padding: '0 12px',
    border: '1.5px solid',
    borderColor: theme.border.default,
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  amountInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.primary,
    padding: '12px 0',
    width: '60px',
    minWidth: 0,
  },
  inlineBtn: {
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
    flexShrink: 0,
  },
  divider: {
    width: '1px',
    height: '20px',
    background: theme.border.default,
    flexShrink: 0,
  },
  // ── Quick amount selector ──
  quickRow: {
    display: 'flex',
    gap: '6px',
  },
  quickBtn: {
    flex: 1,
    padding: '6px 0',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    border: '1px solid',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'center',
  },
  feeLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: theme.text.muted,
    padding: '2px 0',
  },
  feeValue: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  choiceGrid: {
    display: 'flex',
    gap: '8px',
  },
  choiceCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
    padding: '12px 8px',
    borderRadius: theme.radius.md,
    border: '1.5px solid',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    minHeight: '44px',
  },
  choiceLabel: {
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  choicePayout: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  choiceCount: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    padding: '2px 8px',
    borderRadius: theme.radius.sm,
    background: 'rgba(255,255,255,0.04)',
  },
  signInWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    textAlign: 'center',
  },
  signInTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  signInSub: {
    fontSize: '13px',
    color: theme.text.muted,
    marginBottom: '4px',
  },
};
