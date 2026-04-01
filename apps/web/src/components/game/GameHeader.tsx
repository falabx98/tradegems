import { useState } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { playButtonClick, hapticLight } from '../../utils/sounds';

export interface GameHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  backTo?: string;
  howToPlay?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export function GameHeader({ title, subtitle, icon, backTo = 'lobby', howToPlay, rightSlot }: GameHeaderProps) {
  const go = useAppNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const handleBack = () => {
    playButtonClick();
    hapticLight();
    go(backTo);
  };

  return (
    <>
      <div style={s.root}>
        <div style={s.left}>
          <button style={s.backBtn} onClick={handleBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.text.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {icon && <div style={s.iconWrap}>{icon}</div>}
          <div>
            <div style={s.title}>{title}</div>
            {subtitle && <div style={s.subtitle}>{subtitle}</div>}
          </div>
        </div>
        <div style={s.right}>
          {rightSlot}
          {howToPlay && (
            <button style={s.helpBtn} onClick={() => setShowHelp(v => !v)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.text.secondary} strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {showHelp && howToPlay && (
        <div style={s.helpPanel}>
          {howToPlay}
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    gap: '12px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    flexShrink: 0,
    minWidth: '40px',
    minHeight: '40px',
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: theme.radius.md,
    flexShrink: 0,
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.primary,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: '13px',
    color: theme.text.muted,
    lineHeight: 1.3,
    marginTop: '2px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  helpBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'transparent',
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    minWidth: '40px',
    minHeight: '40px',
  },
  helpPanel: {
    padding: '12px 16px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    marginTop: '8px',
    animation: 'screenFadeIn 0.15s ease-out both',
  },
};
