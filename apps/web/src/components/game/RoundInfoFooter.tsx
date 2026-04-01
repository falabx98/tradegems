import { theme } from '../../styles/theme';
import { useAppNavigate } from '../../hooks/useAppNavigate';

export interface RoundInfoFooterProps {
  roundNumber?: number;
  seedHash?: string;
  showVerify?: boolean;
}

export function RoundInfoFooter({ roundNumber, seedHash, showVerify = true }: RoundInfoFooterProps) {
  const go = useAppNavigate();

  if (!roundNumber && !seedHash) return null;

  return (
    <div style={s.root}>
      {roundNumber !== undefined && (
        <span style={s.item}>Round #{roundNumber}</span>
      )}
      {roundNumber && seedHash && <span style={s.dot}>·</span>}
      {seedHash && (
        <span style={s.item} className="mono">
          {seedHash.slice(0, 12)}…
        </span>
      )}
      {showVerify && (
        <>
          <span style={s.dot}>·</span>
          <button
            style={s.verifyLink}
            onClick={() => go('fairness')}
          >
            Verify →
          </button>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 0',
    flexWrap: 'wrap',
  },
  item: {
    fontSize: '11px',
    color: theme.text.muted,
    fontWeight: 500,
  },
  dot: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  verifyLink: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.accent.purple,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
};
