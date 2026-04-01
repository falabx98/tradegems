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
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
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
          <button style={s.hamburger} onClick={onToggleSidebar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <div style={s.logoGroup} onClick={() => go('lobby')}>
          <img src={isMobile ? '/logo.png' : '/logo-big-screens.png'} alt="TradeGems" style={{ ...s.logoImg, height: isMobile ? '38px' : '50px' }} />
        </div>
      </div>

      {/* Right: XP bar + balance + deposit + avatar */}
      <div style={s.right}>
        {isAuthenticated ? (
          <>
            {/* XP Level Pill — always visible */}
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

            {/* Demo balance pill — only when user has demo but no real balance */}
            {profile.demoBalance > 0 && profile.balance === 0 && (
              <div style={{
                ...s.balancePill,
                background: 'rgba(139, 92, 246, 0.15)',
                borderColor: 'rgba(139, 92, 246, 0.3)',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#8B5CF6', letterSpacing: '0.05em' }}>DEMO</span>
                <span style={{ ...s.balanceValue, color: '#A78BFA' }} className="mono">
                  {formatSol(profile.demoBalance)}
                </span>
              </div>
            )}

            {/* Deposit button */}
            <button style={s.depositBtn} onClick={() => go('wallet')}>
              {isMobile ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ) : 'Deposit'}
            </button>

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
            <button style={s.loginBtn} onClick={() => go('auth')}>
              LOGIN
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
    padding: `0 ${theme.gap.lg}px`,
    background: theme.bg.secondary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.gap.md,
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
    minWidth: '40px',
    minHeight: '40px',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
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
    gap: theme.gap.sm,
  },
  // ─── XP bar ─────────────────────────
  xpPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    background: theme.bg.primary,
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
    width: 40,
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
    gap: theme.gap.sm,
    padding: `${theme.gap.xs}px ${theme.gap.md}px`,
    background: theme.bg.primary,
    borderRadius: theme.radius.full,
    border: `1px solid ${theme.border.medium}`,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    minHeight: 40,
  },
  solIcon: {
    width: '16px',
    height: '16px',
  },
  balanceValue: {
    fontSize: theme.textSize.md.mobile,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  depositBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '7px 16px',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.text.inverse,
    background: theme.accent.neonGreen,
    border: 'none',
    borderRadius: theme.radius.full,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
    minHeight: '40px',
    minWidth: '40px',
  },
  loginBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#fff',
    background: theme.gradient.primary,
    border: 'none',
    borderRadius: theme.radius.full,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
    minHeight: '40px',
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
    width: 36,
    height: 36,
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    border: `2px solid ${theme.border.medium}`,
    transition: 'border-color 0.15s ease',
    minWidth: 40,
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
  },
};
