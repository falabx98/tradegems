import { useGameStore } from '../../stores/gameStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { NavIcon } from '../layout/NavIcons';
import { playButtonClick, hapticLight } from '../../utils/sounds';

const GAMES = [
  { id: 'solo', route: 'setup', label: 'Solo', icon: 'play' },
  { id: 'prediction', route: 'prediction', label: 'Predictions', icon: 'candles' },
  { id: 'trading-sim', route: 'trading-sim', label: 'Trading Sim', icon: 'chart' },
  { id: 'candleflip', route: 'candleflip', label: 'Candleflip', icon: 'swords' },
  { id: 'rug-game', route: 'rug-game', label: 'Rug Game', icon: 'terminal' },
  { id: 'lottery', route: 'lottery', label: 'Lottery', icon: 'diamond' },
] as const;

export interface GamesSheetProps {
  open: boolean;
  onClose: () => void;
}

export function GamesSheet({ open, onClose }: GamesSheetProps) {
  const screen = useGameStore((s) => s.screen);
  const go = useAppNavigate();
  const activeId = screen === 'setup' ? 'solo' : screen;

  if (!open) return null;

  const handleGame = (route: string) => {
    playButtonClick();
    hapticLight();
    onClose();
    go(route);
  };

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.60)',
          zIndex: 198,
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed',
        bottom: theme.layout.bottomNavHeight,
        left: 0,
        right: 0,
        background: theme.bg.secondary,
        borderTop: `1px solid ${theme.border.medium}`,
        borderRadius: `${theme.radius.xl} ${theme.radius.xl} 0 0`,
        padding: '16px',
        zIndex: 199,
        animation: 'slideUp 0.2s ease-out',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}>
          {GAMES.map((game) => {
            const isActive = activeId === game.id;
            return (
              <button
                key={game.id}
                onClick={() => handleGame(game.route)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 8px',
                  background: isActive ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: theme.radius.md,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s ease',
                  minHeight: '44px',
                }}
              >
                <NavIcon
                  name={game.icon}
                  size={24}
                  color={isActive ? theme.accent.purple : theme.text.secondary}
                />
                <span style={{
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? theme.accent.purple : theme.text.primary,
                }}>
                  {game.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
