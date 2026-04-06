import { useState } from 'react';
import { ContentWide } from '../primitives/ContentContainer';
import { theme } from '../../styles/theme';

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is TradeGems?',
    a: 'PvP trading casino on Solana. All games are provably fair with SHA-256 verification. You play with SOL.',
  },
  {
    q: 'Is it provably fair?',
    a: 'Yes. Server seed + client seed, SHA-256 hashed. You can verify any bet after it settles on the Fairness page.',
  },
  {
    q: 'How do deposits work?',
    a: 'Go to Wallet, copy your unique deposit address, send SOL from any wallet. Deposits confirm in seconds.',
  },
  {
    q: 'How do withdrawals work?',
    a: 'Go to Wallet, enter your amount, confirm. SOL is sent on-chain to your wallet address. No delays.',
  },
  {
    q: 'What makes it different?',
    a: 'Games are skill-based and trading-themed. You compete against other players, not the house. Instant Solana settlement. Up to 10% rakeback.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: theme.bg.surface,
      border: `1px solid ${theme.border.subtle}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: theme.text.primary, lineHeight: 1.3 }}>
          {q}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round"
          style={{ flexShrink: 0, marginLeft: 12, transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px', fontSize: 13, color: theme.text.secondary, lineHeight: 1.6 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export function FAQScreen() {
  return (
    <ContentWide style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: theme.text.primary, margin: '0 0 16px' }}>
        FAQ
      </h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FAQ.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
      </div>
    </ContentWide>
  );
}
