import { ReactNode, useState } from 'react';
import { theme } from '../../styles/theme';
import { formatSol, solToLamports } from '../../utils/sol';
import { Button } from './Button';

interface BetChoice {
  id: string;
  label: string;
  color: string;
  icon?: ReactNode;
  payout?: string;
  count?: number;
}

interface BetPanelProps {
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

  return (
    <div style={{ ...s.panel, ...(compact ? { gap: '10px' } : {}) }}>
      {/* Amount Section */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionLabel}>AMOUNT</span>
          <span className="mono" style={s.selectedBadge}>
            <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px' }} />
            {formatSol(selectedAmount)}
          </span>
        </div>
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
          </div>
        )}

        {/* Fee line */}
        <div style={s.feeLine}>
          <span>Fee ({(feeRate * 100).toFixed(0)}%)</span>
          <span className="mono">{formatSol(fee)} SOL</span>
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
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {submitLoading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={s.spinner} />
            {submitLabel}
          </span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
              {submitLabel}
            </span>
            <span className="mono" style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <img src="/sol-coin.png" alt="SOL" style={{ width: '14px', height: '14px' }} />
              {formatSol(totalCost)} SOL
            </span>
          </span>
        )}
      </Button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    background: theme.bg.tertiary,
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
    fontWeight: 700,
    color: theme.text.muted,
    letterSpacing: '1px',
  },
  selectedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
    padding: '9px 16px',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: theme.text.secondary,
    background: theme.bg.card,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presetActive: {
    background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
    color: '#fff',
    borderColor: 'transparent',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
  },
  modRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  modBtn: {
    padding: '8px 14px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    color: theme.accent.purple,
    transition: 'all 0.12s ease',
    flexShrink: 0,
  },
  customWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: theme.bg.card,
    borderRadius: '8px',
    padding: '0 10px',
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
    padding: '5px 10px',
    background: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
    transition: 'all 0.12s ease',
    flexShrink: 0,
  },
  feeLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: theme.text.muted,
    padding: '2px 0',
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
    padding: '14px 12px',
    borderRadius: '10px',
    border: '1.5px solid',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
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
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.04)',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
};
