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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
                <span>100% Deposit Bonus</span>
              </div>
            )}
            <button style={styles.loginBtn} onClick={() => go('auth')}>
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
    background: theme.bg.secondary,
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
    height: '40px',
    width: 'auto',
    objectFit: 'contain' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  balancePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    background: 'rgba(139, 92, 246, 0.06)',
    borderRadius: '10px',
    border: `1px solid rgba(139, 92, 246, 0.12)`,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  },
  solIcon: {
    width: '18px',
    height: '18px',
  },
  balanceValue: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.accent.purple,
  },
  walletBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#fff',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },
  loginBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 24px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#fff',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
    letterSpacing: '1px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    border: '2px solid rgba(139, 92, 246, 0.2)',
    transition: 'border-color 0.2s ease',
  },
  avatarImg: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  ctaPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 16px',
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.3px',
  },
  avatarFallback: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 700,
    color: '#fff',
  },
};
