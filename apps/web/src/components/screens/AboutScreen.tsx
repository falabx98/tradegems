import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { ContentGame } from '../primitives/ContentContainer';

export function AboutScreen() {
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
      {/* Back */}
      <button onClick={() => go('lobby')} style={{ background: 'none', border: 'none', color: theme.text.muted, fontSize: ts('sm'), cursor: 'pointer', fontFamily: 'inherit', padding: `${gap.sm}px 0`, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to Casino
      </button>

      <h1 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: '#fff', marginTop: gap.md, marginBottom: gap.xs }}>About TradeGems</h1>
      <p style={{ ...bodyText, marginBottom: gap.lg }}>
        TradeGems is a crypto-native casino built on Solana. All games are original, provably fair, and settle instantly on-chain.
      </p>

      {/* How It Works */}
      <h2 style={sectionTitle}>How It Works</h2>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: gap.md }}>
        {[
          { step: '1', title: 'Connect & Deposit', desc: 'Sign in with email or Solana wallet. Deposit SOL to your TradeGems balance.' },
          { step: '2', title: 'Pick a Game', desc: 'Choose from 7 original games — chart games, board games, PvP, and jackpots.' },
          { step: '3', title: 'Play & Withdraw', desc: 'Win SOL with provably fair outcomes. Withdraw your balance anytime.' },
        ].map(s => (
          <div key={s.step} style={card}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme.accent.purple, marginBottom: gap.sm }}>{s.step}</div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary, marginBottom: gap.xs }}>{s.title}</div>
            <div style={{ fontSize: ts('sm'), color: theme.text.muted }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Security */}
      <h2 style={sectionTitle}>Security & Fairness</h2>
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: gap.md }}>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.neonGreen, marginBottom: gap.xs }}>Provably Fair</div>
            <div style={bodyText}>Every game result is generated using cryptographic seeds that can be verified after each round. <span style={{ color: theme.accent.purple, cursor: 'pointer', fontWeight: 600 }} onClick={() => go('fairness')}>Learn more →</span></div>
          </div>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.amber, marginBottom: gap.xs }}>Instant Settlement</div>
            <div style={bodyText}>All bets settle immediately. No pending periods, no delayed payouts. Your balance updates in real-time.</div>
          </div>
          <div>
            <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.accent.purple, marginBottom: gap.xs }}>Solana-Powered</div>
            <div style={bodyText}>Built on Solana for fast, low-cost transactions. Deposits and withdrawals process on-chain.</div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <h2 style={sectionTitle}>FAQ</h2>
      {[
        { q: 'How do deposits work?', a: 'Generate a unique SOL deposit address in your wallet. Send any amount of SOL (minimum 0.01). Your balance updates automatically after blockchain confirmation.' },
        { q: 'How long do withdrawals take?', a: 'Withdrawals are processed within minutes. The SOL is sent directly to your connected wallet address on the Solana blockchain.' },
        { q: 'What is provably fair?', a: 'Every game result is determined by a cryptographic seed committed before you place your bet. After the round, you can verify the seed and independently calculate the result. This proves the casino cannot manipulate outcomes.' },
        { q: 'What are the house edges?', a: 'Each game has a transparent house edge embedded in the payout multipliers. Typical range: 5% across most games. The edge is never hidden — it is built into the published multiplier tables.' },
        { q: 'How does the VIP system work?', a: 'Every SOL you wager earns XP. As you level up, you climb VIP tiers (Bronze → Silver → Gold → Platinum → Titan) with increasing rakeback percentages returned to your balance.' },
        { q: 'What games are available?', a: 'TradeGems has 6 original games: Mines, Rug Game, Candleflip, Predictions, Solo, and Trading Sim. All are provably fair and exclusive to TradeGems.' },
      ].map((faq, i) => (
        <div key={i} style={{ ...card, cursor: 'default' }}>
          <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary, marginBottom: gap.xs }}>{faq.q}</div>
          <div style={{ fontSize: ts('sm'), color: theme.text.secondary, lineHeight: 1.6 }}>{faq.a}</div>
        </div>
      ))}

      {/* Responsible Gambling */}
      <h2 style={sectionTitle}>Responsible Gambling</h2>
      <div style={card}>
        <div style={bodyText}>
          Gambling should be entertainment, not a source of income. Never bet more than you can afford to lose.
          If you or someone you know has a gambling problem, please seek help:
        </div>
        <div style={{ marginTop: gap.md, display: 'flex', flexDirection: 'column', gap: gap.xs }}>
          <span style={{ fontSize: ts('sm'), color: theme.accent.purple }}>• National Council on Problem Gambling: 1-800-522-4700</span>
          <span style={{ fontSize: ts('sm'), color: theme.accent.purple }}>• Gamblers Anonymous: www.gamblersanonymous.org</span>
          <span style={{ fontSize: ts('sm'), color: theme.accent.purple }}>• BeGambleAware: www.begambleaware.org</span>
        </div>
      </div>

      {/* Contact */}
      <h2 style={sectionTitle}>Contact</h2>
      <div style={card}>
        <div style={bodyText}>
          For support, questions, or feedback:
        </div>
        <div style={{ marginTop: gap.sm, fontSize: ts('md'), fontWeight: 600, color: theme.accent.purple }}>
          support@tradegems.gg
        </div>
      </div>
    </ContentGame>
  );
}
