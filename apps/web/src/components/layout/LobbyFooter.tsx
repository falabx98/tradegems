import type { CSSProperties } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { Icon } from '../primitives/Icon';

// ─── Trust Badge Items ──────────────────────────────────────

const TRUST_ITEMS = [
  { icon: 'shield', label: 'Provably Fair' },
  { icon: 'clock', label: 'Instant Settlement' },
  { icon: 'solana', label: 'Solana Powered' },
  { icon: 'shield', label: '18+' },
];

// ─── Link Column ─────────────────────────────────────────────

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={colTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function FooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={colLink}
      onMouseEnter={e => { (e.target as HTMLElement).style.color = theme.text.primary; }}
      onMouseLeave={e => { (e.target as HTMLElement).style.color = theme.text.secondary; }}
    >
      {label}
    </span>
  );
}

function FooterSocialLink({ icon, href }: { icon: React.ReactNode; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={socialLink}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
        (e.currentTarget as HTMLElement).style.borderColor = theme.border.default;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = theme.bg.elevated;
        (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle;
      }}
    >
      {icon}
    </a>
  );
}

// ─── Main Footer ─────────────────────────────────────────────

export function LobbyFooter() {
  const go = useAppNavigate();
  const isMobile = useIsMobile();

  return (
    <footer style={{
      ...footerBase,
      // Break out of <main> padding to go full-width edge-to-edge
      marginLeft: isMobile ? -8 : -24,
      marginRight: isMobile ? -8 : -24,
      marginBottom: isMobile ? -80 : -24, // mobile has 80px paddingBottom for BottomNav
      paddingBottom: isMobile ? 80 : 0,   // re-add space so content isn't hidden behind BottomNav
      width: isMobile ? 'calc(100% + 16px)' : 'calc(100% + 48px)',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: isMobile ? '32px 12px 24px' : '48px 24px 32px',
      }}>
        {/* ─── 4-Column Grid ─── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? 28 : 40,
          marginBottom: 40,
        }}>
          {/* Col 1: Games */}
          <FooterColumn title="Games">
            <FooterLink label="Rug Game" onClick={() => go('rug-game')} />
            <FooterLink label="Mines" onClick={() => go('mines')} />
            <FooterLink label="Candleflip" onClick={() => go('candleflip')} />
            <FooterLink label="Predictions" onClick={() => go('prediction')} />
            <FooterLink label="Trading Sim" onClick={() => go('trading-sim')} />
            <FooterLink label="Solo" onClick={() => go('setup')} />
          </FooterColumn>

          {/* Col 2: Features */}
          <FooterColumn title="Features">
            <FooterLink label="Provably Fair" onClick={() => go('fairness')} />
            <FooterLink label="Referrals" onClick={() => go('rewards')} />
            <FooterLink label="VIP Club" onClick={() => go('season')} />
            <FooterLink label="Daily Missions" onClick={() => go('rewards')} />
          </FooterColumn>

          {/* Col 3: Info */}
          <FooterColumn title="Info">
            <FooterLink label="About" onClick={() => go('about')} />
            <FooterLink label="FAQ" onClick={() => go('faq')} />
            <FooterLink label="Provably Fair" onClick={() => go('fairness')} />
            <FooterLink label="Terms" onClick={() => go('terms')} />
            <FooterLink label="Privacy" onClick={() => go('privacy')} />
            <FooterLink label="Responsible Gambling" onClick={() => go('responsible-gambling')} />
          </FooterColumn>

          {/* Col 4: Community */}
          <div style={{ minWidth: 0 }}>
            <div style={colTitle}>Community</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <FooterSocialLink icon={<Icon name="twitter-x" size={20} />} href="https://x.com/tradegems" />
              <FooterSocialLink icon={<Icon name="telegram" size={20} />} href="https://t.me/tradegems" />
              <FooterSocialLink icon={<Icon name="discord" size={20} />} href="https://discord.gg/tradegems" />
            </div>
          </div>
        </div>

        {/* ─── Trust Badges ─── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-start',
          flexWrap: 'wrap',
          gap: isMobile ? 8 : 12,
          marginBottom: 24,
        }}>
          {TRUST_ITEMS.map((item) => (
            <div key={item.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: theme.text.muted,
              whiteSpace: 'nowrap',
            }}>
              <Icon name={item.icon} size={14} style={{ color: theme.text.disabled }} />
              {item.label}
            </div>
          ))}
        </div>

        {/* ─── Divider ─── */}
        <div style={{ height: 1, background: theme.border.subtle, marginBottom: 24 }} />

        {/* ─── Bottom Bar ─── */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 12 : 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/logo.png"
              alt="TradeGems"
              draggable={false}
              style={{ height: 24, width: 'auto', opacity: 0.7 }}
            />
            <span style={bottomText}>© 2026 TradeGems</span>
          </div>
          <span style={{
            ...bottomText,
            textAlign: isMobile ? 'center' : 'right',
          }}>
            18+ | Gambling can be addictive. Play responsibly.
          </span>
        </div>

        {/* ─── Responsible Gambling Disclaimer ─── */}
        <div style={{
          borderTop: `1px solid ${theme.border.subtle}`,
          marginTop: 24,
          padding: '16px 0',
          textAlign: 'center',
          fontSize: 12,
          color: theme.text.muted,
          lineHeight: 1.6,
        }}>
          <div>18+ | Gambling can be addictive. Please play responsibly.</div>
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{ color: theme.text.secondary, cursor: 'pointer', textDecoration: 'none' }}
              onClick={() => go('responsible-gambling')}
            >
              Responsible Gambling
            </span>
            <span style={{ color: theme.text.muted }}>·</span>
            <a
              href="https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.text.secondary, textDecoration: 'none' }}
            >
              Problem Gambling Helpline
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Styles ─────────────────────────────────────────────────

// Base footer style — getFooterStyle adds responsive breakout margins
const footerBase: CSSProperties = {
  background: theme.bg.sidebar,
  borderTop: `1px solid ${theme.border.subtle}`,
  marginTop: 40,
};

const colTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary,
  marginBottom: 14,
};

const colLink: CSSProperties = {
  fontSize: 13,
  color: theme.text.secondary,
  cursor: 'pointer',
  transition: 'color 0.15s ease',
  textDecoration: 'none',
  lineHeight: 1.4,
};

const socialLink: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  color: theme.text.secondary,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'all 150ms ease',
  borderRadius: 10,
  border: `1px solid ${theme.border.subtle}`,
  background: theme.bg.elevated,
};

const bottomText: CSSProperties = {
  fontSize: 12,
  color: theme.text.muted,
};
