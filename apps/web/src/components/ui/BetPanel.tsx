import { ReactNode, useState } from 'react';
import { theme } from '../../styles/theme';
import { formatSol, solToLamports } from '../../utils/sol';
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
  presets: Array<{ label: string; lamports: number }>;
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
}

export function BetPanel({
  presets,
  selectedAmount,
  onAmountChange,
  allowCustom = true,
  showModifiers = true,
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
}: BetPanelProps) {
  const [customBet, setCustomBet] = useState('');
  const { isAuthenticated } = useAuthStore();
  const go = useAppNavigate();

  const fee = Math.floor(selectedAmount * feeRate);
  const totalCost = selectedAmount + fee;
  const canAfford = totalCost <= balance;
  const meetsMin = selectedAmount >= minBet;

  const handleCustomBet = () => {
    const val = parseFloat(customBet);
    if (isNaN(val) || val <= 0) return;
    const lamports = solToLamports(val);
    if (lamports < minBet) return;
    const cFee = Math.floor(lamports * feeRate);
    if (lamports + cFee > balance) return;
    onAmountChange(lamports);
    setCustomBet('');
  };

  const isCustomActive = selectedAmount > 0 && !presets.some(p => p.lamports === selectedAmount);
  const disabled = submitDisabled || !canAfford || !meetsMin || submitLoading;

  // Unauthenticated state
  if (!isAuthenticated) {
    return (
      <div style={{ ...s.panel, ...(compact ? { gap: '8px' } : {}) }}>
        <div style={s.signInWrap}>
          <div style={s.signInTitle}>Sign in to play</div>
          <div style={s.signInSub}>Connect your wallet to start betting</div>
          <Button variant="primary" size="lg" fullWidth onClick={() => go('auth')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.panel, ...(compact ? { gap: '8px' } : {}) }}>
      {/* Amount Section */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionLabel}>AMOUNT</span>
          <div style={s.balanceRow}>
            <span style={s.balanceLabel}>Bal:</span>
            <span className="mono" style={s.balanceValue}>
              {formatSol(balance)} <SolIcon size="0.9em" />
            </span>
          </div>
        </div>

        {/* Selected amount badge */}
        <div style={s.selectedRow}>
          <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px' }} />
          <span className="mono" style={s.selectedAmount}>{formatSol(selectedAmount)}</span>
        </div>

        {/* Presets */}
        <div style={s.presetGrid}>
          {presets.map((p) => {
            const active = selectedAmount === p.lamports;
            const pFee = Math.floor(p.lamports * feeRate);
            const affordable = p.lamports + pFee <= balance;
            return (
              <button
                key={p.lamports}
                onClick={() => { onAmountChange(p.lamports); setCustomBet(''); }}
                disabled={!affordable}
                className="mono"
                style={{
                  ...s.preset,
                  ...(active ? s.presetActive : {}),
                  opacity: !affordable ? 0.25 : 1,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Modifiers + Custom */}
        {(showModifiers || allowCustom) && (
          <div style={s.modRow}>
            {showModifiers && (
              <button
                onClick={() => {
                  const half = Math.max(minBet, Math.floor(selectedAmount / 2));
                  onAmountChange(half);
                  setCustomBet('');
                }}
                disabled={selectedAmount <= minBet}
                style={{ ...s.modBtn, opacity: selectedAmount <= minBet ? 0.35 : 1 }}
              >
                ½
              </button>
            )}
            {allowCustom && (
              <div style={s.customWrap}>
                <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <input
                  type="number"
                  placeholder="Custom"
                  value={customBet}
                  onChange={(e) => setCustomBet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomBet(); }}
                  className="mono"
                  step="0.01"
                  min="0"
                  style={{
                    ...s.customInput,
                    ...(isCustomActive ? { color: theme.accent.purple } : {}),
                  }}
                />
                <button
                  onClick={handleCustomBet}
                  disabled={!customBet || parseFloat(customBet) <= 0}
                  style={{ ...s.customSetBtn, opacity: !customBet || parseFloat(customBet) <= 0 ? 0.35 : 1 }}
                >
                  Set
                </button>
              </div>
            )}
            {showModifiers && (
              <button
                onClick={() => {
                  const doubled = selectedAmount * 2;
                  const dFee = Math.floor(doubled * feeRate);
                  if (doubled + dFee <= balance) {
                    onAmountChange(doubled);
                    setCustomBet('');
                  }
                }}
                disabled={selectedAmount * 2 + Math.floor(selectedAmount * 2 * feeRate) > balance}
                style={{
                  ...s.modBtn,
                  opacity: selectedAmount * 2 + Math.floor(selectedAmount * 2 * feeRate) > balance ? 0.35 : 1,
                }}
              >
                2×
              </button>
            )}
            {showModifiers && (
              <button
                onClick={() => {
                  const maxLamports = Math.floor(balance / (1 + feeRate));
                  if (maxLamports >= minBet) {
                    onAmountChange(maxLamports);
                    setCustomBet('');
                  }
                }}
                disabled={Math.floor(balance / (1 + feeRate)) < minBet}
                style={{
                  ...s.modBtn,
                  ...s.maxBtn,
                  opacity: Math.floor(balance / (1 + feeRate)) < minBet ? 0.35 : 1,
                }}
              >
                MAX
              </button>
            )}
          </div>
        )}

        {/* Fee + Total */}
        <div style={s.feeLine}>
          <span>Fee ({(feeRate * 100).toFixed(0)}%)</span>
          <span className="mono" style={s.feeValue}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '12px', height: '12px' }} />
            {formatSol(fee)}
          </span>
        </div>
      </div>

      {/* Choices */}
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
                    borderColor: active ? c.color : theme.border.medium,
                    background: active ? `${c.color}10` : theme.bg.card,
                  }}
                >
                  {c.icon && <div style={{ color: c.color, display: 'flex' }}>{c.icon}</div>}
                  <span style={{ ...s.choiceLabel, color: active ? c.color : theme.text.primary }}>{c.label}</span>
                  {c.payout && <span className="mono" style={s.choicePayout}>{c.payout}</span>}
                  {c.count !== undefined && (
                    <span style={s.choiceCount}>{c.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit */}
      <Button
        variant={submitVariant}
        size="lg"
        fullWidth
        onClick={onSubmit}
        disabled={disabled}
        loading={submitLoading}
      >
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
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

const s: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
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
  balanceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  balanceLabel: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  selectedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  selectedAmount: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.accent.purple,
  },
  presetGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  preset: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: theme.text.secondary,
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presetActive: {
    background: theme.gradient.primary,
    color: '#fff',
    borderColor: 'transparent',
  },
  modRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  modBtn: {
    padding: '8px 10px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
    transition: 'all 0.15s ease',
    flexShrink: 0,
    minWidth: 0,
  },
  customWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: theme.bg.input,
    borderRadius: theme.radius.md,
    padding: '0 8px',
    border: `1px solid ${theme.border.medium}`,
  },
  customInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    padding: '8px 0',
    width: '60px',
    minWidth: 0,
  },
  customSetBtn: {
    padding: '4px 8px',
    background: 'rgba(139, 92, 246, 0.12)',
    border: '1px solid rgba(139, 92, 246, 0.20)',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
    transition: 'all 0.15s ease',
    flexShrink: 0,
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
  maxBtn: {
    color: theme.accent.neonGreen,
    borderColor: 'rgba(0, 231, 1, 0.15)',
    background: 'rgba(0, 231, 1, 0.06)',
    letterSpacing: '0.5px',
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
