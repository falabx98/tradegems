import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSolPrice } from '../../hooks/useSolPrice';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { isPhotoAvatar, getAvatarGradient, getInitials } from '../../utils/avatars';
import { SolIcon } from '../ui/SolIcon';
import { Icon } from '../primitives/Icon';

// ─── VIP tier colors ────────────────────────────────────────
const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  titan: '#8B5CF6',
};

interface TopBarProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export function TopBar({ onToggleSidebar, sidebarOpen = false }: TopBarProps) {
  const profile = useGameStore((s) => s.profile);
  const go = useAppNavigate();
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const { price } = useSolPrice();
  const [showUsd, setShowUsd] = useState(false);

  const solBalance = profile.balance / 1e9;
  const usdValue = price ? (solBalance * price).toFixed(2) : null;

  const tierColor = TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze;
  const xpPct = profile.xpToNext > 0 ? Math.min(100, Math.floor((profile.xp / profile.xpToNext) * 100)) : 0;

  return (
    <header style={s.bar}>
      {/* Left: hamburger + logo */}
      <div style={s.left}>
        {onToggleSidebar && !isMobile && (
          <button style={s.hamburger} onClick={onToggleSidebar} aria-label="Toggle sidebar">
            <div style={{ width: 18, height: 14, position: 'relative' }}>
              <span style={{
                ...s.menuLine,
                top: sidebarOpen ? 6 : 0,
                transform: sidebarOpen ? 'rotate(45deg)' : 'rotate(0deg)',
              }} />
              <span style={{
                ...s.menuLine,
                top: 6,
                opacity: sidebarOpen ? 0 : 1,
              }} />
              <span style={{
                ...s.menuLine,
                top: sidebarOpen ? 6 : 12,
                transform: sidebarOpen ? 'rotate(-45deg)' : 'rotate(0deg)',
              }} />
            </div>
          </button>
        )}
        <div style={s.logoGroup} onClick={() => go('lobby')}>
          <img src={isMobile ? '/mobile-logo.png' : '/logo-big-screens.png'} alt="TradeGems" style={{ ...s.logoImg, height: isMobile ? '36px' : '44px' }} />
        </div>
      </div>

      {/* Right: XP bar + balance + deposit + avatar */}
      <div style={s.right}>
        {isAuthenticated ? (
          <>
            {/* XP Level Pill */}
            <div style={s.xpPill} onClick={() => go('rewards' as any)}>
              <span style={{
                ...s.levelBadge,
                background: `${tierColor}22`,
                color: tierColor,
                borderColor: `${tierColor}44`,
              }}>
                {profile.level}
              </span>
              <div style={s.xpBarOuter}>
                <div style={{
                  ...s.xpBarInner,
                  width: `${xpPct}%`,
                  background: tierColor,
                  boxShadow: `0 0 6px ${tierColor}66`,
                }} />
              </div>
              {!isMobile && (
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, whiteSpace: 'nowrap' }}>
                  {xpPct}%
                </span>
              )}
            </div>

            {/* Balance pill */}
            <div
              style={s.balancePill}
              onMouseEnter={() => !isMobile && setShowUsd(true)}
              onMouseLeave={() => !isMobile && setShowUsd(false)}
              onClick={() => isMobile ? setShowUsd((v) => !v) : go('wallet')}
            >
              <img src="/sol-coin.png" alt="SOL" style={s.solIcon} />
              <span style={s.balanceValue} className="mono">
                {showUsd && usdValue ? `$${usdValue}` : <>{formatSol(profile.balance)} <SolIcon size="0.9em" /></>}
              </span>
              {profile.lockedBalance > 0 && !showUsd && (
                <span style={{ fontSize: 9, color: theme.accent.amber, fontWeight: 600, opacity: 0.8 }} className="mono">
                  +{formatSol(profile.lockedBalance)} in play
                </span>
              )}
            </div>

            {/* Deposit button */}
            <button style={s.depositBtn} onClick={() => go('wallet')}>
              {isMobile ? <Icon name="arrow-up" size={16} /> : 'Deposit'}
            </button>

            {/* Wallet button (desktop only) */}
            {!isMobile && (
              <button style={s.walletBtn} onClick={() => go('wallet')}>
                Wallet
              </button>
            )}

            {/* Profile avatar */}
            <div style={s.avatar} onClick={() => go('settings')}>
              {isPhotoAvatar(profile.avatarUrl) ? (
                <img src={profile.avatarUrl!} alt={profile.username} style={s.avatarImg} />
              ) : (
                <div style={{
                  ...s.avatarFallback,
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
              <div onClick={() => go('auth')} style={s.bonusPill}>
                100% Deposit Bonus
              </div>
            )}
            <button style={s.logInBtn} onClick={() => go('auth')}>
              Log In
            </button>
            <button style={s.signUpBtn} onClick={() => go('auth')}>
              Sign Up
            </button>
          </>
        )}
      </div>
    </header>
  );
}

const s: Record<string, CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: theme.layout.headerHeight,
    padding: '0 16px',
    background: theme.bg.sidebar,
    borderBottom: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  hamburger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'transparent',
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    minWidth: '36px',
    minHeight: '36px',
  },
  menuLine: {
    position: 'absolute' as const,
    left: 0,
    width: '100%',
    height: 2,
    background: theme.text.secondary,
    borderRadius: 1,
    transition: 'all 200ms ease',
    transformOrigin: 'center',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  logoImg: {
    height: '44px',
    width: 'auto',
    objectFit: 'contain' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  // ─── XP bar ─────────────────────────
  xpPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    background: theme.bg.base,
    borderRadius: theme.radius.full,
    border: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    minHeight: 32,
  },
  levelBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 800,
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '1px solid',
    flexShrink: 0,
    fontFamily: "'JetBrains Mono', monospace",
  },
  xpBarOuter: {
    width: 60,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  xpBarInner: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.5s ease-out',
    minWidth: 1,
  },
  // ─── Balance / actions ─────────────
  balancePill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: theme.bg.base,
    borderRadius: theme.radius.full,
    border: `1px solid ${theme.border.default}`,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    minHeight: 38,
  },
  solIcon: {
    width: '16px',
    height: '16px',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FFFFFF',
    fontFamily: "'JetBrains Mono', monospace",
  },
  depositBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#FFFFFF',
    background: theme.accent.primary,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.3px',
    minHeight: '38px',
    minWidth: '38px',
    transition: 'background 0.15s ease',
  },
  walletBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.default}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: '38px',
    transition: 'all 0.15s ease',
  },
  logInBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
    background: 'transparent',
    border: `1px solid ${theme.border.default}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: '38px',
    transition: 'all 0.15s ease',
  },
  signUpBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#fff',
    background: theme.accent.primary,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.3px',
    minHeight: '38px',
    transition: 'background 0.15s ease',
  },
  bonusPill: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderRadius: theme.radius.full,
    border: '1px solid rgba(139, 92, 246, 0.15)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.accent.lavender,
    whiteSpace: 'nowrap' as const,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    border: `2px solid ${theme.border.default}`,
    transition: 'border-color 0.15s ease',
    minWidth: 34,
    minHeight: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
  },
};
