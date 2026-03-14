import { useState, useEffect } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/theme';
import { api, apiFetch } from '../../utils/api';
import { formatSol, lamportsToSol, solToLamports } from '../../utils/sol';

// ─── Module-level state for the profile target ──────────────────────────────

let _targetPlayerId: string | null = null;
export function setProfileTarget(id: string) { _targetPlayerId = id; }
export function getProfileTarget() { return _targetPlayerId; }

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface PublicProfile {
  id: string;
  username: string;
  level: number;
  vipTier: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalWagered: number;
  totalWon: number;
  roundsPlayed: number;
  bestMultiplier: string;
  winRate: string;
  currentStreak: number;
  bestStreak: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlayerProfileScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tip modal state
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [tipSending, setTipSending] = useState(false);
  const [tipResult, setTipResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const playerId = getProfileTarget();
    if (!playerId) {
      setError('No player selected.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await apiFetch<PublicProfile>(`/v1/users/${playerId}/profile`);
        setProfile(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load player profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Loading
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.centerWrap}>
          <span style={styles.loadingText}>Loading profile...</span>
        </div>
      </div>
    );
  }

  // Error
  if (error || !profile) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => go('lobby')} style={styles.backBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={styles.headerTitle}>Player Profile</span>
          <div style={{ width: '36px' }} />
        </div>
        <div style={styles.centerWrap}>
          <span style={styles.errorText}>{error || 'Profile not found.'}</span>
          <button onClick={() => go('lobby')} style={styles.backBtnLarge}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const vipColor = (theme.vip as any)[profile.vipTier] || theme.text.muted;

  const statsData = [
    { label: 'Rounds Played', value: profile.roundsPlayed.toLocaleString() },
    { label: 'Win Rate', value: `${(parseFloat(profile.winRate) * 100).toFixed(1)}%` },
    { label: 'Best Multiplier', value: `${parseFloat(profile.bestMultiplier).toFixed(2)}x` },
    { label: 'Total Wagered', value: `${formatSol(profile.totalWagered)} SOL` },
    { label: 'Total Won', value: `${formatSol(profile.totalWon)} SOL` },
    { label: 'Best Streak', value: profile.bestStreak.toLocaleString() },
  ];

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => go('lobby')} style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={styles.headerTitle}>Player Profile</span>
        <div style={{ width: '36px' }} />
      </div>

      <div style={styles.content}>
        {/* Profile Card */}
        <div style={styles.profileCard}>
          {/* Avatar */}
          <div style={styles.avatarWrap}>
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.username} style={styles.avatar} />
            ) : (
              <div style={styles.avatarFallback}>
                <span style={styles.avatarInitial}>
                  {profile.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Level Badge */}
            <div style={styles.levelBadge}>
              <span style={styles.levelBadgeText}>{profile.level}</span>
            </div>
          </div>

          {/* Name & VIP */}
          <div style={styles.nameSection}>
            <span style={styles.displayName}>
              {profile.displayName || profile.username}
            </span>
            <span style={styles.usernameLabel}>@{profile.username}</span>
            <div style={{
              ...styles.vipBadge,
              color: vipColor,
              borderColor: vipColor,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={vipColor} fillOpacity="0.3" stroke={vipColor} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span style={styles.vipText}>{profile.vipTier.toUpperCase()}</span>
            </div>
          </div>

          {/* Current Streak */}
          {profile.currentStreak > 0 && (
            <div style={styles.streakBadge}>
              <span style={styles.streakText}>
                {profile.currentStreak} win streak
              </span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{
          ...styles.statsGrid,
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        }}>
          {statsData.map((stat) => (
            <div key={stat.label} style={styles.statCard}>
              <span style={styles.statLabel}>{stat.label}</span>
              <span style={styles.statValue} className="mono">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Send Tip Button */}
        <button onClick={() => {
          if (!isAuthenticated) { go('lobby'); return; }
          setShowTipModal(true);
          setTipResult(null);
          setTipAmount('');
          setTipMessage('');
        }} style={styles.tipBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Send Tip
        </button>
      </div>

      {/* Tip Modal */}
      {showTipModal && profile && (
        <div style={styles.modalOverlay} onClick={() => !tipSending && setShowTipModal(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Send Tip</span>
              <button onClick={() => !tipSending && setShowTipModal(false)} style={styles.modalClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <span style={styles.modalSubtitle}>
              Sending to <strong style={{ color: '#c084fc' }}>@{profile.username}</strong>
            </span>

            {tipResult ? (
              <div style={{
                padding: '16px',
                borderRadius: '10px',
                background: tipResult.success ? 'rgba(20, 241, 149, 0.1)' : 'rgba(255, 69, 58, 0.1)',
                border: `1px solid ${tipResult.success ? 'rgba(20, 241, 149, 0.3)' : 'rgba(255, 69, 58, 0.3)'}`,
                textAlign: 'center',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: tipResult.success ? '#14F195' : '#ff453a',
                }}>{tipResult.message}</span>
              </div>
            ) : (
              <>
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>Amount (SOL)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.01"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    style={styles.input}
                  />
                  <div style={styles.quickAmounts}>
                    {['0.01', '0.05', '0.1', '0.5'].map((amt) => (
                      <button key={amt} onClick={() => setTipAmount(amt)} style={{
                        ...styles.quickBtn,
                        ...(tipAmount === amt ? { background: 'rgba(119, 23, 255, 0.2)', color: '#c084fc' } : {}),
                      }}>{amt}</button>
                    ))}
                  </div>
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>Message (optional)</label>
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="Nice play!"
                    value={tipMessage}
                    onChange={(e) => setTipMessage(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <button
                  onClick={async () => {
                    const solVal = parseFloat(tipAmount);
                    if (!solVal || solVal < 0.001) {
                      setTipResult({ success: false, message: 'Minimum tip is 0.001 SOL' });
                      return;
                    }
                    setTipSending(true);
                    try {
                      await api.sendTip({
                        recipientUsername: profile.username,
                        amount: solToLamports(solVal),
                        message: tipMessage || undefined,
                      });
                      setTipResult({ success: true, message: `Sent ${solVal} SOL to @${profile.username}!` });
                    } catch (err: any) {
                      setTipResult({ success: false, message: err?.message || 'Failed to send tip' });
                    } finally {
                      setTipSending(false);
                    }
                  }}
                  disabled={tipSending || !tipAmount}
                  style={{
                    ...styles.sendBtn,
                    ...(tipSending || !tipAmount ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  }}
                >
                  {tipSending ? 'Sending...' : `Send ${tipAmount ? parseFloat(tipAmount) + ' SOL' : 'Tip'}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  },

  centerWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
  },
  loadingText: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  errorText: {
    fontSize: '14px',
    color: theme.danger,
  },
  backBtnLarge: {
    marginTop: '8px',
    padding: '10px 24px',
    background: 'rgba(119, 23, 255, 0.15)',
    border: '1px solid rgba(119, 23, 255, 0.3)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: theme.bg.secondary,
    color: theme.text.secondary,
    cursor: 'pointer',
  },
  headerTitle: {
    flex: 1,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "inherit",
    textTransform: 'uppercase',
    letterSpacing: '1px',
    textAlign: 'center',
  },

  // Content
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '520px',
    margin: '0 auto',
    width: '100%',
  },

  // Profile Card
  profileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 20px',
    background: 'linear-gradient(135deg, rgba(119, 23, 255, 0.12), rgba(20, 241, 149, 0.06))',
    border: '1px solid rgba(119, 23, 255, 0.2)',
    borderRadius: '14px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '3px solid rgba(119, 23, 255, 0.3)',
    objectFit: 'cover',
  },
  avatarFallback: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7717ff, #14F195)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '3px solid rgba(119, 23, 255, 0.3)',
  },
  avatarInitial: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#fff',
    fontFamily: "inherit",
  },
  levelBadge: {
    position: 'absolute',
    bottom: '-4px',
    right: '-4px',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: '#7717ff',
    border: '2px solid #0e0a16',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 8px rgba(119, 23, 255, 0.5)',
  },
  levelBadgeText: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#fff',
    fontFamily: '"JetBrains Mono", monospace',
  },

  nameSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  displayName: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "inherit",
    letterSpacing: '1px',
  },
  usernameLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  vipBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '20px',
    border: '1px solid',
    background: 'rgba(0, 0, 0, 0.2)',
    marginTop: '4px',
  },
  vipText: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    fontFamily: "inherit",
  },

  streakBadge: {
    padding: '4px 14px',
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.25)',
    borderRadius: '20px',
  },
  streakText: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#fbbf24',
    fontFamily: 'inherit',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Stats Grid
  statsGrid: {
    display: 'grid',
    gap: '10px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "inherit",
    letterSpacing: '0.5px',
  },

  // Tip Button
  tipBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px',
    background: 'linear-gradient(135deg, rgba(119, 23, 255, 0.2), rgba(20, 241, 149, 0.1))',
    border: '1px solid rgba(119, 23, 255, 0.3)',
    borderRadius: '10px',
    color: '#c084fc',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    transition: 'all 0.15s ease',
  },

  // Tip Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalCard: {
    width: '100%',
    maxWidth: '380px',
    background: theme.bg.primary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: theme.text.primary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  modalClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.06)',
    color: theme.text.muted,
    cursor: 'pointer',
  },
  modalSubtitle: {
    fontSize: '14px',
    color: theme.text.muted,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  inputLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  input: {
    padding: '10px 14px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    color: theme.text.primary,
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  },
  quickAmounts: {
    display: 'flex',
    gap: '6px',
    marginTop: '4px',
  },
  quickBtn: {
    flex: 1,
    padding: '6px 0',
    background: 'rgba(255, 255, 255, 0.04)',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '6px',
    color: theme.text.secondary,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  },
  sendBtn: {
    padding: '14px',
    background: 'linear-gradient(135deg, #7717ff, #14F195)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
};
