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
              background: isActive ? theme.bg.surface : 'transparent',
              color: isActive ? '#fff' : theme.text.muted,
              fontWeight: isActive ? 600 : 500,
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
    background: theme.bg.elevated,
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '16px',
    overflow: 'auto',
  },
  tab: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'inherit',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
