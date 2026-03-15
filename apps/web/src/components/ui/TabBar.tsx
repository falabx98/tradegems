import { theme } from '../../styles/theme';

interface TabBarProps {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div style={s.bar}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              ...s.tab,
              color: isActive ? theme.text.primary : theme.text.muted,
              borderBottomColor: isActive ? theme.accent.purple : 'transparent',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: '4px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    marginBottom: '16px',
    overflow: 'auto',
  },
  tab: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
