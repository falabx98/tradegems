import { Button } from '../primitives';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { playButtonClick, hapticLight } from '../../utils/sounds';

export interface ResultActionsProps {
  onPlayAgain: () => void;
  showShare?: boolean;
  onShare?: () => void;
  playAgainLabel?: string;
}

export function ResultActions({ onPlayAgain, showShare, onShare, playAgainLabel = 'Play Again' }: ResultActionsProps) {
  const go = useAppNavigate();

  const handleLobby = () => {
    playButtonClick();
    hapticLight();
    go('lobby');
  };

  const handlePlayAgain = () => {
    playButtonClick();
    hapticLight();
    onPlayAgain();
  };

  return (
    <div style={s.root}>
      <div style={s.mainRow}>
        <Button variant="primary" size="lg" fullWidth onClick={handlePlayAgain}>
          {playAgainLabel}
        </Button>
        <Button variant="ghost" size="lg" onClick={handleLobby} style={{ flexShrink: 0 }}>
          Lobby
        </Button>
      </div>
      {showShare && onShare && (
        <Button variant="ghost-accent" size="sm" onClick={onShare} fullWidth>
          Share Win
        </Button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  mainRow: {
    display: 'flex',
    gap: '8px',
  },
};
