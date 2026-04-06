import type { CSSProperties } from 'react';
import { theme } from '../../styles/theme';

// ─── Navigation Structure ───────────────────────────────────

export type AdminTab =
  | 'overview'
  | 'users' | 'deposits' | 'withdrawals' | 'treasury'
  | 'games' | 'fairness' | 'weekly-race'
  | 'bonuses' | 'sponsored' | 'referrals'
  | 'ops' | 'settlements' | 'flags' | 'engine' | 'risk' | 'simulation' | 'logs';

interface NavItem {
  id: AdminTab;
  label: string;
  icon: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'DASHBOARD',
    items: [
      { id: 'overview', label: 'Overview', icon: 'OV' },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { id: 'users', label: 'Users', icon: 'US' },
      { id: 'deposits', label: 'Deposits', icon: 'D+' },
      { id: 'withdrawals', label: 'Withdrawals', icon: 'W-' },
      { id: 'treasury', label: 'Treasury', icon: 'TR' },
    ],
  },
  {
    title: 'GAMES',
    items: [
      { id: 'games', label: 'Rounds', icon: 'RD' },
      { id: 'fairness', label: 'Fairness', icon: 'FN' },
      { id: 'weekly-race', label: 'Weekly Race', icon: 'WR' },
    ],
  },
  {
    title: 'MARKETING',
    items: [
      { id: 'bonuses', label: 'Bonus Codes', icon: 'BC' },
      { id: 'sponsored', label: 'Sponsored', icon: 'SP' },
      { id: 'referrals', label: 'Referrals', icon: 'RF' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { id: 'ops', label: 'Ops Health', icon: 'OH' },
      { id: 'settlements', label: 'Settlements', icon: 'ST' },
      { id: 'flags', label: 'Feature Flags', icon: 'FF' },
      { id: 'engine', label: 'Engine Config', icon: 'EC' },
      { id: 'risk', label: 'Risk & Mod', icon: 'RM' },
      { id: 'simulation', label: 'Simulation', icon: 'SM' },
      { id: 'logs', label: 'Audit Logs', icon: 'AL' },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────

interface AdminSidebarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  adminUsername?: string;
  adminRole?: string;
  badges?: Partial<Record<AdminTab, number>>;
}

export function AdminSidebar({ activeTab, onTabChange, collapsed, onToggleCollapse, adminUsername, adminRole, badges = {} }: AdminSidebarProps) {
  return (
    <aside style={{ ...sidebar, width: collapsed ? 64 : 240 }}>
      {/* Header */}
      <div style={header}>
        {!collapsed && <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>TradeGems Admin</span>}
        <button onClick={onToggleCollapse} style={collapseBtn}>
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Navigation */}
      <nav style={nav}>
        {NAV_GROUPS.map(group => (
          <div key={group.title} style={{ marginBottom: 16 }}>
            {!collapsed && (
              <div style={groupTitle}>{group.title}</div>
            )}
            {group.items.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  style={{
                    ...navItem,
                    background: isActive ? 'rgba(139,92,246,0.1)' : 'transparent',
                    borderLeft: isActive ? '3px solid #8B5CF6' : '3px solid transparent',
                    color: isActive ? '#fff' : theme.text.muted,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '10px 0' : '8px 12px',
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, width: 20, textAlign: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}>{item.icon}</span>
                  {!collapsed && <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, flex: 1 }}>{item.label}</span>}
                  {!collapsed && badges[item.id] && badges[item.id]! > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: theme.accent.red, borderRadius: 8, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{badges[item.id]}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Admin info at bottom */}
      {!collapsed && adminUsername && (
        <div style={adminInfo}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary }}>{adminUsername}</div>
          <div style={{ fontSize: 10, fontWeight: 500, color: theme.accent.purple, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{adminRole}</div>
        </div>
      )}
    </aside>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const sidebar: CSSProperties = {
  background: '#111111',
  borderRight: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  transition: 'width 0.2s ease',
  flexShrink: 0,
};

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  minHeight: 52,
};

const collapseBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: theme.text.muted,
  cursor: 'pointer',
  fontSize: 14,
  padding: '4px 8px',
  borderRadius: 4,
  fontFamily: 'inherit',
};

const nav: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 0',
  scrollbarWidth: 'none' as any,
};

const groupTitle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: theme.text.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '8px 16px 4px',
};

const navItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 0,
  transition: 'all 0.12s ease',
};

const adminInfo: CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};
