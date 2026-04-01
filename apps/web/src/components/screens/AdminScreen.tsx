import { useState, useEffect } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { apiFetch } from '../../utils/api';

// Admin layout + navigation
import { AdminLayout } from '../admin/AdminLayout';
import type { AdminTab } from '../admin/AdminSidebar';

// Tab components
import { OverviewTab } from '../admin/OverviewTab';
import { UsersTab } from '../admin/UsersTab';
import { DepositsTab } from '../admin/DepositsTab';
import { WithdrawalsTab } from '../admin/WithdrawalsTab';
import { TreasuryTab } from '../admin/TreasuryTab';
import { RoundsTab } from '../admin/RoundsTab';
import { BonusCodesTab } from '../admin/BonusCodesTab';
import { OpsHealthTab } from '../admin/OpsHealthTab';
import { SettlementsTab } from '../admin/SettlementsTab';
import { FeatureFlagsTab } from '../admin/FeatureFlagsTab';
import { EngineConfigTab } from '../admin/EngineConfigTab';
import { RiskModerationTab } from '../admin/RiskModerationTab';
import { ReferralsAnalyticsTab } from '../admin/ReferralsAnalyticsTab';
import { AuditLogsTab } from '../admin/AuditLogsTab';
import { WeeklyRaceTab } from '../admin/WeeklyRaceTab';
import { SponsoredAccountsTab } from '../admin/SponsoredAccountsTab';
import { SimulationTab } from '../admin/SimulationTab';
import { FairnessTab } from '../admin/FairnessTab';

export function AdminScreen() {
  const go = useAppNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Check admin access on mount
  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ role: string }>('/v1/users/me');
        if (me.role === 'admin' || me.role === 'superadmin' || me.role === 'operator') {
          setIsAdmin(true);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: theme.text.muted }}>Checking access...</span>
      </div>
    );
  }

  // Access denied
  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: theme.danger }}>Access Denied</span>
        <span style={{ fontSize: 14, color: theme.text.muted }}>This page is restricted to admin users.</span>
        <button onClick={() => go('settings')} style={{ marginTop: 12, padding: '10px 24px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, color: '#8b5cf6', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      adminUsername="xfalabx"
      adminRole="superadmin"
    >
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'deposits' && <DepositsTab />}
      {activeTab === 'withdrawals' && <WithdrawalsTab />}
      {activeTab === 'treasury' && <TreasuryTab />}
      {activeTab === 'games' && <RoundsTab />}
      {activeTab === 'bonuses' && <BonusCodesTab />}
      {activeTab === 'ops' && <OpsHealthTab />}
      {activeTab === 'settlements' && <SettlementsTab />}
      {activeTab === 'flags' && <FeatureFlagsTab />}
      {activeTab === 'engine' && <EngineConfigTab />}
      {activeTab === 'risk' && <RiskModerationTab />}
      {activeTab === 'referrals' && <ReferralsAnalyticsTab />}
      {activeTab === 'logs' && <AuditLogsTab />}
      {activeTab === 'weekly-race' && <WeeklyRaceTab />}
      {activeTab === 'sponsored' && <SponsoredAccountsTab />}
      {activeTab === 'simulation' && <SimulationTab />}
      {activeTab === 'fairness' && <FairnessTab />}
    </AdminLayout>
  );
}
