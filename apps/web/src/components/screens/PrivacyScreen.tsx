import type { CSSProperties } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { ContentNarrow } from '../primitives/ContentContainer';

const P = ({ style, ...props }: any) => <span style={{ ...ph, ...style }} {...props} />;

export function PrivacyScreen() {
  const go = useAppNavigate();
  return (
    <ContentNarrow style={{ paddingTop: 24, paddingBottom: 64 }}>
      <button onClick={() => go('lobby')} style={back}>&larr; Back</button>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={sub}>Last updated: March 2026</p>

      <Section n="1" title="Introduction">
        <p style={p}>TradeGems (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the TradeGems crypto casino platform at tradegems.gg. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform. By using TradeGems, you consent to the practices described in this policy.</p>
      </Section>

      <Section n="2" title="Information We Collect">
        <h3 style={h3}>2.1 Account Information</h3>
        <p style={p}>When you create an account, we collect:</p>
        <ul style={ul}><li>Solana wallet address (public key)</li><li>Username (chosen by you)</li><li>Email address (if provided for password recovery)</li><li>Authentication credentials (hashed, never stored in plain text)</li></ul>

        <h3 style={h3}>2.2 Transaction Data</h3>
        <p style={p}>We automatically collect:</p>
        <ul style={ul}><li>Deposit and withdrawal transactions (amounts, timestamps, Solana transaction signatures)</li><li>Betting history (game type, amounts, outcomes, timestamps)</li><li>Balance changes and ledger entries</li></ul>

        <h3 style={h3}>2.3 Usage Data</h3>
        <p style={p}>We collect analytics data including:</p>
        <ul style={ul}><li>Pages visited and features used</li><li>Session duration and frequency</li><li>Device type, browser, and operating system</li><li>IP address (for security and fraud prevention)</li><li>Game preferences and play patterns</li></ul>

        <h3 style={h3}>2.4 Cookies and Local Storage</h3>
        <p style={p}>We use browser local storage for authentication tokens (JWT), user preferences, and session state. We do not use third-party tracking cookies or advertising cookies.</p>
      </Section>

      <Section n="3" title="How We Use Your Information">
        <p style={p}>We use collected information to:</p>
        <ul style={ul}>
          <li>Operate and maintain the platform</li>
          <li>Process deposits, withdrawals, and game settlements</li>
          <li>Verify provably fair game outcomes</li>
          <li>Prevent fraud, money laundering, and abuse</li>
          <li>Enforce responsible gambling measures (deposit limits, self-exclusion)</li>
          <li>Improve the platform based on usage patterns</li>
          <li>Communicate with you about your account</li>
          <li>Comply with legal obligations</li>
        </ul>
      </Section>

      <Section n="4" title="Information Sharing">
        <p style={p}>We do NOT sell your personal information. We may share information with:</p>
        <ul style={ul}>
          <li><strong>Blockchain networks:</strong> Solana transaction data is public by nature</li>
          <li><strong>Service providers:</strong> hosting (Vercel, Railway), database (PostgreSQL) — under strict data processing agreements</li>
          <li><strong>Legal authorities:</strong> when required by law, court order, or to prevent harm</li>
          <li>In aggregated, anonymized form for analytics and reporting</li>
        </ul>
      </Section>

      <Section n="5" title="Data Security">
        <p style={p}>We implement security measures including encrypted connections (HTTPS/TLS), hashed passwords (bcrypt), JWT tokens with session revocation, rate limiting, role-based admin access controls, and audit logging of all sensitive operations.</p>
        <p style={p}>However, no method of electronic transmission is 100% secure. We cannot guarantee absolute security.</p>
      </Section>

      <Section n="6" title="Data Retention">
        <ul style={ul}>
          <li>Account data: retained while your account is active and for <P>[PLACEHOLDER: X years]</P> after closure</li>
          <li>Transaction data: retained for <P>[PLACEHOLDER: X years]</P> for regulatory compliance</li>
          <li>Analytics data: retained for 12 months, then aggregated/anonymized</li>
          <li>You may request deletion of your account by contacting support@tradegems.gg</li>
        </ul>
      </Section>

      <Section n="7" title="Your Rights">
        <p style={p}>Depending on your jurisdiction, you may have the right to: access the personal data we hold about you, correct inaccurate data, request deletion (subject to legal retention requirements), object to processing, and data portability.</p>
        <p style={p}>To exercise these rights, contact support@tradegems.gg.</p>
      </Section>

      <Section n="8" title="Age Restriction">
        <p style={p}>TradeGems is strictly for users aged 18 and over (or the legal gambling age in your jurisdiction, whichever is higher). We do not knowingly collect information from minors. If we discover that a minor has created an account, we will terminate it immediately.</p>
      </Section>

      <Section n="9" title="International Users">
        <p style={p}>It is your responsibility to ensure that your use of TradeGems complies with the laws of your jurisdiction.</p>
      </Section>

      <Section n="10" title="Changes to This Policy">
        <p style={p}>We may update this Privacy Policy from time to time. We will notify users of material changes via the platform. Continued use after changes constitutes acceptance.</p>
      </Section>

      <Section n="11" title="Contact">
        <p style={p}>For privacy-related inquiries:</p>
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
const h3: CSSProperties = { fontSize: 15, fontWeight: 600, color: theme.text.secondary, margin: '16px 0 8px' };
const p: CSSProperties = { fontSize: 14, color: theme.text.secondary, lineHeight: 1.7, margin: '8px 0' };
const ul: CSSProperties = { fontSize: 14, color: theme.text.secondary, lineHeight: 1.8, paddingLeft: 20, margin: '8px 0' };
const ph: CSSProperties = { color: '#F59E0B', background: 'rgba(245,158,11,0.08)', padding: '1px 6px', borderRadius: 4, fontSize: 13 };
