import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { ContentGame } from '../primitives/ContentContainer';

export function ResponsibleGamblingScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();
  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  const sectionTitle: React.CSSProperties = {
    fontSize: ts('lg'), fontWeight: 700, color: theme.text.primary,
    marginBottom: gap.md, marginTop: gap.xl,
  };
  const bodyText: React.CSSProperties = {
    fontSize: ts('md'), color: theme.text.secondary, lineHeight: 1.7,
  };
  const card: React.CSSProperties = {
    background: theme.bg.secondary, borderRadius: theme.radius.lg,
    border: `1px solid ${theme.border.subtle}`, padding: `${gap.lg}px`,
    marginBottom: gap.md,
  };

  return (
    <ContentGame style={{ paddingTop: gap.lg, paddingBottom: gap.xl }}>
      <button onClick={() => go('lobby')} style={{ background: 'none', border: 'none', color: theme.text.muted, fontSize: ts('sm'), cursor: 'pointer', fontFamily: 'inherit', padding: `${gap.sm}px 0`, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to Casino
      </button>

      <h1 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: '#fff', marginTop: gap.md, marginBottom: gap.sm }}>
        Responsible Gambling
      </h1>
      <p style={bodyText}>
        TradeGems is committed to providing a safe and enjoyable experience. Gambling should always be entertainment — never a way to make money or solve financial problems.
      </p>

      <h2 style={sectionTitle}>Tips for Responsible Play</h2>
      <div style={card}>
        <ul style={{ ...bodyText, margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: gap.sm }}>
          <li>Set a budget before you start playing and stick to it</li>
          <li>Never chase losses — if you're on a losing streak, take a break</li>
          <li>Set time limits for your gaming sessions</li>
          <li>Don't gamble when you're upset, stressed, or under the influence</li>
          <li>Remember that the house always has an edge — losing is part of the experience</li>
          <li>Gambling should be fun, not a source of income</li>
          <li>Take regular breaks during play</li>
        </ul>
      </div>

      <h2 style={sectionTitle}>Session Reminders</h2>
      <div style={card}>
        <p style={bodyText}>
          TradeGems will remind you how long you've been playing every 60 minutes. You can adjust this interval or disable it in your settings.
        </p>
      </div>

      <h2 style={sectionTitle}>Signs of Problem Gambling</h2>
      <div style={card}>
        <ul style={{ ...bodyText, margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: gap.sm }}>
          <li>Spending more money or time gambling than you can afford</li>
          <li>Borrowing money or selling possessions to gamble</li>
          <li>Lying to friends or family about gambling</li>
          <li>Feeling restless or irritable when not gambling</li>
          <li>Gambling to escape problems or negative feelings</li>
          <li>Chasing losses by increasing bets</li>
          <li>Neglecting work, school, or personal responsibilities</li>
        </ul>
      </div>

      <h2 style={sectionTitle}>Get Help</h2>
      <div style={card}>
        <p style={bodyText}>If you or someone you know has a gambling problem, these resources can help:</p>
        <div style={{ marginTop: gap.md, display: 'flex', flexDirection: 'column', gap: gap.md }}>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.purple }}>National Council on Problem Gambling</div>
            <div style={{ fontSize: ts('sm'), color: theme.text.muted }}>1-800-522-4700 (24/7)</div>
            <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: ts('sm'), color: theme.accent.purple, textDecoration: 'none' }}>www.ncpgambling.org</a>
          </div>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.purple }}>Gamblers Anonymous</div>
            <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: ts('sm'), color: theme.accent.purple, textDecoration: 'none' }}>www.gamblersanonymous.org</a>
          </div>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.purple }}>BeGambleAware</div>
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: ts('sm'), color: theme.accent.purple, textDecoration: 'none' }}>www.begambleaware.org</a>
          </div>
        </div>
      </div>

      <h2 style={sectionTitle}>Contact Support</h2>
      <div style={card}>
        <p style={bodyText}>
          If you need assistance with responsible gambling features, deposit limits, or self-exclusion, contact us:
        </p>
        <div style={{ marginTop: gap.sm, fontSize: ts('md'), fontWeight: 600, color: theme.accent.purple }}>
          support@tradegems.gg
        </div>
      </div>
    </ContentGame>
  );
}
