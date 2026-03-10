import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSolPrice } from '../../hooks/useSolPrice';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';

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
        <div style={styles.logoMark}>TA</div>
        {!isMobile && (
          <div style={styles.logoText}>
            <span style={styles.logoTitle}>Trading Arena</span>
            <span style={styles.logoSub}>v0.1 alpha</span>
          </div>
        )}
      </div>

      {!isMobile && (
        <div style={styles.center}>
          <div style={styles.liveDot} />
          <span style={styles.liveText}>LIVE</span>
        </div>
      )}

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
              <div style={styles.avatar}>
                {profile.username.charAt(0).toUpperCase()}
              </div>
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
    height: '52px',
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
  logoMark: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    background: `rgba(153, 69, 255, 0.1)`,
    border: `1px solid rgba(153, 69, 255, 0.15)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#c084fc',
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
  },
  logoTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.primary,
    letterSpacing: '0.5px',
  },
  logoSub: {
    fontSize: '9px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: theme.success,
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveText: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.success,
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
    width: '20px',
    height: '20px',
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
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    background: '#9945FF',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
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
    background: theme.bg.card,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: theme.text.primary,
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
