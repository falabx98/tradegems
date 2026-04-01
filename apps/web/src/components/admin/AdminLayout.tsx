import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { AdminSidebar, type AdminTab } from './AdminSidebar';
import { apiFetch } from '../../utils/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

interface AdminLayoutProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  adminUsername?: string;
  adminRole?: string;
  children: ReactNode;
}

// Tab label map for breadcrumbs
const TAB_LABELS: Record<AdminTab, { section: string; label: string }> = {
  overview: { section: 'Dashboard', label: 'Overview' },
  users: { section: 'Operations', label: 'Users' },
  deposits: { section: 'Operations', label: 'Deposits' },
  withdrawals: { section: 'Operations', label: 'Withdrawals' },
  treasury: { section: 'Operations', label: 'Treasury' },
  games: { section: 'Games', label: 'Rounds' },
  fairness: { section: 'Games', label: 'Fairness' },
  'weekly-race': { section: 'Games', label: 'Weekly Race' },
  bonuses: { section: 'Marketing', label: 'Bonus Codes' },
  sponsored: { section: 'Marketing', label: 'Sponsored' },
  referrals: { section: 'Marketing', label: 'Referrals' },
  ops: { section: 'System', label: 'Ops Health' },
  settlements: { section: 'System', label: 'Settlements' },
  flags: { section: 'System', label: 'Feature Flags' },
  engine: { section: 'System', label: 'Engine Config' },
  risk: { section: 'System', label: 'Risk & Mod' },
  simulation: { section: 'System', label: 'Simulation' },
  logs: { section: 'System', label: 'Audit Logs' },
};

export function AdminLayout({ activeTab, onTabChange, adminUsername, adminRole, children }: AdminLayoutProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<Partial<Record<AdminTab, number>>>({});

  // Fetch badge counts on mount + every 30s
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const [withdrawals, settlements, alerts] = await Promise.all([
          apiFetch<{ data: any[] }>('/v1/admin/treasury/withdrawals?status=pending_review').catch(() => ({ data: [] })),
          apiFetch<{ data: any[] }>('/v1/admin/failed-settlements?status=pending').catch(() => ({ data: [] })),
          apiFetch<any>('/v1/admin/ops/alerts?acknowledged=false&limit=100').catch(() => ({ data: [] })),
        ]);
        setBadges({
          withdrawals: (withdrawals as any).data?.length || 0,
          settlements: (settlements as any).data?.length || 0,
          ops: (alerts as any).data?.length || 0,
        });
      } catch {}
    };
    fetchBadges();
    const iv = setInterval(fetchBadges, 30000);
    return () => clearInterval(iv);
  }, []);

  const handleTabChange = (tab: AdminTab) => {
    onTabChange(tab);
    if (isMobile) setMobileOpen(false);
  };

  const tabInfo = TAB_LABELS[activeTab];

  return (
    <div style={layout}>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999 }} onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div style={isMobile ? { position: 'fixed', left: mobileOpen ? 0 : -250, top: 0, bottom: 0, zIndex: 1000, transition: 'left 0.2s ease' } : {}}>
        <AdminSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          collapsed={isMobile ? false : collapsed}
          onToggleCollapse={() => isMobile ? setMobileOpen(false) : setCollapsed(c => !c)}
          adminUsername={adminUsername}
          adminRole={adminRole}
          badges={badges}
        />
      </div>

      <main style={content}>
        {/* Mobile hamburger + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {isMobile && (
            <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: theme.text.muted, fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>☰</button>
          )}
          <span style={{ fontSize: 11, color: theme.text.muted }}>
            Admin › {tabInfo?.section} › <span style={{ color: theme.text.secondary }}>{tabInfo?.label}</span>
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}

const layout: CSSProperties = {
  display: 'flex',
  height: 'calc(100vh - 64px)',
  overflow: 'hidden',
};

const content: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 24,
  background: '#0A0A0A',
};
