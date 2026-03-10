import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSolPrice } from '../../hooks/useSolPrice';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { isPhotoAvatar, getAvatarGradient, getInitials } from '../../utils/avatars';

export function TopBar() {
  const profile = useGameStore((s) => s.profile);
  const setScreen = useGameStore((s) => s.setScreen);
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const { price } = useSolPrice();
  const [showUsd, setShowUsd] = useState(false);

  const solBalance = profile.balance / 1e9;
  const usdValue = price ? (solBalance * price).toFixed(2) : null;

  return (
    <header style={styles.bar}>
      <div style={styles.logoGroup}>
        <img src="/logo.png" alt="Trading Arena" style={styles.logoImg} />
      </div>

      <div style={styles.right}>
        {isAuthenticated ? (
          <>
            <div
              style={styles.balanceBox}
              onMouseEnter={() => !isMobile && setShowUsd(true)}
              onMouseLeave={() => !isMobile && setShowUsd(false)}
              onClick={() => isMobile && setShowUsd((v) => !v)}
            >
              <span style={styles.balanceLabel}>Balance</span>
              <div style={styles.balanceRow}>
                <img src="/sol-coin.png" alt="SOL" style={styles.solIcon} />
                <span style={styles.balanceValue} className="mono">
                  {formatSol(profile.balance)}
                </span>
              </div>
              {showUsd && usdValue && (
                <span style={styles.usdValue} className="mono">
                  ≈ ${usdValue}
                </span>
              )}
            </div>

            <button style={styles.depositBtn} onClick={() => setScreen('wallet')}>Deposit</button>

            <div style={styles.profilePill} className="profile-glow">
              {isPhotoAvatar(profile.avatarUrl) ? (
                <img
                  src={profile.avatarUrl!}
                  alt={profile.username}
                  style={styles.avatarImg}
                />
              ) : (
                <div style={{
                  ...styles.avatar,
                  background: getAvatarGradient(null, profile.username),
                }}>
                  {getInitials(profile.username)}
                </div>
              )}
              {!isMobile && (
                <div style={styles.profileInfo}>
                  <span style={styles.profileName}>{profile.username}</span>
                  <span style={styles.profileTier}>
                    Lvl {profile.level} · {profile.vipTier}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            style={styles.depositBtn}
            onClick={() => setScreen('auth')}
          >
            Login
          </button>
        )}
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '64px',
    padding: '0 16px',
    background: theme.bg.secondary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    zIndex: 100,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoImg: {
    height: '52px',
    width: 'auto',
    objectFit: 'contain',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  balanceBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    cursor: 'pointer',
    position: 'relative',
  },
  balanceLabel: {
    fontSize: '9px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  balanceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  solIcon: {
    width: '28px',
    height: '28px',
  },
  balanceValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
    lineHeight: 1.1,
  },
  usdValue: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.text.secondary,
    marginTop: '1px',
    animation: 'fadeIn 0.2s ease',
  },
  depositBtn: {
    padding: '7px 16px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    background: '#9945FF',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    boxShadow: '0 3px 0 #7325d4, 0 4px 8px rgba(153, 69, 255, 0.3)',
    transition: 'all 0.1s ease',
  },
  profilePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px 4px 4px',
    background: theme.bg.tertiary,
    borderRadius: '20px',
    border: `1px solid rgba(153, 69, 255, 0.3)`,
    cursor: 'pointer',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
  },
  avatarImg: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  profileName: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.primary,
    lineHeight: 1.2,
  },
  profileTier: {
    fontSize: '9px',
    fontWeight: 500,
    color: theme.text.muted,
  },
};
