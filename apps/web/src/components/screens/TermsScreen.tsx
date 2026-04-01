import type { CSSProperties } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { ContentNarrow } from '../primitives/ContentContainer';

const P = ({ style, ...props }: any) => <span style={{ ...ph, ...style }} {...props} />;

export function TermsScreen() {
  const go = useAppNavigate();
  return (
    <ContentNarrow style={{ paddingTop: 24, paddingBottom: 64 }}>
      <button onClick={() => go('lobby')} style={back}>&larr; Back</button>
      <h1 style={h1}>Terms of Service</h1>
      <p style={sub}>Last updated: March 2026</p>

      <Section n="1" title="Acceptance of Terms">
        <p style={p}>By accessing or using TradeGems (tradegems.gg), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the platform. TradeGems is operated by <P>[PLACEHOLDER: Legal entity name and registration]</P>.</p>
      </Section>

      <Section n="2" title="Eligibility">
        <p style={p}>To use TradeGems, you must:</p>
        <ul style={ul}>
          <li>Be at least 18 years old (or the legal gambling age in your jurisdiction)</li>
          <li>Ensure that your use of TradeGems complies with the laws of your jurisdiction</li>
          <li>Have the legal capacity to enter into a binding agreement</li>
          <li>Not be self-excluded from gambling services</li>
        </ul>
        <p style={p}>You are solely responsible for ensuring that your use of TradeGems is lawful in your jurisdiction.</p>
      </Section>

      <Section n="3" title="Account Registration">
        <ul style={ul}>
          <li>You may register using a Solana wallet or email/password</li>
          <li>You must provide accurate information</li>
          <li>You are responsible for maintaining the security of your account credentials</li>
          <li>One account per person — multiple accounts are prohibited and will be terminated</li>
          <li>We reserve the right to suspend or terminate accounts that violate these Terms</li>
        </ul>
      </Section>

      <Section n="4" title="Deposits and Withdrawals">
        <ul style={ul}>
          <li>Deposits are made in SOL (Solana) to a unique deposit address generated for your account</li>
          <li>Deposits require blockchain confirmations before being credited</li>
          <li>Withdrawals are processed to your registered Solana wallet</li>
          <li>Withdrawal processing times may vary; we aim to process within <P>[PLACEHOLDER: timeframe]</P></li>
          <li>We reserve the right to request identity verification before processing large withdrawals</li>
          <li>Minimum withdrawal: <P>[PLACEHOLDER: amount]</P> SOL</li>
          <li>Transaction fees (Solana network fees) are borne by the user</li>
        </ul>
      </Section>

      <Section n="5" title="Games and Betting">
        <ul style={ul}>
          <li>TradeGems offers original provably fair games</li>
          <li>All game outcomes are determined by cryptographic algorithms (SHA-256 provably fair seeding)</li>
          <li>You can verify any game outcome using our Provably Fair verification tool</li>
          <li>House edges vary by game and are disclosed in each game&apos;s information panel</li>
          <li>Maximum bet limits and payout caps apply and may be adjusted</li>
          <li>We reserve the right to void bets placed in error or through exploitation of bugs</li>
        </ul>
      </Section>

      <Section n="6" title="Provably Fair">
        <p style={p}>All games use server seed + client seed + nonce to generate outcomes. Server seeds are hashed (SHA-256) and shown before the game begins. After the game, the unhashed server seed is revealed for verification. You can independently verify any game result using our verification tool or any SHA-256 tool.</p>
      </Section>

      <Section n="7" title="Bonuses and Promotions">
        <ul style={ul}>
          <li>Bonuses are subject to terms specified at the time of the offer</li>
          <li>Wager requirements (rollover) may apply — you must wager the specified multiple of the bonus amount before withdrawing bonus-derived funds</li>
          <li>We reserve the right to modify or cancel promotions at any time</li>
          <li>Abuse of bonus offers (including multiple accounts, systematic exploitation) will result in forfeiture of bonus funds and potential account termination</li>
          <li>Maximum bet while a bonus is active may be limited</li>
        </ul>
      </Section>

      <Section n="8" title="Responsible Gambling">
        <p style={p}>Gambling should be for entertainment purposes only. You can set deposit limits, loss limits, and session time reminders in Settings. Self-exclusion is available for 24 hours, 7 days, 30 days, or permanently. We reserve the right to limit or close accounts if we believe gambling is causing harm.</p>
        <p style={p}>Resources: National Council on Problem Gambling (1-800-522-4700), Gamblers Anonymous, BeGambleAware.</p>
      </Section>

      <Section n="9" title="Prohibited Activities">
        <p style={p}>You agree NOT to:</p>
        <ul style={ul}>
          <li>Use the platform if you are under 18 or if online gambling is prohibited in your jurisdiction</li>
          <li>Create multiple accounts</li>
          <li>Use bots, scripts, or automated tools to play games (unless explicitly authorized)</li>
          <li>Exploit bugs, glitches, or errors in games or the platform</li>
          <li>Engage in money laundering, fraud, or any illegal activity</li>
          <li>Collude with other players to manipulate game outcomes</li>
          <li>Attempt to reverse-engineer, hack, or compromise the platform</li>
          <li>Abuse bonus offers or promotions</li>
          <li>Harass, threaten, or abuse other users or staff</li>
        </ul>
      </Section>

      <Section n="10" title="Intellectual Property">
        <p style={p}>TradeGems, its logo, game designs, and all content are owned by <P>[PLACEHOLDER: Legal entity]</P>. You may not copy, modify, distribute, or create derivative works without permission. All game names, artwork, and mechanics are proprietary.</p>
      </Section>

      <Section n="11" title="Limitation of Liability">
        <p style={p}>TradeGems is provided &quot;as is&quot; without warranties of any kind. We are not liable for losses resulting from: blockchain network issues, wallet errors, unauthorized access to your account, or technical failures beyond our control. Our total liability is limited to the balance in your account at the time of the claim.</p>
        <p style={p}>We are not responsible for any tax obligations arising from your use of the platform — you are solely responsible for reporting and paying any applicable taxes.</p>
      </Section>

      <Section n="12" title="Dispute Resolution">
        <ul style={ul}>
          <li>Any disputes should first be directed to support@tradegems.gg</li>
          <li>If not resolved, disputes will be settled by <P>[PLACEHOLDER: arbitration body or jurisdiction]</P></li>
          <li>These Terms are governed by the laws of <P>[PLACEHOLDER: jurisdiction]</P></li>
        </ul>
      </Section>

      <Section n="13" title="Modifications">
        <p style={p}>We may modify these Terms at any time. Material changes will be communicated via the platform. Continued use after changes constitutes acceptance. If you disagree with changes, you must stop using the platform and withdraw your funds.</p>
      </Section>

      <Section n="14" title="Termination">
        <p style={p}>You may close your account at any time by contacting support. We may terminate or suspend your account for violation of these Terms. Upon termination, you may withdraw your remaining balance (unless funds are frozen due to investigation). Provisions that by their nature should survive (liability, disputes, IP) will survive termination.</p>
      </Section>

      <Section n="15" title="Contact">
        <p style={p}>For questions about these Terms:</p>
        <p style={p}>Email: <span style={{ color: theme.accent.purple }}>support@tradegems.gg</span></p>
        <p style={p}><P>[PLACEHOLDER: Physical address of operating entity]</P></p>
      </Section>
    </ContentNarrow>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={h2}>{n}. {title}</h2>
      {children}
    </div>
  );
}

const back: CSSProperties = { background: 'none', border: 'none', color: theme.text.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0', marginBottom: 8 };
const h1: CSSProperties = { fontSize: 28, fontWeight: 800, color: '#fff', margin: '8px 0 4px' };
const sub: CSSProperties = { fontSize: 13, color: theme.text.muted, marginBottom: 24 };
const h2: CSSProperties = { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 };
const p: CSSProperties = { fontSize: 14, color: theme.text.secondary, lineHeight: 1.7, margin: '8px 0' };
const ul: CSSProperties = { fontSize: 14, color: theme.text.secondary, lineHeight: 1.8, paddingLeft: 20, margin: '8px 0' };
const ph: CSSProperties = { color: '#F59E0B', background: 'rgba(245,158,11,0.08)', padding: '1px 6px', borderRadius: 4, fontSize: 13 };
