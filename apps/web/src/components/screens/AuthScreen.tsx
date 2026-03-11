import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { isPhantomInstalled } from '../../utils/phantom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';

interface AuthScreenProps {
  onSuccess: () => void;
}

// ─── Animated Chart Background ──────────────────────────────────────────────

function ChartBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = canvas.width = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;

    const points: number[] = [];
    for (let i = 0; i <= 40; i++) {
      points.push(0.3 + Math.random() * 0.4);
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);

      // Animated chart line
      ctx!.beginPath();
      const segW = W / (points.length - 1);
      for (let i = 0; i < points.length; i++) {
        const x = i * segW;
        const wobble = Math.sin(t * 0.001 + i * 0.3) * 0.03;
        const y = (1 - points[i] - wobble) * H;
        if (i === 0) ctx!.moveTo(x, y);
        else {
          const px = (i - 1) * segW;
          const py = (1 - points[i - 1] - Math.sin(t * 0.001 + (i - 1) * 0.3) * 0.03) * H;
          const cx = (px + x) / 2;
          ctx!.bezierCurveTo(cx, py, cx, y, x, y);
        }
      }
      ctx!.strokeStyle = 'rgba(153, 69, 255, 0.15)';
      ctx!.lineWidth = 2;
      ctx!.stroke();

      // Fill under
      ctx!.lineTo(W, H);
      ctx!.lineTo(0, H);
      ctx!.closePath();
      const grad = ctx!.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(153, 69, 255, 0.06)');
      grad.addColorStop(1, 'rgba(153, 69, 255, 0)');
      ctx!.fillStyle = grad;
      ctx!.fill();

      // Glow dots at peaks
      for (let i = 0; i < points.length; i += 5) {
        const x = i * segW;
        const wobble = Math.sin(t * 0.001 + i * 0.3) * 0.03;
        const y = (1 - points[i] - wobble) * H;
        const alpha = 0.3 + Math.sin(t * 0.002 + i) * 0.2;
        ctx!.beginPath();
        ctx!.arc(x, y, 3, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(153, 69, 255, ${alpha})`;
        ctx!.fill();
      }

      raf.current = requestAnimationFrame(draw);
    }

    raf.current = requestAnimationFrame(draw);

    const onResize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}

// ─── Feature Card ───────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc, color }: {
  icon: string; title: string; desc: string; color: string;
}) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px', borderRadius: '12px',
      background: `${color}08`, border: `1px solid ${color}15`,
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`, fontSize: '18px', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{
          fontSize: '14px', fontWeight: 700, color: theme.text.primary,
          fontFamily: "'Rajdhani', sans-serif",
        }}>{title}</span>
        <span style={{
          fontSize: '13px', color: theme.text.muted, lineHeight: 1.4,
        }}>{desc}</span>
      </div>
    </div>
  );
}

// ─── Stat Pill ──────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 16px', borderRadius: '10px',
      background: 'rgba(153, 69, 255, 0.06)',
      border: `1px solid ${theme.border.subtle}`,
      flex: 1,
    }}>
      <span style={{
        fontSize: '20px', fontWeight: 800, color: '#c084fc',
        fontFamily: "'JetBrains Mono', monospace",
      }}>{value}</span>
      <span style={{
        fontSize: '11px', fontWeight: 600, color: theme.text.muted,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{label}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

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
    <div style={s.container}>
      <ChartBackground />

      <div style={{
        ...s.inner,
        ...(isMobile ? {
          flexDirection: 'column' as const,
          padding: '24px 16px',
          gap: '24px',
        } : {}),
      }}>
        {/* Left: Hero / Landing */}
        <div style={{
          ...s.heroSide,
          ...(isMobile ? { alignItems: 'center', textAlign: 'center' as const } : {}),
        }}>
          <div style={s.logoRow}>
            <div style={s.logoGem}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L28 12L16 30L4 12L16 2Z" fill="url(#gem_grad)" />
                <path d="M16 2L28 12L16 16L4 12L16 2Z" fill="rgba(255,255,255,0.2)" />
                <defs>
                  <linearGradient id="gem_grad" x1="4" y1="2" x2="28" y2="30">
                    <stop stopColor="#14F195" />
                    <stop offset="1" stopColor="#9945FF" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span style={s.logoText}>TradeGems</span>
          </div>

          <h1 style={{
            ...s.heroTitle,
            ...(isMobile ? { fontSize: '28px' } : {}),
          }}>
            Predict the Chart.<br />
            <span style={{ color: '#14F195' }}>Collect the Gems.</span>
          </h1>

          <p style={s.heroSub}>
            Skill-based crypto trading game on Solana. Bet on chart movements, hit gem multipliers, dodge bombs. 15 seconds per round.
          </p>

          {/* Stats */}
          <div style={s.statsRow}>
            <StatPill value="15s" label="Rounds" />
            <StatPill value="10x" label="Max Multi" />
            <StatPill value="0%" label="House Edge" />
          </div>

          {/* Features */}
          {!isMobile && (
            <div style={s.features}>
              <FeatureCard
                icon="💎"
                title="Gem Multipliers"
                color="#14F195"
                desc="Hit emerald gems on the chart path to multiply your bet up to 10x."
              />
              <FeatureCard
                icon="⚔️"
                title="PvP Battles"
                color="#f87171"
                desc="Challenge other traders in real-time head-to-head prediction rounds."
              />
              <FeatureCard
                icon="🏆"
                title="Leaderboards & VIP"
                color="#9945FF"
                desc="Climb the ranks, earn XP, unlock VIP tiers with rakeback rewards."
              />
            </div>
          )}

          <div style={s.poweredBy}>
            <span style={{ fontSize: '12px', color: theme.text.muted }}>Powered by</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#c084fc' }}>Solana</span>
          </div>
        </div>

        {/* Right: Auth Form */}
        <div style={{
          ...s.authSide,
          ...(isMobile ? { maxWidth: '100%' } : {}),
        }}>
          <div style={s.authCard}>
            <div style={s.authHeader}>
              <span style={s.authWelcome}>
                {mode === 'login' ? 'Welcome back' : 'Get started'}
              </span>
              <span style={s.authDesc}>
                {mode === 'login' ? 'Sign in to your account' : 'Create your trading account'}
              </span>
            </div>

            {/* Mode Toggle */}
            <div style={s.toggle}>
              <button
                onClick={() => { setMode('login'); clearError(); }}
                style={{
                  ...s.toggleBtn,
                  ...(mode === 'login' ? s.toggleBtnActive : {}),
                }}
              >
                Login
              </button>
              <button
                onClick={() => { setMode('register'); clearError(); }}
                style={{
                  ...s.toggleBtn,
                  ...(mode === 'register' ? s.toggleBtnActive : {}),
                }}
              >
                Register
              </button>
            </div>

            {error && <div style={s.error}>{error}</div>}

            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.field}>
                <label style={s.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  required
                  style={s.input}
                  autoComplete="email"
                />
              </div>

              {mode === 'register' && (
                <div style={s.field}>
                  <label style={s.label}>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="chart_sniper"
                    required
                    minLength={3}
                    maxLength={20}
                    style={s.input}
                    autoComplete="username"
                  />
                </div>
              )}

              <div style={s.field}>
                <label style={s.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 8 characters"
                  required
                  minLength={8}
                  style={s.input}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <div style={s.field}>
                  <label style={s.label}>Referral Code (optional)</label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Enter referral code"
                    style={s.input}
                    maxLength={20}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="btn-3d btn-3d-primary"
                style={{
                  ...s.submitBtn,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Connecting...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <button
              onClick={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login'); }}
              style={s.switchBtn}
            >
              {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
            </button>

            {/* Divider */}
            <div style={s.divider}>
              <div style={s.dividerLine} />
              <span style={s.dividerText}>or</span>
              <div style={s.dividerLine} />
            </div>

            {/* Phantom */}
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
                  ...s.phantomBtn,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: '20px' }}>👻</span>
                <span>{isLoading ? 'Connecting...' : 'Connect Phantom'}</span>
              </button>
            ) : (
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                style={s.installLink}
              >
                Install Phantom Wallet to connect with Solana
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10, 11, 15, 0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    zIndex: 50,
    overflow: 'auto',
  },
  inner: {
    position: 'relative' as const,
    zIndex: 1,
    display: 'flex',
    gap: '48px',
    maxWidth: '920px',
    width: '100%',
    padding: '40px',
    alignItems: 'center',
  },

  // Hero Side
  heroSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoGem: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: 800,
    fontFamily: "'Orbitron', sans-serif",
    background: 'linear-gradient(135deg, #9945FF, #14F195)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '1px',
  },
  heroTitle: {
    fontSize: '36px',
    fontWeight: 900,
    lineHeight: 1.15,
    color: theme.text.primary,
    margin: 0,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '0.5px',
  },
  heroSub: {
    fontSize: '15px',
    color: theme.text.secondary,
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '400px',
  },
  statsRow: {
    display: 'flex',
    gap: '8px',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px',
  },
  poweredBy: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
  },

  // Auth Side
  authSide: {
    width: '380px',
    flexShrink: 0,
  },
  authCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '28px',
    background: 'rgba(21, 15, 33, 0.8)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '16px',
    backdropFilter: 'blur(20px)',
  },
  authHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  authWelcome: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "'Orbitron', sans-serif",
  },
  authDesc: {
    fontSize: '14px',
    color: theme.text.muted,
  },

  // Toggle
  toggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px',
    background: theme.bg.tertiary,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  toggleBtn: {
    padding: '10px',
    background: theme.bg.tertiary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    color: theme.text.muted,
    transition: 'all 0.15s ease',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  toggleBtnActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.18)',
  },

  // Error
  error: {
    padding: '10px 14px',
    background: `${theme.danger}10`,
    border: `1px solid ${theme.danger}30`,
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.danger,
  },

  // Form
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.secondary,
  },
  input: {
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '8px',
    color: theme.text.primary,
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  submitBtn: {
    padding: '14px',
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    width: '100%',
    marginTop: '2px',
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '14px',
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
    textAlign: 'center' as const,
  },

  // Divider
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: theme.border.subtle,
  },
  dividerText: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
  },

  // Phantom
  phantomBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px',
    background: '#8b8bf5',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.1s ease',
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    boxShadow: '0 4px 0 #6565c4, 0 6px 12px rgba(139, 139, 245, 0.3)',
  },
  installLink: {
    fontSize: '14px',
    color: theme.accent.purple,
    textDecoration: 'none',
    fontFamily: 'Rajdhani, sans-serif',
    textAlign: 'center' as const,
    display: 'block',
  },
};
