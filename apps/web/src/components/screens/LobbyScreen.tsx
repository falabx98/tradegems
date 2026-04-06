import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile, useIsTablet } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { SolIcon } from '../ui/SolIcon';
import { ContentLobby } from '../primitives/ContentContainer';
import { Modal } from '../primitives/Modal';
import { GameCard } from '../game/GameCard';
import { lobbyTrack, funnelTrack, retentionTrack } from '../../utils/analytics';
import { LobbyFooter } from '../layout/LobbyFooter';
import { BetsPanel } from '../ui/BetsPanel';
import { OnboardingModal } from './OnboardingModal';

// ─── VIP tier helpers ───────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2', titan: '#8B5CF6',
};

function getNextTier(current: string): string {
  const order = ['bronze', 'silver', 'gold', 'platinum', 'titan'];
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : 'titan';
}

function getNextRakeback(current: string): string {
  const rates: Record<string, string> = { bronze: '2', silver: '3', gold: '5', platinum: '8', titan: '8' };
  return rates[current] || '2';
}

// ─── Game definitions ───────────────────────────────────────

interface GameDef {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  image: string;
  tags: string[];
  defaultBadge?: 'pvp' | 'new' | null;
}

const GAMES: GameDef[] = [
  { id: 'rug-game', route: 'rug-game', title: 'Rug Game', subtitle: 'Crash-style multiplier', image: '/game-rug-game.webp', tags: ['skill', 'popular'] },
  { id: 'mines', route: 'mines', title: 'Mines', subtitle: 'Grid reveal', image: '/game-mines.png', tags: ['skill', 'popular'], defaultBadge: null },
  { id: 'candleflip', route: 'candleflip', title: 'Candleflip', subtitle: 'Over/under 1.00x', image: '/game-candleflip.webp', tags: ['quick'] },
  { id: 'predictions', route: 'prediction', title: 'Predictions', subtitle: 'Up or down', image: '/game-predictions.webp', tags: ['quick'] },
  { id: 'trading-sim', route: 'trading-sim', title: 'Trading Sim', subtitle: 'PvP rooms', image: '/game-trading-sim.webp', tags: ['skill', 'pvp'], defaultBadge: 'pvp' },
  { id: 'solo', route: 'setup', title: 'Solo', subtitle: 'Trade vs chart', image: '/game-solo.webp', tags: ['skill'] },
  { id: 'lottery', route: 'lottery', title: 'Lottery', subtitle: 'Jackpot draw', image: '/game-lottery.webp', tags: ['quick'], defaultBadge: 'new' },
];

const SKILL_GAMES = GAMES.filter(g => g.tags.includes('skill'));
const QUICK_GAMES = GAMES.filter(g => g.tags.includes('quick'));

// ─── Promo Banner Data ──────────────────────────────────────

const PROMO_BANNERS = [
  {
    id: 'deposit', badge: 'LIMITED TIME', highlight: '100%', title: 'DEPOSIT BONUS',
    subtitle: 'Double your first deposit up to 10 SOL.',
    gradient: 'linear-gradient(135deg, #1a0533 0%, #2d1b69 25%, #4c1d95 55%, #7c3aed 100%)',
    glowColor: '#a78bfa', badgeBg: 'rgba(167,139,250,0.25)', badgeBorder: 'rgba(167,139,250,0.4)',
    badgeColor: '#c4b5fd', highlightColor: '#c4b5fd', accentGlow: 'rgba(167,139,250,0.4)', link: 'wallet',
  },
  {
    id: 'jackpot', badge: 'JACKPOT LIVE', highlight: '250 SOL', title: 'LOTTERY JACKPOT',
    subtitle: 'Next draw in 6h. Tickets still open.',
    gradient: 'linear-gradient(135deg, #052e16 0%, #064e3b 25%, #047857 55%, #10b981 100%)',
    glowColor: '#34d399', badgeBg: 'rgba(52,211,153,0.25)', badgeBorder: 'rgba(52,211,153,0.4)',
    badgeColor: '#6ee7b7', highlightColor: '#6ee7b7', accentGlow: 'rgba(52,211,153,0.4)', link: 'lottery',
  },
  {
    id: 'vip', badge: 'VIP REWARDS', highlight: '10%', title: 'RAKEBACK',
    subtitle: 'Up to 10% back on every bet. 6 VIP tiers.',
    gradient: 'linear-gradient(135deg, #1c0a00 0%, #78350f 25%, #b45309 55%, #f59e0b 100%)',
    glowColor: '#fbbf24', badgeBg: 'rgba(251,191,36,0.25)', badgeBorder: 'rgba(251,191,36,0.4)',
    badgeColor: '#fde68a', highlightColor: '#fde68a', accentGlow: 'rgba(251,191,36,0.4)', link: 'rewards',
  },
  {
    id: 'referral', badge: 'NEW PROGRAM', highlight: '5%', title: 'REFER & EARN',
    subtitle: '5% of your referrals\' wagers. Forever.',
    gradient: 'linear-gradient(135deg, #0c1229 0%, #1e3a5f 25%, #1d4ed8 55%, #3b82f6 100%)',
    glowColor: '#60a5fa', badgeBg: 'rgba(96,165,250,0.25)', badgeBorder: 'rgba(96,165,250,0.4)',
    badgeColor: '#bfdbfe', highlightColor: '#bfdbfe', accentGlow: 'rgba(96,165,250,0.4)', link: 'rewards',
  },
];

// ─── Category tabs ──────────────────────────────────────────

const CATEGORIES = [
  { id: 'all', label: 'All Games' },
  { id: 'skill', label: 'Skill-Based' },
  { id: 'quick', label: 'Quick Play' },
];

// ─── Decorative Art Compositions ────────────────────────────

function DepositArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 900, color: '#fff', boxShadow: '0 0 60px rgba(20,241,149,0.5), 0 0 120px rgba(153,69,255,0.3)', border: '4px solid rgba(255,255,255,0.15)', zIndex: 3 }}>S</div>
      <div style={{ position: 'absolute', top: '18%', left: '22%', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900, color: '#fff', boxShadow: '0 0 40px rgba(20,241,149,0.4)', border: '3px solid rgba(255,255,255,0.12)', transform: 'rotate(-12deg)', zIndex: 2, opacity: 0.85 }}>S</div>
      <div style={{ position: 'absolute', bottom: '18%', right: '15%', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', boxShadow: '0 0 30px rgba(20,241,149,0.35)', border: '2px solid rgba(255,255,255,0.1)', transform: 'rotate(15deg)', zIndex: 2, opacity: 0.75 }}>S</div>
      <div style={{ position: 'absolute', top: '28%', right: '18%', padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', fontSize: 24, fontWeight: 900, color: '#fff', boxShadow: '0 4px 24px rgba(124,58,237,0.6)', transform: 'rotate(6deg)', zIndex: 4, letterSpacing: -1 }}>2x</div>
      <div style={{ position: 'absolute', bottom: '28%', left: '12%', padding: '5px 12px', borderRadius: 8, background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)', fontSize: 15, fontWeight: 800, color: '#e9d5ff', boxShadow: '0 3px 16px rgba(109,40,217,0.5)', transform: 'rotate(-4deg)', zIndex: 4 }}>+100%</div>
      <div style={{ position: 'absolute', top: '30%', left: '40%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)', zIndex: 0 }} />
    </div>
  );
}

function JackpotArt() {
  const Ball = ({ n, size, bg, top, left, right, bottom, z = 2, shadow }: any) => (
    <div style={{ position: 'absolute', top, left, right, bottom, width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 900, color: '#fff', boxShadow: shadow || '0 6px 24px rgba(0,0,0,0.3)', zIndex: z, border: '3px solid rgba(255,255,255,0.18)' }}>{n}</div>
  );
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '15%', left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: '46%', left: '46%', transform: 'translate(-50%, -50%)', width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, fontWeight: 900, color: '#fff', boxShadow: '0 0 60px rgba(20,241,149,0.5), 0 0 120px rgba(153,69,255,0.25)', border: '4px solid rgba(255,255,255,0.15)', zIndex: 3 }}>S</div>
      <Ball n="7"  size={50} bg="linear-gradient(135deg, #fbbf24, #d97706)" top="5%"   left="38%"  z={4} shadow="0 6px 28px rgba(251,191,36,0.5)" />
      <Ball n="21" size={44} bg="linear-gradient(135deg, #a78bfa, #7c3aed)" top="18%"  right="4%"  z={4} shadow="0 6px 24px rgba(124,58,237,0.5)" />
      <Ball n="42" size={40} bg="linear-gradient(135deg, #f87171, #dc2626)" bottom="14%" right="10%" z={4} shadow="0 6px 24px rgba(239,68,68,0.5)" />
      <Ball n="13" size={38} bg="linear-gradient(135deg, #2dd4bf, #0d9488)" bottom="12%" left="18%"  z={4} shadow="0 6px 24px rgba(20,184,166,0.5)" />
      <Ball n="8"  size={34} bg="linear-gradient(135deg, #60a5fa, #2563eb)" top="15%"  left="10%"  z={2} shadow="0 6px 20px rgba(37,99,235,0.4)" />
      <div style={{ position: 'absolute', bottom: '30%', left: '4%', width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195, #9945FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', boxShadow: '0 0 24px rgba(20,241,149,0.35)', border: '2px solid rgba(255,255,255,0.1)', zIndex: 2, opacity: 0.8 }}>S</div>
      <div style={{ position: 'absolute', bottom: '4%', left: '28%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', fontSize: 14, fontWeight: 900, color: '#78350f', boxShadow: '0 4px 20px rgba(251,191,36,0.5)', transform: 'rotate(-3deg)', zIndex: 5, letterSpacing: 1 }}>JACKPOT</div>
    </div>
  );
}

function VipArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '45%', left: '48%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
        <div style={{ width: 100, height: 100, borderRadius: 20, background: 'linear-gradient(135deg, #fbbf24, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 50px rgba(251,191,36,0.5), 0 8px 32px rgba(0,0,0,0.3)', border: '3px solid rgba(255,255,255,0.15)' }}>
          {/* Trophy SVG instead of emoji */}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>
      </div>
      <div style={{ position: 'absolute', top: '12%', right: '10%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', fontSize: 14, fontWeight: 800, color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.5)', transform: 'rotate(6deg)', zIndex: 4 }}>DIAMOND</div>
      <div style={{ position: 'absolute', bottom: '18%', left: '18%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #d97706, #fbbf24)', fontSize: 14, fontWeight: 800, color: '#78350f', boxShadow: '0 4px 20px rgba(251,191,36,0.5)', transform: 'rotate(-4deg)', zIndex: 4 }}>TITAN</div>
      {/* Star SVGs instead of emojis */}
      <svg style={{ position: 'absolute', top: '8%', left: '30%', zIndex: 2, filter: 'drop-shadow(0 3px 12px rgba(251,191,36,0.6))' }} width="32" height="32" viewBox="0 0 24 24" fill="#fbbf24" stroke="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <svg style={{ position: 'absolute', bottom: '10%', right: '25%', zIndex: 2, filter: 'drop-shadow(0 3px 10px rgba(251,191,36,0.5))' }} width="24" height="24" viewBox="0 0 24 24" fill="#fbbf24" stroke="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </div>
  );
}

function ReferralArt() {
  // Person SVG for avatar circles
  const PersonIcon = ({ size }: { size: number }) => (
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '42%', left: '45%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 50px rgba(37,99,235,0.5), 0 8px 32px rgba(0,0,0,0.3)', border: '3px solid rgba(255,255,255,0.15)' }}>
          {/* Handshake / link SVG instead of emoji */}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      </div>
      {[
        { top: '12%', left: '20%', size: 48, color: '#8b5cf6' },
        { top: '15%', right: '15%', size: 44, color: '#06b6d4' },
        { bottom: '15%', left: '12%', size: 40, color: '#f43f5e' },
        { bottom: '20%', right: '18%', size: 44, color: '#10b981' },
      ].map((a: any, i) => (
        <div key={i} style={{ position: 'absolute', top: a.top, left: a.left, right: a.right, bottom: a.bottom, width: a.size, height: a.size, borderRadius: '50%', background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 20px ${a.color}55`, border: '2px solid rgba(255,255,255,0.12)', zIndex: 2 }}>
          <PersonIcon size={a.size} />
        </div>
      ))}
      <div style={{ position: 'absolute', top: '58%', right: '6%', padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #60a5fa)', fontSize: 22, fontWeight: 900, color: '#fff', boxShadow: '0 4px 24px rgba(37,99,235,0.6)', transform: 'rotate(4deg)', zIndex: 4 }}>5%</div>
      <div style={{ position: 'absolute', bottom: '10%', left: '30%', padding: '5px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #059669, #34d399)', fontSize: 13, fontWeight: 800, color: '#fff', boxShadow: '0 3px 16px rgba(52,211,153,0.5)', transform: 'rotate(-3deg)', zIndex: 4 }}>FOREVER</div>
    </div>
  );
}

const ART_MAP: Record<string, React.FC> = { deposit: DepositArt, jackpot: JackpotArt, vip: VipArt, referral: ReferralArt };

// ─── Promo Banner Carousel ──────────────────────────────────

function PromoBanner({ banner }: { banner: typeof PROMO_BANNERS[0] }) {
  const Art = ART_MAP[banner.id];
  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden', background: banner.gradient,
      height: 280, flex: '1 1 0', minWidth: 0,
      cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${banner.accentGlow}`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', zIndex: 1, opacity: 0.04, background: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, white 8px, white 10px)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, zIndex: 5, background: `linear-gradient(90deg, transparent, ${banner.glowColor}, transparent)`, boxShadow: `0 0 20px ${banner.accentGlow}` }} />
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', padding: '24px 24px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 0, zIndex: 3 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, width: 'fit-content', textTransform: 'uppercase' as const, background: banner.badgeBg, color: banner.badgeColor, border: `1px solid ${banner.badgeBorder}` }}>
            {banner.badge}
          </div>
          <div style={{ fontWeight: 900, fontSize: 52, lineHeight: 1, letterSpacing: -3, color: banner.highlightColor, textShadow: `0 0 40px ${banner.accentGlow}` }}>
            {banner.highlight}
          </div>
          <div style={{ fontWeight: 900, fontSize: 26, lineHeight: 1.05, color: '#fff', letterSpacing: -1, textTransform: 'uppercase' as const }}>
            {banner.title}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 500, maxWidth: 280, lineHeight: 1.4, marginTop: 4 }}>
            {banner.subtitle}
          </div>
        </div>
        <div style={{ width: '40%', position: 'relative', flexShrink: 0 }}>
          {Art && <Art />}
        </div>
      </div>
    </div>
  );
}

function PromoBannerCarousel({ go }: { go: (s: string) => void }) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % PROMO_BANNERS.length), 6000);
    return () => clearInterval(t);
  }, []);

  if (isMobile) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' as any, scrollSnapType: 'x mandatory', padding: '2px 0' }}>
          {PROMO_BANNERS.map((b, i) => (
            <div key={i} onClick={() => go(b.link)} style={{
              position: 'relative', borderRadius: 12, overflow: 'hidden', background: b.gradient,
              minWidth: '85vw', minHeight: 180, scrollSnapAlign: 'start' as const, cursor: 'pointer', padding: '20px 20px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
            }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent, ${b.glowColor}, transparent)` }} />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, width: 'fit-content', textTransform: 'uppercase' as const, background: b.badgeBg, color: b.badgeColor, border: `1px solid ${b.badgeBorder}` }}>{b.badge}</div>
              <div style={{ fontWeight: 900, fontSize: 44, lineHeight: 1, letterSpacing: -2, color: b.highlightColor, textShadow: `0 0 30px ${b.accentGlow}` }}>{b.highlight}</div>
              <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.05, color: '#fff', letterSpacing: -0.5, textTransform: 'uppercase' as const }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, lineHeight: 1.3 }}>{b.subtitle}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visible = [0, 1, 2].map(offset => PROMO_BANNERS[(active + offset) % PROMO_BANNERS.length]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, height: 280 }}>
        {visible.map((b) => (
          <div key={b.id} onClick={() => go(b.link)} style={{ flex: '1 1 0', minWidth: 0 }}>
            <PromoBanner banner={b} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        {PROMO_BANNERS.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            width: active === i ? 24 : 8, height: 8, borderRadius: 4, border: 'none',
            background: active === i ? PROMO_BANNERS[i].glowColor : 'rgba(255,255,255,0.15)',
            cursor: 'pointer', transition: 'all 0.3s ease',
            boxShadow: active === i ? `0 0 12px ${PROMO_BANNERS[i].accentGlow}` : 'none',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Recent Wins Ticker (single auto-scrolling line) ────────

function RecentWinsTicker({ wins }: { wins: Array<{ id: string; username: string; game: string; multiplier: number; profit: number }> }) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || wins.length === 0) return;
    let raf: number;
    let pos = 0;
    const speed = 0.4; // px per frame
    const tick = () => {
      pos += speed;
      // When first set of items scrolls off, reset seamlessly
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.style.transform = `translateX(-${pos}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wins]);

  if (wins.length === 0) return null;

  // Duplicate wins for seamless looping
  const items = [...wins, ...wins];

  return (
    <div style={{
      overflow: 'hidden',
      height: 34,
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 6,
    }}>
      <div ref={stripRef} style={{ display: 'flex', alignItems: 'center', gap: 24, whiteSpace: 'nowrap', willChange: 'transform' }}>
        {items.map((w, i) => (
          <span key={`${w.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0 }}>
            <span style={{ fontWeight: 600, color: theme.text.muted }}>{w.username}</span>
            <span className="mono" style={{ fontWeight: 700, color: theme.accent.green }}>{w.multiplier.toFixed(2)}x</span>
            <span className="mono" style={{ fontWeight: 600, color: theme.text.secondary }}>+{(w.profit / 1e9).toFixed(3)}</span>
            <SolIcon size="0.8em" />
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Category Tab Bar ───────────────────────────────────────

function CategoryTabBar({ active, onChange, searchQuery, onSearchChange }: {
  active: string; onChange: (id: string) => void; searchQuery: string; onSearchChange: (q: string) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      background: theme.bg.elevated,
      borderRadius: theme.radius.lg,
      padding: '4px',
      overflowX: 'auto',
      scrollbarWidth: 'none' as any,
    }}>
      {CATEGORIES.map(cat => {
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            style={{
              position: 'relative',
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              borderRadius: theme.radius.md,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.15s ease',
              background: isActive ? theme.bg.surface : 'transparent',
              color: isActive ? '#fff' : theme.text.muted,
            }}
          >
            {cat.label}
          </button>
        );
      })}
      {!isMobile && (
        <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0, padding: '0 4px' }}>
          <input
            type="text"
            placeholder="Search games..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              padding: '8px 12px 8px 32px',
              fontSize: 13,
              background: theme.bg.base,
              border: `1px solid ${theme.border.default}`,
              borderRadius: theme.radius.md,
              color: theme.text.primary,
              fontFamily: 'inherit',
              outline: 'none',
              width: 180,
              transition: 'border-color 0.15s ease',
            }}
          />
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 700,
        color: theme.text.primary,
        lineHeight: 1.2,
      }}>
        {title}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: theme.text.muted,
        background: theme.bg.elevated,
        padding: '2px 8px',
        borderRadius: theme.radius.full,
        border: `1px solid ${theme.border.subtle}`,
      }}>
        {count}
      </span>
    </div>
  );
}

// ─── Game Grid ──────────────────────────────────────────────

function GameGrid({ games, go, isGameLive, getCardLiveData, hotGames, isNewUser, section }: {
  games: GameDef[];
  go: (s: string) => void;
  isGameLive: (id: string) => boolean;
  getCardLiveData: (id: string) => any;
  hotGames: Set<string>;
  isNewUser: boolean;
  section: string;
}) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  if (games.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : isTablet ? 'repeat(4, 1fr)' : 'repeat(5, 1fr)',
      gap: isMobile ? 8 : 12,
    }}>
      {games.map((game) => {
        const live = isGameLive(game.id);
        const cardLive = getCardLiveData(game.id);
        const recommended = isNewUser && game.id === 'mines';

        let badge: 'live' | 'hot' | 'pvp' | 'new' | null = null;
        if (live) badge = 'live';
        else if (hotGames.has(game.id)) badge = 'hot';
        else if (game.defaultBadge) badge = game.defaultBadge;
        else if (recommended) badge = 'new';

        return (
          <GameCard
            key={game.id}
            gameId={game.id}
            title={game.title}
            subtitle={game.subtitle}
            image={game.image}
            badge={badge}
            onClick={() => { lobbyTrack.gameCardClick(game.id, `grid:${section}`); go(game.route as any); }}
            liveData={cardLive.liveData}
            liveDataColor={cardLive.liveDataColor}
            liveExtra={cardLive.liveExtra}
          />
        );
      })}
    </div>
  );
}

// ─── Lobby Screen ───────────────────────────────────────────

export function LobbyScreen() {
  const isMobile = useIsMobile();
  const { profile } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const go = useAppNavigate();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Analytics
  useEffect(() => {
    funnelTrack.sessionStart();
    if (isAuthenticated && profile.roundsPlayed > 0) retentionTrack.returnVisit();
  }, []);

  // Live data
  const [rugRecent, setRugRecent] = useState<any[]>([]);
  const [candleRecent, setCandleRecent] = useState<any[]>([]);
  const [tradingRooms, setTradingRooms] = useState<any[]>([]);
  const [recentWins, setRecentWins] = useState<any[]>([]);
  const [publicBets, setPublicBets] = useState<any[]>([]);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const [rug, candle, trading] = await Promise.all([
          api.getRugGameRecentRounds(3).catch(() => ({ rounds: [] })),
          api.getCandleflipRecentRounds(3).catch(() => ({ rounds: [] })),
          api.getTradingSimRooms().catch(() => ({ rooms: [] })),
        ]);
        setRugRecent(rug.rounds || []);
        setCandleRecent(candle.rounds || []);
        setTradingRooms(trading.rooms || []);
      } catch {}
    };
    fetchLive();
    const iv = setInterval(fetchLive, 15000);
    return () => clearInterval(iv);
  }, []);

  const fetchStatsAndWins = async () => {
    try {
      const [feedRes] = await Promise.all([
        api.getActivityFeed(15).catch(() => ({ data: [] })),
      ]);

      const GAME_LABELS: Record<string, string> = { prediction_result: 'Predictions', solo_result: 'Solo', rug_result: 'Rug Game', candleflip_result: 'Candleflip', mines_result: 'Mines', lottery_result: 'Lottery', trading_sim_result: 'Trading Arena' };
      const feedItems = (feedRes as any).data || [];
      const wins = feedItems.filter((i: any) => i.payload?.payout > i.payload?.betAmount).slice(0, 10).map((i: any) => ({
        id: i.id, username: i.payload.username || 'Player', game: GAME_LABELS[i.feedType] || 'Game',
        multiplier: Number(i.payload.multiplier) || 0, profit: (i.payload.payout || 0) - (i.payload.betAmount || 0),
      }));
      setRecentWins(wins);
      const bets = feedItems.slice(0, 12).map((i: any) => {
        const p = i.payload || {};
        return { id: i.id, username: p.username || 'Player', game: GAME_LABELS[i.feedType] || 'Game', betAmount: p.betAmount || 0, payout: p.payout || 0, multiplier: Number(p.multiplier) || 0, isWin: p.payout > p.betAmount, createdAt: i.createdAt };
      });
      setPublicBets(bets);
    } catch {}
  };

  useEffect(() => { fetchStatsAndWins(); const iv = setInterval(fetchStatsAndWins, 20000); return () => clearInterval(iv); }, []);

  const activeRoomCount = tradingRooms.filter(r => r.status === 'waiting' || r.status === 'active').length;

  const isGameLive = (id: string): boolean => {
    if (id === 'candleflip') return candleRecent.length > 0;
    if (id === 'rug-game') return rugRecent.length > 0;
    if (id === 'trading-sim') return activeRoomCount > 0;
    return false;
  };

  const getCardLiveData = (id: string): any => {
    if (id === 'candleflip' && candleRecent.length > 0) {
      return { liveExtra: <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{candleRecent.slice(0, 5).map((r: any, i: number) => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: r.result === 'bullish' ? theme.accent.green : theme.accent.red, display: 'inline-block' }} />)}</span> };
    }
    if (id === 'rug-game' && rugRecent.length > 0) { const last = rugRecent[0]; return { liveData: `${Number(last.rugMultiplier).toFixed(2)}x — ${last.playerCount}p`, liveDataColor: theme.accent.green }; }
    if (id === 'trading-sim' && activeRoomCount > 0) { return { liveData: `${activeRoomCount} room${activeRoomCount !== 1 ? 's' : ''} live`, liveDataColor: theme.accent.green }; }
    return {};
  };

  const hotGames = new Set<string>();
  if (publicBets.length > 0) {
    const gc: Record<string, number> = {};
    for (const b of publicBets) { gc[b.game] = (gc[b.game] || 0) + 1; }
    for (const [label, count] of Object.entries(gc)) {
      if (count >= 3) { const m = GAMES.find(g => g.title === label); if (m && !isGameLive(m.id)) hotGames.add(m.id); }
    }
  }

  const isNewUser = isAuthenticated && profile.roundsPlayed < 5;

  // Filtering
  const searchFiltered = searchQuery
    ? GAMES.filter(g => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const categoryFiltered = activeCategory === 'skill'
    ? SKILL_GAMES
    : activeCategory === 'quick'
      ? QUICK_GAMES
      : null;

  const isSearching = !!searchFiltered;
  const filteredGames = searchFiltered || categoryFiltered;

  return (
    <div>
    <ContentLobby style={{ display: 'flex', flexDirection: 'column', paddingTop: 0, paddingBottom: 0 }}>

      {/* ═══ 1. PROMO BANNER CAROUSEL ═══ */}
      <div style={{ marginBottom: 12 }}>
        <PromoBannerCarousel go={go} />
      </div>

      {/* ═══ 2. RECENT WINS TICKER (single line) ═══ */}
      <div style={{ marginBottom: 8 }}>
        <RecentWinsTicker wins={recentWins} />
      </div>

      {/* ═══ 3. CATEGORY TAB BAR ═══ */}
      <div style={{ marginBottom: 16 }}>
        <CategoryTabBar
          active={activeCategory}
          onChange={(id) => { setActiveCategory(id); setSearchQuery(''); lobbyTrack.categoryClick(id); }}
          searchQuery={searchQuery}
          onSearchChange={(q) => { setSearchQuery(q); if (q) setActiveCategory('all'); }}
        />
      </div>

      {/* ═══ 4. RETURN HOOKS (if any) ═══ */}
      {isAuthenticated && profile.roundsPlayed >= 5 && (
        <div style={{ marginBottom: 12 }}>
          <ReturnHooksStrip />
        </div>
      )}

      {/* ═══ 5. GAME SECTIONS ═══ */}
      {isSearching ? (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader title={`Results for "${searchQuery}"`} count={filteredGames!.length} />
          <GameGrid games={filteredGames!} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} section="search" />
        </div>
      ) : activeCategory !== 'all' && filteredGames ? (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader title={CATEGORIES.find(c => c.id === activeCategory)?.label || 'Games'} count={filteredGames.length} />
          <GameGrid games={filteredGames} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} section={activeCategory} />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <SectionHeader title="Skill-Based Games" count={SKILL_GAMES.length} />
            <GameGrid games={SKILL_GAMES} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} section="skill" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Quick Play" count={QUICK_GAMES.length} />
            <GameGrid games={QUICK_GAMES} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} section="quick" />
          </div>
        </>
      )}

      {/* ═══ 6. PROGRESSION ═══ */}
      {isAuthenticated && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...progressionCard, background: `linear-gradient(145deg, ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}22 0%, ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}0A 35%, ${theme.bg.surface} 100%)`, borderColor: `${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}30` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: `${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}22`, border: `1px solid ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}44`, color: TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{profile.level}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{profile.vipTier} Tier</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted }}>Level {profile.level}</div>
                </div>
              </div>
              <div onClick={() => go('rewards' as any)} style={{ fontSize: 10, fontWeight: 600, color: theme.accent.primary, cursor: 'pointer', padding: '4px 8px', background: 'rgba(139,92,246,0.08)', borderRadius: 20, border: '1px solid rgba(139,92,246,0.15)' }}>Rewards</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.text.muted }}>XP Progress</span>
                <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: theme.text.secondary }}>{profile.progressionLoaded ? `${profile.xp} / ${profile.xpToNext}` : '...'}</span>
              </div>
              <div style={progressBarOuter}>
                <div style={{ ...progressBarInner, width: `${profile.xpToNext > 0 ? Math.min(100, (profile.xp / profile.xpToNext) * 100) : 0}%`, background: TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, marginBottom: 2 }}>Rakeback</div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: theme.accent.green }}>{profile.progressionLoaded ? `${((profile.rakebackRate) * 100).toFixed(0)}%` : '...'}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, marginBottom: 2 }}>Next Tier</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text.secondary, textTransform: 'capitalize' }}>{getNextTier(profile.vipTier)}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, marginBottom: 2 }}>Next Rakeback</div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: theme.accent.amber }}>{getNextRakeback(profile.vipTier)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 7. DAILY MISSIONS ═══ */}
      {isAuthenticated && (
        <div style={{ marginBottom: 16 }}>
          <DailyMissionsCard />
        </div>
      )}

      {/* ═══ 8. BETS PANEL ═══ */}
      <div style={{ marginBottom: 0 }}>
        <BetsPanel publicBets={publicBets} />
      </div>

      {/* Auth prompt modal */}
      <Modal open={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} title="Sign Up" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 1.5 }}>Create an account to start playing.</span>
          <button style={{ width: '100%', padding: '12px', background: theme.accent.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>Create Account</button>
          <button style={{ background: 'none', border: 'none', color: theme.text.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 6 }} onClick={() => setShowAuthPrompt(false)}>Later</button>
        </div>
      </Modal>
    </ContentLobby>
    <LobbyFooter />

    {/* Onboarding modal — shows once on first login */}
    {isAuthenticated && <OnboardingModal onNavigate={go} />}
    </div>
  );
}

// ─── Return Hooks Strip ─────────────────────────────────────

function ReturnHooksStrip() {
  const isMobile = useIsMobile();
  const [hooks, setHooks] = useState<Array<{ type: string; icon: string; title: string; subtitle: string }>>([]);
  useEffect(() => { api.getReturnHooks().then(res => setHooks(res.hooks || [])).catch(() => {}); }, []);
  if (hooks.length === 0) return null;
  const HOOK_COLORS: Record<string, string> = { streak_active: '#FF6B35', streak_at_risk: '#EF4444', streak_lost: theme.text.muted, near_level_up: theme.accent.primary };
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' as any, padding: '2px 0' }}>
      {hooks.map((hook, i) => (
        <div key={`${hook.type}-${i}`} style={{ flexShrink: 0, padding: '8px 12px', background: `${HOOK_COLORS[hook.type] || theme.accent.primary}0A`, border: `1px solid ${HOOK_COLORS[hook.type] || theme.accent.primary}20`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, minWidth: isMobile ? 200 : 240 }}>
          <span style={{ fontSize: 18 }}>{hook.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text.primary }}>{hook.title}</div>
            <div style={{ fontSize: 11, color: theme.text.muted }}>{hook.subtitle}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Daily Missions Card ─────────────────────────────────────

function DailyMissionsCard() {
  const [missions, setMissions] = useState<any[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const fetchMissions = () => { api.getDailyMissions().then(res => setMissions(res.missions || [])).catch(() => {}); };
  useEffect(() => { fetchMissions(); const onFocus = () => fetchMissions(); window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, []);
  const handleClaim = async (missionId: string) => {
    if (claiming) return; setClaiming(missionId);
    try { await api.claimDailyMission(missionId); retentionTrack.missionClaim(missionId); setMissions(prev => prev.map(m => m.id === missionId ? { ...m, claimed: true } : m)); syncProfile(); } catch {}
    setClaiming(null);
  };
  if (missions.length === 0) return null;
  const completed = missions.filter(m => m.completed).length;
  return (
    <div style={{ background: theme.bg.surface, borderRadius: 12, border: `1px solid ${theme.border.subtle}`, padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Target SVG instead of emoji */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary }}>Daily Missions</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: completed === missions.length ? theme.accent.green : theme.text.muted }}>{completed}/{missions.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {missions.map(m => {
          const pct = Math.min(m.progress / m.target, 1);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: m.completed ? 'rgba(0,230,118,0.03)' : theme.bg.elevated, borderRadius: 8, border: `1px solid ${m.completed ? 'rgba(0,230,118,0.12)' : theme.border.subtle}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: m.completed ? theme.accent.green : theme.text.primary, marginBottom: 2 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: theme.text.muted, marginBottom: 4 }}>{m.description}</div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 2, background: m.completed ? theme.accent.green : theme.accent.primary, transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: theme.text.muted, marginTop: 2 }} className="mono">{m.progress}/{m.target}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                {m.claimed ? <span style={{ fontSize: 11, fontWeight: 600, color: theme.accent.green }}>✓</span>
                  : m.completed ? <button onClick={() => handleClaim(m.id)} disabled={claiming === m.id} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: theme.accent.green, color: theme.text.inverse, border: 'none', borderRadius: 6, cursor: 'pointer' }}>{claiming === m.id ? '...' : `+${m.xpReward} XP`}</button>
                  : <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: theme.accent.primary }}>{m.xpReward} XP</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const progressionCard: CSSProperties = {
  padding: '16px', background: theme.bg.surface, border: `1px solid ${theme.border.subtle}`, borderRadius: 12,
};

const progressBarOuter: CSSProperties = {
  width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
};

const progressBarInner: CSSProperties = {
  height: '100%', borderRadius: 3, transition: 'width 0.5s ease-out', minWidth: 1,
};
