import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { isPhantomInstalled } from '../../utils/phantom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

interface AuthScreenProps {
  onSuccess: () => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || '';
  });
  const { login, register, connectWallet, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, username, password, referralCode || undefined);
      }
      onSuccess();
    } catch {
      // Error is set in the store
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal" style={isMobile ? { margin: '16px', maxWidth: '100%' } : {}}>
        {/* Close */}
        <button
          className="auth-close"
          onClick={onSuccess}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L28 12L16 30L4 12L16 2Z" fill="url(#ag)" />
            <path d="M16 2L28 12L16 16L4 12L16 2Z" fill="rgba(255,255,255,0.2)" />
            <defs>
              <linearGradient id="ag" x1="4" y1="2" x2="28" y2="30">
                <stop stopColor="#14F195" />
                <stop offset="1" stopColor="#9945FF" />
              </linearGradient>
            </defs>
          </svg>
          <span style={{
            fontSize: '18px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif",
            background: 'linear-gradient(135deg, #9945FF, #14F195)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            TradeGems
          </span>
        </div>

        {/* Toggle */}
        <div className="auth-toggle">
          <button
            className={`auth-toggle-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); clearError(); }}
          >
            Sign In
          </button>
          <button
            className={`auth-toggle-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); clearError(); }}
          >
            Register
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: `${theme.danger}10`,
            border: `1px solid ${theme.danger}30`, borderRadius: '8px',
            fontSize: '13px', fontWeight: 500, color: theme.danger,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email"
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label>Username</label>
              <input
                type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username" required minLength={3} maxLength={20}
                autoComplete="username"
              />
            </div>
          )}

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters" required minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label>Referral Code <span style={{ color: theme.text.muted, fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text" value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter code" maxLength={20}
              />
            </div>
          )}

          <button
            type="submit" disabled={isLoading}
            className="btn-3d btn-3d-primary auth-submit"
          >
            {isLoading ? 'Connecting...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login'); }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1, height: '1px', background: theme.border.subtle }} />
          <span style={{ fontSize: '12px', color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: theme.border.subtle }} />
        </div>

        {/* Phantom */}
        {isPhantomInstalled() ? (
          <button
            onClick={async () => { try { await connectWallet(); onSuccess(); } catch {} }}
            disabled={isLoading}
            className="auth-phantom"
          >
            <svg width="20" height="20" viewBox="0 0 128 128" fill="none">
              <rect width="128" height="128" rx="26" fill="#AB9FF2"/>
              <path d="M110.5 64.3c0-2-.2-4-.5-5.9-.1-1.1-1-1.9-2.1-1.9h-3.6c-2.5 0-4.3-2.4-3.5-4.7 2.5-7.4 3.9-14.5 3.9-20.8 0-13.5-10.4-22-27.7-22-22 0-39 13.7-47.2 33.4-.9 2.1-3.2 3.4-5.5 3.1l-2.1-.3c-7.7-1-14.8 4.6-15.6 12.3-.4 3.6 0 10.8 0 14.5 0 22.1 18.3 40 40.8 40h22.4c22.5 0 40.7-17.9 40.7-40v-7.7z" fill="#FFF"/>
              <circle cx="46" cy="64" r="7" fill="#AB9FF2"/>
              <circle cx="74" cy="64" r="7" fill="#AB9FF2"/>
            </svg>
            <span>{isLoading ? 'Connecting...' : 'Connect Phantom'}</span>
          </button>
        ) : (
          <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer" className="auth-phantom-link">
            Install Phantom Wallet
          </a>
        )}
      </div>
    </div>
  );
}
