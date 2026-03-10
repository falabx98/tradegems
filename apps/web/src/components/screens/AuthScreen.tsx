import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { isPhantomInstalled } from '../../utils/phantom';
import { theme } from '../../styles/theme';

interface AuthScreenProps {
  onSuccess: () => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, register, connectWallet, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
      onSuccess();
    } catch {
      // Error is set in the store
    }
  };

  const switchMode = () => {
    clearError();
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.preTitle}>Welcome to</div>
          <h1 style={styles.title}>Trading Arena</h1>
        </div>

        {/* Mode Toggle */}
        <div style={styles.toggle}>
          <button
            onClick={() => { setMode('login'); clearError(); }}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'login' ? styles.toggleBtnActive : {}),
            }}
          >
            Login
          </button>
          <button
            onClick={() => { setMode('register'); clearError(); }}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'register' ? styles.toggleBtnActive : {}),
            }}
          >
            Register
          </button>
        </div>

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              required
              style={styles.input}
              autoComplete="email"
            />
          </div>

          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="chart_sniper"
                required
                minLength={3}
                maxLength={20}
                style={styles.input}
                autoComplete="username"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 8 characters"
              required
              minLength={8}
              style={styles.input}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.submitBtn,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Connecting...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button onClick={switchMode} style={styles.switchBtn}>
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Phantom Wallet Connect */}
        {isPhantomInstalled() ? (
          <button
            onClick={async () => {
              try {
                await connectWallet();
                onSuccess();
              } catch {}
            }}
            disabled={isLoading}
            style={{
              ...styles.phantomBtn,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <span style={styles.phantomIcon}>👻</span>
            <span>
              {isLoading ? 'Connecting...' : 'Connect Phantom'}
            </span>
          </button>
        ) : (
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.installLink}
          >
            Install Phantom Wallet to connect with Solana
          </a>
        )}

        <div style={styles.version}>v0.1.0 alpha</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.bg.primary,
    overflow: 'hidden',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    padding: '40px',
    maxWidth: '400px',
    width: '100%',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '12px',
  },
  header: {
    textAlign: 'center' as const,
  },
  preTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    marginBottom: '6px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 800,
    lineHeight: 1.1,
    color: theme.text.primary,
    margin: 0,
  },
  toggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px',
    background: theme.bg.tertiary,
    borderRadius: '8px',
    overflow: 'hidden',
    width: '100%',
  },
  toggleBtn: {
    padding: '10px',
    background: theme.bg.tertiary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    transition: 'all 0.15s ease',
  },
  toggleBtnActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.1)',
  },
  error: {
    width: '100%',
    padding: '10px 14px',
    background: `${theme.danger}10`,
    border: `1px solid ${theme.danger}30`,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.danger,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.secondary,
  },
  input: {
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    color: theme.text.primary,
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginTop: '4px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: theme.border.subtle,
  },
  dividerText: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  phantomBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '12px',
    background: '#8b8bf5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  },
  phantomIcon: {
    fontSize: '18px',
  },
  installLink: {
    fontSize: '12px',
    color: theme.accent.purple,
    textDecoration: 'none',
    fontFamily: 'Inter, sans-serif',
  },
  version: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
  },
};
