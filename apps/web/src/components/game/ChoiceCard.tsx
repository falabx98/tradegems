import { theme } from '../../styles/theme';

export interface ChoiceOption {
  id: string;
  label: string;
  color: string;
  icon?: React.ReactNode;
  payout?: string;
  count?: number;
}

export interface ChoiceCardProps {
  choices: ChoiceOption[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ChoiceCard({ choices, selected, onSelect }: ChoiceCardProps) {
  return (
    <div style={s.grid}>
      {choices.map((c) => {
        const isActive = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              ...s.card,
              borderColor: isActive ? c.color : theme.border.medium,
              background: isActive ? `${c.color}0F` : theme.bg.card,
            }}
          >
            {c.icon && <div style={{ color: c.color, display: 'flex' }}>{c.icon}</div>}
            <span style={{ ...s.label, color: isActive ? c.color : theme.text.primary }}>
              {c.label}
            </span>
            {c.payout && (
              <span className="mono" style={s.payout}>{c.payout}</span>
            )}
            {c.count !== undefined && (
              <span style={s.count}>{c.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: {
    display: 'flex',
    gap: '8px',
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  label: {
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  payout: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  count: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    padding: '2px 8px',
    borderRadius: theme.radius.sm,
    background: 'rgba(255,255,255,0.04)',
  },
};
