import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { formatSol } from '../../utils/sol';
import { LiveDot } from '../ui/LiveIndicators';
import { SolIcon } from '../ui/SolIcon';
import { getAvatarGradient, getInitials } from '../../utils/avatars';
import { ContentLobby } from '../primitives/ContentContainer';
import { Modal } from '../primitives/Modal';
import { GameCard } from '../game/GameCard';
import { lobbyTrack, funnelTrack, retentionTrack } from '../../utils/analytics';
import { LobbyFooter } from '../layout/LobbyFooter';
import { BetsPanel } from '../ui/BetsPanel';

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
  id: string; route: string; title: string; subtitle: string; image: string; tags: string[];
}

const GAMES: GameDef[] = [
  { id: 'rug-game', route: 'rug-game', title: 'Rug Game', subtitle: 'Cash Out or Get Rugged', image: '/game-rug-game.webp', tags: ['originals', 'live', 'popular'] },
  { id: 'mines', route: 'mines', title: 'Mines', subtitle: 'Reveal or Ruin', image: '/game-mines.png', tags: ['originals', 'quick', 'popular'] },
  { id: 'candleflip', route: 'candleflip', title: 'Candleflip', subtitle: 'Over/Under 1.00x', image: '/game-candleflip.webp', tags: ['originals', 'quick', 'live'] },
  { id: 'predictions', route: 'prediction', title: 'Predictions', subtitle: 'Up or Down?', image: '/game-predictions.webp', tags: ['originals', 'live'] },
  { id: 'trading-sim', route: 'trading-sim', title: 'Trading Sim', subtitle: 'PvP Trading Arena', image: '/game-trading-sim.webp', tags: ['originals', 'pvp'] },
  { id: 'solo', route: 'setup', title: 'Solo', subtitle: 'Trade vs. the chart', image: '/game-solo.webp', tags: ['originals', 'quick'] },
  { id: 'lottery', route: 'lottery', title: 'Lottery', subtitle: 'Jackpot Draws', image: '/game-lottery.webp', tags: ['originals'] },
];

// ─── Promo Banner Data ──────────────────────────────────────

const PROMO_BANNERS = [
  {
    id: 'deposit', badge: '🔥 LIMITED TIME', highlight: '100%', title: 'DEPOSIT BONUS!',
    subtitle: 'Double your first deposit up to 10 SOL. Start with 2x the power.',
    gradient: 'linear-gradient(135deg, #1a0533 0%, #2d1b69 25%, #4c1d95 55%, #7c3aed 100%)',
    glowColor: '#a78bfa', badgeBg: 'rgba(167,139,250,0.25)', badgeBorder: 'rgba(167,139,250,0.4)',
    badgeColor: '#c4b5fd', highlightColor: '#c4b5fd', accentGlow: 'rgba(167,139,250,0.4)', link: 'wallet',
  },
  {
    id: 'jackpot', badge: '🎰 JACKPOT LIVE', highlight: '250 SOL', title: 'LOTTERY JACKPOT!',
    subtitle: 'Next draw in 6h. Buy tickets now and win big.',
    gradient: 'linear-gradient(135deg, #052e16 0%, #064e3b 25%, #047857 55%, #10b981 100%)',
    glowColor: '#34d399', badgeBg: 'rgba(52,211,153,0.25)', badgeBorder: 'rgba(52,211,153,0.4)',
    badgeColor: '#6ee7b7', highlightColor: '#6ee7b7', accentGlow: 'rgba(52,211,153,0.4)', link: 'lottery',
  },
  {
    id: 'vip', badge: '⭐ VIP REWARDS', highlight: '10%', title: 'RAKEBACK!',
    subtitle: 'Earn up to 10% back on every bet. 6 tiers from Bronze to Titan.',
    gradient: 'linear-gradient(135deg, #1c0a00 0%, #78350f 25%, #b45309 55%, #f59e0b 100%)',
    glowColor: '#fbbf24', badgeBg: 'rgba(251,191,36,0.25)', badgeBorder: 'rgba(251,191,36,0.4)',
    badgeColor: '#fde68a', highlightColor: '#fde68a', accentGlow: 'rgba(251,191,36,0.4)', link: 'rewards',
  },
  {
    id: 'referral', badge: '🆕 NEW PROGRAM', highlight: '5%', title: 'REFER & EARN!',
    subtitle: 'Earn 5% of your friends\' wagers forever. No limits, no cap.',
    gradient: 'linear-gradient(135deg, #0c1229 0%, #1e3a5f 25%, #1d4ed8 55%, #3b82f6 100%)',
    glowColor: '#60a5fa', badgeBg: 'rgba(96,165,250,0.25)', badgeBorder: 'rgba(96,165,250,0.4)',
    badgeColor: '#bfdbfe', highlightColor: '#bfdbfe', accentGlow: 'rgba(96,165,250,0.4)', link: 'rewards',
  },
];

// ─── Categories ─────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all', label: '🏠 Lobby', icon: '' },
  { id: 'originals', label: '💎 Originals', icon: '' },
  { id: 'quick', label: '⚡ Quick Play', icon: '' },
  { id: 'live', label: '🔴 Live', icon: '' },
  { id: 'pvp', label: '⚔️ PvP', icon: '' },
];

// ─── Decorative Art Compositions ────────────────────────────

function DepositArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 900, color: '#fff', boxShadow: '0 0 60px rgba(20,241,149,0.5), 0 0 120px rgba(153,69,255,0.3)', border: '4px solid rgba(255,255,255,0.15)', zIndex: 3 }}>◎</div>
      <div style={{ position: 'absolute', top: '18%', left: '22%', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900, color: '#fff', boxShadow: '0 0 40px rgba(20,241,149,0.4)', border: '3px solid rgba(255,255,255,0.12)', transform: 'rotate(-12deg)', zIndex: 2, opacity: 0.85 }}>◎</div>
      <div style={{ position: 'absolute', bottom: '18%', right: '15%', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', boxShadow: '0 0 30px rgba(20,241,149,0.35)', border: '2px solid rgba(255,255,255,0.1)', transform: 'rotate(15deg)', zIndex: 2, opacity: 0.75 }}>◎</div>
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
      <div style={{ position: 'absolute', top: '46%', left: '46%', transform: 'translate(-50%, -50%)', width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, fontWeight: 900, color: '#fff', boxShadow: '0 0 60px rgba(20,241,149,0.5), 0 0 120px rgba(153,69,255,0.25)', border: '4px solid rgba(255,255,255,0.15)', zIndex: 3 }}>◎</div>
      <Ball n="7"  size={50} bg="linear-gradient(135deg, #fbbf24, #d97706)" top="5%"   left="38%"  z={4} shadow="0 6px 28px rgba(251,191,36,0.5)" />
      <Ball n="21" size={44} bg="linear-gradient(135deg, #a78bfa, #7c3aed)" top="18%"  right="4%"  z={4} shadow="0 6px 24px rgba(124,58,237,0.5)" />
      <Ball n="42" size={40} bg="linear-gradient(135deg, #f87171, #dc2626)" bottom="14%" right="10%" z={4} shadow="0 6px 24px rgba(239,68,68,0.5)" />
      <Ball n="13" size={38} bg="linear-gradient(135deg, #2dd4bf, #0d9488)" bottom="12%" left="18%"  z={4} shadow="0 6px 24px rgba(20,184,166,0.5)" />
      <Ball n="8"  size={34} bg="linear-gradient(135deg, #60a5fa, #2563eb)" top="15%"  left="10%"  z={2} shadow="0 6px 20px rgba(37,99,235,0.4)" />
      <div style={{ position: 'absolute', bottom: '30%', left: '4%', width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195, #9945FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', boxShadow: '0 0 24px rgba(20,241,149,0.35)', border: '2px solid rgba(255,255,255,0.1)', zIndex: 2, opacity: 0.8 }}>◎</div>
      <div style={{ position: 'absolute', bottom: '4%', left: '28%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', fontSize: 14, fontWeight: 900, color: '#78350f', boxShadow: '0 4px 20px rgba(251,191,36,0.5)', transform: 'rotate(-3deg)', zIndex: 5, letterSpacing: 1 }}>JACKPOT</div>
    </div>
  );
}

function VipArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '45%', left: '48%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
        <div style={{ width: 100, height: 100, borderRadius: 20, background: 'linear-gradient(135deg, #fbbf24, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 50px rgba(251,191,36,0.5), 0 8px 32px rgba(0,0,0,0.3)', border: '3px solid rgba(255,255,255,0.15)' }}>
          <span style={{ fontSize: 56 }}>🏆</span>
        </div>
      </div>
      <div style={{ position: 'absolute', top: '12%', right: '10%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', fontSize: 14, fontWeight: 800, color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.5)', transform: 'rotate(6deg)', zIndex: 4 }}>DIAMOND</div>
      <div style={{ position: 'absolute', bottom: '18%', left: '18%', padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #d97706, #fbbf24)', fontSize: 14, fontWeight: 800, color: '#78350f', boxShadow: '0 4px 20px rgba(251,191,36,0.5)', transform: 'rotate(-4deg)', zIndex: 4 }}>TITAN</div>
      <div style={{ position: 'absolute', top: '8%', left: '30%', fontSize: 32, zIndex: 2, filter: 'drop-shadow(0 3px 12px rgba(251,191,36,0.6))' }}>⭐</div>
      <div style={{ position: 'absolute', bottom: '10%', right: '25%', fontSize: 24, zIndex: 2, filter: 'drop-shadow(0 3px 10px rgba(251,191,36,0.5))' }}>⭐</div>
    </div>
  );
}

function ReferralArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '42%', left: '45%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 50px rgba(37,99,235,0.5), 0 8px 32px rgba(0,0,0,0.3)', border: '3px solid rgba(255,255,255,0.15)' }}>
          <span style={{ fontSize: 48 }}>🤝</span>
        </div>
      </div>
      {[
        { top: '12%', left: '20%', size: 48, color: '#8b5cf6' },
        { top: '15%', right: '15%', size: 44, color: '#06b6d4' },
        { bottom: '15%', left: '12%', size: 40, color: '#f43f5e' },
        { bottom: '20%', right: '18%', size: 44, color: '#10b981' },
      ].map((a: any, i) => (
        <div key={i} style={{ position: 'absolute', top: a.top, left: a.left, right: a.right, bottom: a.bottom, width: a.size, height: a.size, borderRadius: '50%', background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: a.size * 0.5, boxShadow: `0 4px 20px ${a.color}55`, border: '2px solid rgba(255,255,255,0.12)', zIndex: 2 }}>
          <span>👤</span>
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
      position: 'relative', borderRadius: 16, overflow: 'hidden', background: banner.gradient,
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
              position: 'relative', borderRadius: 16, overflow: 'hidden', background: b.gradient,
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

  // Show 3 equal banners, rotating which 3 of 4 are visible
  const visible = [0, 1, 2].map(offset => PROMO_BANNERS[(active + offset) % PROMO_BANNERS.length]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, height: 280 }}>
        {visible.map((b, i) => (
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

// ─── Category Bar ───────────────────────────────────────────

function CategoryBar({ active, onChange, searchQuery, onSearchChange }: {
  active: string; onChange: (id: string) => void; searchQuery: string; onSearchChange: (q: string) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: `${theme.gap.sm}px ${theme.gap.md}px`,
      background: 'rgba(255,255,255,0.02)',
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.border.subtle}`,
      overflowX: 'auto',
      scrollbarWidth: 'none' as any,
    }}>
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            background: active === cat.id ? '#1f2937' : 'transparent',
            color: active === cat.id ? '#fff' : theme.text.muted,
          }}
        >
          {cat.label}
        </button>
      ))}
      {/* Search */}
      {!isMobile && (
        <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search games..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              padding: '6px 12px 6px 30px',
              fontSize: 12,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${theme.border.subtle}`,
              borderRadius: 8,
              color: theme.text.primary,
              fontFamily: 'inherit',
              outline: 'none',
              width: 160,
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: theme.text.muted }}>🔍</span>
        </div>
      )}
    </div>
  );
}

// ─── Game Rail with Scroll Arrows ───────────────────────────

function GameRail({ title, games, go, isGameLive, getCardLiveData, hotGames, isNewUser }: {
  title: string; games: GameDef[]; go: (s: string) => void;
  isGameLive: (id: string) => boolean; getCardLiveData: (id: string) => any;
  hotGames: Set<string>; isNewUser: boolean;
}) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => { checkScroll(); }, [games]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = (isMobile ? 140 : 170) * 3;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    setTimeout(checkScroll, 400);
  };

  if (games.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.gap.sm }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: theme.text.primary }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: theme.text.muted }}>View all</span>
          {!isMobile && (
            <>
              <button onClick={() => scroll('left')} style={{ ...arrowBtn, opacity: canScrollLeft ? 1 : 0.2 }} disabled={!canScrollLeft}>‹</button>
              <button onClick={() => scroll('right')} style={{ ...arrowBtn, opacity: canScrollRight ? 1 : 0.2 }} disabled={!canScrollRight}>›</button>
            </>
          )}
        </div>
      </div>
      <div ref={scrollRef} onScroll={checkScroll} style={{
        display: 'flex',
        gap: isMobile ? 8 : 10,
        overflowX: 'auto',
        scrollbarWidth: 'none' as any,
        padding: '2px 0',
      }}>
        {games.map((game) => {
          const live = isGameLive(game.id);
          const cardLive = getCardLiveData(game.id);
          const recommended = isNewUser && game.id === 'mines';
          return (
            <div key={game.id} style={{ flexShrink: 0, width: isMobile ? 140 : 170 }}>
              <GameCard
                gameId={game.id}
                title={game.title}
                subtitle={game.subtitle}
                image={game.image}
                onClick={() => { lobbyTrack.gameCardClick(game.id, `rail:${title}`); go(game.route as any); }}
                isLive={live}
                isHot={hotGames.has(game.id)}
                isRecommended={recommended}
                liveData={cardLive.liveData}
                liveDataColor={cardLive.liveDataColor}
                liveExtra={cardLive.liveExtra}
              />
            </div>
          );
        })}
      </div>
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
  const [liveStats, setLiveStats] = useState({ online: 0, volume: '0', topWin: '1.0x' });
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
      const [profitRes, multRes, onlineRes, feedRes] = await Promise.all([
        api.getLeaderboard('profit', 'daily').catch(() => ({ data: [] })) as any,
        api.getLeaderboard('multiplier', 'daily').catch(() => ({ data: [] })) as any,
        api.getOnlineCount().catch(() => ({ onlineCount: 0 })),
        api.getActivityFeed(15).catch(() => ({ data: [] })),
      ]);
      const profitData = profitRes.data || [];
      const multData = multRes.data || [];
      const totalVol = profitData.reduce((sum: number, e: any) => sum + Math.abs(Number(e.score || 0)), 0);
      const topMult = multData.reduce((max: number, e: any) => Math.max(max, Number(e.score || 0)), 0);
      setLiveStats({ online: onlineRes.onlineCount || profitData.length || 0, volume: formatSol(totalVol), topWin: topMult > 1 ? `${topMult.toFixed(1)}x` : '1.0x' });
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
  const { gap } = theme;

  // Filtering
  const searchFiltered = searchQuery
    ? GAMES.filter(g => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const categoryFiltered = activeCategory !== 'all'
    ? GAMES.filter(g => g.tags.includes(activeCategory))
    : null;

  const isFilterActive = !!searchFiltered || !!categoryFiltered;
  const filteredGames = searchFiltered || categoryFiltered || GAMES;

  const quickPlayGames = GAMES.filter(g => g.tags.includes('quick'));
  const liveNowGames = GAMES.filter(g => isGameLive(g.id));

  return (
    <div>
    <ContentLobby style={{ display: 'flex', flexDirection: 'column', gap: gap.lg, paddingTop: gap.sm, paddingBottom: 0 }}>

      {/* ═══ 1. PROMO BANNER CAROUSEL ═══ */}
      <PromoBannerCarousel go={go} />

      {/* ═══ 2. LIVE STATS BAR ═══ */}
      {(liveStats.online > 0 || recentWins.length > 0) && (
        <div style={liveBar}>
          {liveStats.online > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <LiveDot size={5} color={theme.accent.green} />
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.text.muted }}>{liveStats.online} online</span>
            </div>
          )}
          {liveStats.volume !== '0' && (
            <span style={{ fontSize: 11, color: theme.text.muted }}>24h: <span className="mono" style={{ color: theme.text.secondary, fontWeight: 700 }}>{liveStats.volume} <SolIcon size="0.9em" /></span></span>
          )}
          {liveStats.topWin !== '1.0x' && (
            <span style={{ fontSize: 11, color: theme.text.muted }}>Top: <span className="mono" style={{ color: theme.accent.amber, fontWeight: 700 }}>{liveStats.topWin}</span></span>
          )}
        </div>
      )}

      {/* ═══ 3. RECENT WINS STRIP ═══ */}
      {recentWins.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <LiveDot size={6} color={theme.accent.green} />
            <span style={{ fontSize: 11, fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Wins</span>
          </div>
          <div style={winsStrip}>
            {recentWins.map((w, i) => {
              const isBigWin = w.multiplier >= 10 || w.profit >= 1_000_000_000;
              return (
                <div key={`${w.id}-${i}`} style={{ ...winChip, ...(isBigWin ? { borderColor: 'rgba(255,215,0,0.35)', background: 'rgba(255,215,0,0.04)', boxShadow: '0 0 12px rgba(255,215,0,0.08)' } : {}) }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: getAvatarGradient(null, w.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700, color: '#fff' }}>{getInitials(w.username)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: theme.text.secondary, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.username}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: isBigWin ? '#FFD700' : theme.text.muted }}>{isBigWin ? 'BIG WIN' : w.game}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: theme.accent.neonGreen }}>{w.multiplier.toFixed(2)}x</span>
                    <span className="mono" style={{ fontSize: 9, fontWeight: 600, color: theme.accent.neonGreen, opacity: 0.7 }}>+{(w.profit / 1e9).toFixed(3)} <SolIcon size="0.9em" /></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 4. CATEGORY BAR ═══ */}
      <CategoryBar
        active={activeCategory}
        onChange={(id) => { setActiveCategory(id); setSearchQuery(''); lobbyTrack.categoryClick(id); }}
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); if (q) setActiveCategory('all'); }}
      />

      {/* ═══ 5. RETURN HOOKS (if any) ═══ */}
      {isAuthenticated && profile.roundsPlayed >= 5 && <ReturnHooksStrip />}

      {/* ═══ 6. NEW USER WELCOME ═══ */}
      {isAuthenticated && profile.roundsPlayed === 0 && profile.balance > 0 && (
        <div style={{ padding: `${gap.md}px ${gap.lg}px`, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: gap.md }}>
          <span style={{ fontSize: 24 }}>🎮</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text.primary }}>Ready to play?</div>
            <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 2 }}>
              Start with <span style={{ color: theme.accent.purple, fontWeight: 600, cursor: 'pointer' }} onClick={() => { lobbyTrack.welcomeBannerClick(); go('mines'); }}>Mines</span> — it's the easiest way to get started
            </div>
          </div>
        </div>
      )}

      {/* ═══ 7. GAME BROWSING ═══ */}
      {isFilterActive ? (
        /* Filtered grid view */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: gap.md }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: theme.text.primary }}>
              {searchQuery ? `Results for "${searchQuery}"` : activeCategory === 'all' ? 'All Games' : CATEGORIES.find(c => c.id === activeCategory)?.label || 'Games'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: theme.text.muted }}>{filteredGames.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
            {filteredGames.map((game) => (
              <GameCard key={game.id} gameId={game.id} title={game.title} subtitle={game.subtitle} image={game.image}
                onClick={() => { lobbyTrack.gameCardClick(game.id, `grid:${activeCategory}`); go(game.route as any); }}
                isLive={isGameLive(game.id)} isHot={hotGames.has(game.id)} isRecommended={isNewUser && game.id === 'mines'}
                {...getCardLiveData(game.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Rail-first browsing */
        <>
          <GameRail title="💎 TradeGems Originals" games={GAMES} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} />
          <GameRail title="⚡ Quick Play" games={quickPlayGames} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} />
          {liveNowGames.length > 0 && (
            <GameRail title="🔴 Live Now" games={liveNowGames} go={go} isGameLive={isGameLive} getCardLiveData={getCardLiveData} hotGames={hotGames} isNewUser={isNewUser} />
          )}
        </>
      )}

      {/* ═══ 8. PROGRESSION ═══ */}
      {isAuthenticated && (
        <div style={{ ...progressionCard, background: `linear-gradient(145deg, ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}22 0%, ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}0A 35%, ${theme.bg.secondary} 100%)`, borderColor: `${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}30` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: gap.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: `${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}22`, border: `1px solid ${TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze}44`, color: TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{profile.level}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{profile.vipTier} Tier</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted }}>Level {profile.level}</div>
              </div>
            </div>
            <div onClick={() => go('rewards' as any)} style={{ fontSize: 10, fontWeight: 600, color: theme.accent.purple, cursor: 'pointer', padding: '4px 8px', background: 'rgba(139,92,246,0.08)', borderRadius: 20, border: '1px solid rgba(139,92,246,0.15)' }}>Rewards</div>
          </div>
          <div style={{ marginBottom: gap.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: theme.text.muted }}>XP Progress</span>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: theme.text.secondary }}>{profile.progressionLoaded ? `${profile.xp} / ${profile.xpToNext}` : '...'}</span>
            </div>
            <div style={progressBarOuter}>
              <div style={{ ...progressBarInner, width: `${profile.xpToNext > 0 ? Math.min(100, (profile.xp / profile.xpToNext) * 100) : 0}%`, background: TIER_COLORS[profile.vipTier] || TIER_COLORS.bronze }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: gap.md }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, marginBottom: 2 }}>Rakeback</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: theme.accent.neonGreen }}>{profile.progressionLoaded ? `${((profile.rakebackRate) * 100).toFixed(0)}%` : '...'}</div>
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
      )}

      {/* ═══ 9. DAILY MISSIONS ═══ */}
      {isAuthenticated && <DailyMissionsCard />}

      {/* ═══ 10. BETS PANEL (tabbed: Latest / My Bets / High Rollers / Leaderboard) ═══ */}
      <BetsPanel publicBets={publicBets} />

      {/* ═══ 11. TRUST FOOTER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: isMobile ? gap.md : gap.xl, padding: `${gap.lg}px 0`, borderTop: `1px solid ${theme.border.subtle}`, marginTop: gap.md }}>
        <span style={{ fontSize: 11, color: theme.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => go('fairness')}>🛡️ Provably Fair</span>
        <span style={{ fontSize: 11, color: theme.text.muted, display: 'flex', alignItems: 'center', gap: 4 }}>⚡ Instant Settlement</span>
        <span style={{ fontSize: 11, color: theme.text.muted, display: 'flex', alignItems: 'center', gap: 4 }}>◎ Solana Powered</span>
        <span style={{ fontSize: 11, color: theme.text.muted, cursor: 'pointer' }} onClick={() => go('about')}>About · FAQ</span>
      </div>

      {/* Auth prompt modal */}
      <Modal open={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} title="Sign in to play" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: gap.md, alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 1.5 }}>Create an account or sign in to start playing.</span>
          <button style={{ width: '100%', padding: '12px', background: theme.gradient.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }} onClick={() => { setShowAuthPrompt(false); go('auth'); }}>Sign in / Register</button>
          <button style={{ background: 'none', border: 'none', color: theme.text.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 6 }} onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
        </div>
      </Modal>
    </ContentLobby>
    <LobbyFooter />
    </div>
  );
}

// ─── Return Hooks Strip ─────────────────────────────────────

function ReturnHooksStrip() {
  const isMobile = useIsMobile();
  const [hooks, setHooks] = useState<Array<{ type: string; icon: string; title: string; subtitle: string }>>([]);
  useEffect(() => { api.getReturnHooks().then(res => setHooks(res.hooks || [])).catch(() => {}); }, []);
  if (hooks.length === 0) return null;
  const HOOK_COLORS: Record<string, string> = { streak_active: '#FF6B35', streak_at_risk: '#EF4444', streak_lost: theme.text.muted, near_level_up: theme.accent.purple };
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' as any, padding: '2px 0' }}>
      {hooks.map((hook, i) => (
        <div key={`${hook.type}-${i}`} style={{ flexShrink: 0, padding: '8px 12px', background: `${HOOK_COLORS[hook.type] || theme.accent.purple}0A`, border: `1px solid ${HOOK_COLORS[hook.type] || theme.accent.purple}20`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, minWidth: isMobile ? 200 : 240 }}>
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
  const isMobile = useIsMobile();
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
    <div style={{ background: theme.bg.secondary, borderRadius: 12, border: `1px solid ${theme.border.subtle}`, padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary }}>Daily Missions</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: completed === missions.length ? theme.accent.neonGreen : theme.text.muted }}>{completed}/{missions.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {missions.map(m => {
          const pct = Math.min(m.progress / m.target, 1);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: m.completed ? 'rgba(0,231,1,0.03)' : theme.bg.tertiary, borderRadius: 8, border: `1px solid ${m.completed ? 'rgba(0,231,1,0.12)' : theme.border.subtle}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: m.completed ? theme.accent.neonGreen : theme.text.primary, marginBottom: 2 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: theme.text.muted, marginBottom: 4 }}>{m.description}</div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 2, background: m.completed ? theme.accent.neonGreen : theme.accent.purple, transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: theme.text.muted, marginTop: 2 }} className="mono">{m.progress}/{m.target}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                {m.claimed ? <span style={{ fontSize: 11, fontWeight: 600, color: theme.accent.neonGreen }}>✓</span>
                  : m.completed ? <button onClick={() => handleClaim(m.id)} disabled={claiming === m.id} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: theme.accent.neonGreen, color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{claiming === m.id ? '...' : `+${m.xpReward} XP`}</button>
                  : <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: theme.accent.purple }}>{m.xpReward} XP</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const bannerCard: CSSProperties = {
  position: 'relative',
  borderRadius: 12,
  padding: '20px 24px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  transition: 'transform 0.2s ease',
};

const bannerBadge: CSSProperties = {
  display: 'inline-block',
  padding: '3px 8px',
  fontSize: 10,
  fontWeight: 700,
  color: '#fff',
  background: 'rgba(0,0,0,0.3)',
  borderRadius: 6,
  marginBottom: 8,
  alignSelf: 'flex-start',
  backdropFilter: 'blur(4px)',
};

const arrowBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: `1px solid ${theme.border.subtle}`,
  background: 'rgba(255,255,255,0.04)',
  color: theme.text.secondary,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'opacity 0.15s ease',
};

const liveBar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: theme.gap.lg,
  padding: `${theme.gap.sm}px ${theme.gap.md}px`,
  background: theme.bg.secondary, borderRadius: 8, border: `1px solid ${theme.border.subtle}`,
};

const winsStrip: CSSProperties = {
  display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0', scrollbarWidth: 'none' as any,
};

const winChip: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: 8, flexShrink: 0,
};

const betsContainer: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1,
  background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: 12, overflow: 'hidden',
};

const betRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', background: theme.bg.primary, transition: 'background 0.15s ease',
};

const progressionCard: CSSProperties = {
  padding: '16px', background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: 12,
};

const progressBarOuter: CSSProperties = {
  width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
};

const progressBarInner: CSSProperties = {
  height: '100%', borderRadius: 3, transition: 'width 0.5s ease-out', minWidth: 1,
};
