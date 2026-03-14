import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSolPrice } from '../../hooks/useSolPrice';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { isPhotoAvatar, getAvatarGradient, getInitials } from '../../utils/avatars';

export function TopBar() {
  const profile = useGameStore((s) => s.profile);
  const go = useAppNavigate();
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const { price } = useSolPrice();
  const [showUsd, setShowUsd] = useState(false);

  const solBalance = profile.balance / 1e9;
  const usdValue = price ? (solBalance * price).toFixed(2) : null;

  return (
    <header style={styles.bar}>
      {/* Logo */}
      <div style={styles.logoGroup} onClick={() => go('lobby')}>
        <img src="/logo.png" alt="TradeGems" style={styles.logoImg} />
      </div>

      {/* Right side */}
      <div style={styles.right}>
        {isAuthenticated ? (
          <>
            {/* Balance pill */}
            <div
              style={styles.balancePill}
              onMouseEnter={() => !isMobile && setShowUsd(true)}
              onMouseLeave={() => !isMobile && setShowUsd(false)}
              onClick={() => isMobile && setShowUsd((v) => !v)}
            >
              <img src="/sol-coin.png" alt="SOL" style={styles.solIcon} />
              <span style={styles.balanceValue} className="mono">
                {showUsd && usdValue ? `$${usdValue}` : `${formatSol(profile.balance)} SOL`}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Wallet button */}
            <button style={styles.walletBtn} onClick={() => go('wallet')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Wallet
            </button>

            {/* Profile avatar */}
            <div style={styles.avatar} onClick={() => go('settings')}>
              {isPhotoAvatar(profile.avatarUrl) ? (
                <img src={profile.avatarUrl!} alt={profile.username} style={styles.avatarImg} />
              ) : (
                <div style={{
                  ...styles.avatarFallback,
                  background: getAvatarGradient(null, profile.username),
                }}>
                  {getInitials(profile.username)}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {!isMobile && (
              <div
                onClick={() => go('auth')}
                style={styles.ctaPill}
                className="cta-glow"
              >
                <span>Play Free — 1 SOL Bonus</span>
              </div>
            )}
            <button style={styles.walletBtn} onClick={() => go('auth')}>
              LOGIN
            </button>
          </>
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
    height: theme.layout.headerHeight,
    padding: '0 20px',
    background: theme.bg.primary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  },
  logoImg: {
    height: '32px',
    width: 'auto',
    objectFit: 'contain' as const,
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '1.5px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  balancePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: theme.bg.secondary,
    borderRadius: '6px',
    border: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  solIcon: {
    width: '20px',
    height: '20px',
  },
  balanceValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },
  walletBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    background: theme.accent.purple,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  ctaPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #7717ff, #886cff)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  avatarFallback: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
  },
};
