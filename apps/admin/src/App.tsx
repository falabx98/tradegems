import { useEffect, useState, type CSSProperties } from 'react';
import { useAuthStore } from './stores/authStore';
import { Layout } from './components/Layout';
import type { Page } from './components/Sidebar';
import { theme } from './styles/theme';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { RoundsPage } from './pages/RoundsPage';
import { FairnessPage } from './pages/FairnessPage';
import { GameConfigPage } from './pages/GameConfigPage';
import { FeatureFlagsPage } from './pages/FeatureFlagsPage';
import { RiskPage } from './pages/RiskPage';
import { AuditPage } from './pages/AuditPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

function App() {
  const { isAuthenticated, isLoading, checkAuth, username, logout } = useAuthStore();
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div style={styles.fullCenter}>
        <div style={styles.spinner}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const pageComponent = (() => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'users': return <UsersPage />;
      case 'treasury': return <TreasuryPage />;
      case 'rounds': return <RoundsPage />;
      case 'fairness': return <FairnessPage />;
      case 'gameConfig': return <GameConfigPage />;
      case 'featureFlags': return <FeatureFlagsPage />;
      case 'risk': return <RiskPage />;
      case 'audit': return <AuditPage />;
      case 'analytics': return <AnalyticsPage />;
      default: return <DashboardPage />;
    }
  })();

  return (
    <Layout
      activePage={page}
      onNavigate={setPage}
      onLogout={logout}
      username={username}
    >
      {pageComponent}
    </Layout>
  );
}

function LoginScreen() {
  const { login, error, isLoading, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    await login(email, password);
  }

  return (
    <div style={styles.fullCenter}>
      <form style={styles.loginCard} onSubmit={handleSubmit}>
        <div style={styles.loginLogo}>
          <span style={styles.logoIcon}>◆</span>
          <span style={styles.logoText}>TRADESOL</span>
          <span style={styles.logoBadge}>ADMIN</span>
        </div>

        <h2 style={styles.loginTitle}>Admin Login</h2>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>
          Email
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@tradesol.com"
            required
          />
        </label>

        <label style={styles.label}>
          Password
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        <button
          style={styles.loginBtn}
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>

        <p style={styles.hint}>
          Only admin and superadmin accounts can access this panel.
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  fullCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: theme.bg.primary,
  },
  spinner: {
    color: theme.text.secondary,
    fontSize: theme.fontSize.md,
  },
  loginCard: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.xl,
    padding: '40px',
    width: '100%',
    maxWidth: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: theme.shadow.lg,
  },
  loginLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  logoIcon: {
    fontSize: '1.5rem',
    background: theme.gradient.solana,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoText: {
    fontWeight: 700,
    fontSize: theme.fontSize.xl,
    color: theme.text.primary,
    letterSpacing: '2px',
  },
  logoBadge: {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: theme.accent.cyan,
    border: `1px solid ${theme.accent.cyan}`,
    borderRadius: theme.radius.sm,
    padding: '2px 6px',
    letterSpacing: '1px',
  },
  loginTitle: {
    textAlign: 'center',
    color: theme.text.primary,
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    margin: 0,
  },
  error: {
    background: theme.danger + '18',
    border: `1px solid ${theme.danger}40`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    color: theme.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: theme.text.secondary,
    fontSize: theme.fontSize.sm,
  },
  input: {
    padding: '12px 14px',
    background: theme.bg.tertiary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: theme.fontSize.base,
    outline: 'none',
  },
  loginBtn: {
    padding: '12px',
    background: theme.gradient.solana,
    border: 'none',
    borderRadius: theme.radius.md,
    color: '#fff',
    fontWeight: 700,
    fontSize: theme.fontSize.md,
    cursor: 'pointer',
    marginTop: '8px',
  },
  hint: {
    textAlign: 'center',
    color: theme.text.muted,
    fontSize: theme.fontSize.xs,
    margin: 0,
  },
};

export default App;
