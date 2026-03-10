import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { RoundsPage } from './pages/RoundsPage';
import { FairnessPage } from './pages/FairnessPage';
import { GameConfigPage } from './pages/GameConfigPage';
import { FeatureFlagsPage } from './pages/FeatureFlagsPage';
import { RiskPage } from './pages/RiskPage';
import { AuditPage } from './pages/AuditPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ChatPage } from './pages/ChatPage';
import { DepositWalletsPage } from './pages/DepositWalletsPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { SettingsPage } from './pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'users/:id', element: <UserDetailPage /> },
          { path: 'treasury', element: <TreasuryPage /> },
          { path: 'rounds', element: <RoundsPage /> },
          { path: 'fairness', element: <FairnessPage /> },
          { path: 'game-config', element: <GameConfigPage /> },
          { path: 'feature-flags', element: <FeatureFlagsPage /> },
          { path: 'risk', element: <RiskPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'deposit-wallets', element: <DepositWalletsPage /> },
          { path: 'referrals', element: <ReferralsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
