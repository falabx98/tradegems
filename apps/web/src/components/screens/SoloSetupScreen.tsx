import { useState, useEffect, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { RiskTier } from '../../types/game';
import { playBetPlaced, hapticMedium } from '../../utils/sounds';
import { api, getServerConfig } from '../../utils/api';
import { BetPanel } from '../ui/BetPanel';
import { RecentGames } from '../ui/RecentGames';
import { toast } from '../../stores/toastStore';
import { GameHeader } from '../game/GameHeader';
import { HowToPlayInline } from '../game/HowToPlayInline';
import { CasinoGameLayout, GameControlRail, GameStage, GameFooterBar } from '../game/CasinoGameLayout';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';

// Default to actual production fee (5%) so total cost never jumps upward after config loads
let _feeRate = 0.05;
let _minBetLamports = 1_000_000;

export function SoloSetupScreen() {
  const isMobile = useIsMobile();
  const { betAmount, setBetAmount, riskTier, setRiskTier, startRound, profile } = useGameStore();
  const go = useAppNavigate();
  const [feeRate, setFeeRate] = useState(_feeRate);
  const [minBetLamports, setMinBetLamports] = useState(_minBetLamports);

  useEffect(() => {
    getServerConfig().then(cfg => {
      _feeRate = cfg.feeRate;
      _minBetLamports = cfg.minBetLamports;
      setFeeRate(cfg.feeRate);
      setMinBetLamports(cfg.minBetLamports);
    });
  }, []);

  const fee = Math.floor(betAmount * feeRate);
  const totalCost = betAmount + fee;
  const canAfford = totalCost <= profile.balance;
  const meetsMinBet = betAmount >= minBetLamports;

  const handleStart = () => {
    if (!canAfford || !meetsMinBet) return;
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      toast.error('Login Required', 'Please log in or create an account before playing.');
      go('auth');
      return;
    }
    playBetPlaced();
    hapticMedium();
    startRound();
  };

  const { gap, textSize } = theme;
  const ts = (key: keyof typeof textSize) => isMobile ? textSize[key].mobile : textSize[key].desktop;

  /* ─── HEADER ─── */
  const header = (
    <GameHeader
      title="Solo"
      subtitle="Trade vs. the chart"
      icon={
        <div style={{ width: 36, height: 36, borderRadius: theme.radius.md, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.accent.purple} strokeWidth="2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
      }
      howToPlay={
        <HowToPlayInline steps={[
          { icon: '🎯', label: 'Set your bet and risk level', desc: 'Higher risk = bigger potential rewards and losses' },
          { icon: '📊', label: 'Watch 10 candles reveal on the chart', desc: 'Tap green gem nodes to boost your multiplier' },
          { icon: '🛡️', label: 'Avoid penalty dividers, use shields', desc: 'Shields block one divider hit. Miss a gem? No penalty.' },
          { icon: '💰', label: 'Your final multiplier determines payout', desc: 'All hits and misses combine into your result' },
        ]} />
      }
    />
  );

  /* ─── CONTROL RAIL ─── */
  const railContent = (
    <GameControlRail>
      {/* BetPanel with risk selection */}
      <BetPanel
        presets={[
          { label: '0.1', lamports: 100_000_000 },
          { label: '0.5', lamports: 500_000_000 },
          { label: '1', lamports: 1_000_000_000 },
          { label: '5', lamports: 5_000_000_000 },
          { label: '10', lamports: 10_000_000_000 },
          { label: '50', lamports: 50_000_000_000 },
          { label: '100', lamports: 100_000_000_000 },
        ]}
        selectedAmount={betAmount}
        onAmountChange={setBetAmount}
        balance={profile.balance}
        feeRate={feeRate}
        minBet={minBetLamports}
        choices={[
          { id: 'conservative', label: 'LOW RISK', color: theme.success, payout: '1.2–1.5x' },
          { id: 'balanced', label: 'BALANCED', color: theme.warning, payout: '1.5–3x' },
          { id: 'aggressive', label: 'HIGH RISK', color: theme.danger, payout: '2–10x' },
        ]}
        selectedChoice={riskTier}
        onChoiceSelect={(id) => setRiskTier(id as RiskTier)}
        submitLabel="Start Round"
        onSubmit={handleStart}
        submitDisabled={!canAfford || !meetsMinBet}
      />

      {/* Recent Games */}
      <RecentGames
        title="Recent Solo Games"
        fetchGames={async () => {
          const res = await api.getRecentRounds(10) as any;
          return (res.data || res || []).map((r: any) => ({
            id: r.id || r.roundId,
            result: r.resultType === 'win' ? 'win' as const : 'loss' as const,
            multiplier: r.finalMultiplier || 0,
            amount: r.amount || r.betAmount || 0,
            payout: r.payoutAmount || 0,
            time: r.createdAt,
          }));
        }}
      />
    </GameControlRail>
  );

  /* ─── GAME STAGE ─── */
  const SOLO_ATMOSPHERE = 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.04) 0%, transparent 70%)';
  const stageContent = (
    <GameStage atmosphere={SOLO_ATMOSPHERE} style={{ minHeight: isMobile ? undefined : 380, padding: gap.lg }}>
      {/* Desktop header inside stage */}
      {!isMobile && (
        <div style={{ marginBottom: gap.md }}>
          {header}
        </div>
      )}

      {/* Trading pair + game info */}
      <Card variant="panel" padding={`${gap.md}px ${gap.lg}px`} style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: gap.sm }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #9945FF, #14F195)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: ts('md'), fontWeight: 700, color: '#fff',
            }}>S</div>
            <div>
              <div style={{ fontSize: ts('md'), fontWeight: 700, color: theme.text.primary }}>SOL / USD</div>
              <div style={{ fontSize: ts('xs'), color: theme.text.muted }}>Live price feed</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: gap.sm }}>
            <Badge variant="purple" size="sm">10 candles</Badge>
            <Badge variant="default" size="sm">15s round</Badge>
          </div>
        </div>
      </Card>

      {/* Mechanic + risk info — desktop only (mobile gets this via HowToPlay + risk selector in BetPanel) */}
      {!isMobile && (
        <Card variant="panel" padding={`${gap.md}px ${gap.lg}px`} style={{ marginTop: gap.md, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', gap: gap.sm, flexWrap: 'wrap', marginBottom: gap.md }}>
            <div style={legendItem}>
              <Icon name="gem" size={16} style={{ color: theme.game.multiplier }} />
              <div>
                <div style={{ fontSize: ts('sm'), fontWeight: 700, color: theme.game.multiplier }}>Gems</div>
                <div style={{ fontSize: ts('xs'), color: theme.text.muted }}>Boost multiplier</div>
              </div>
            </div>
            <div style={legendItem}>
              <Icon name="bomb" size={16} style={{ color: theme.game.divider }} />
              <div>
                <div style={{ fontSize: ts('sm'), fontWeight: 700, color: theme.game.divider }}>Dividers</div>
                <div style={{ fontSize: ts('xs'), color: theme.text.muted }}>Cut multiplier</div>
              </div>
            </div>
            <div style={legendItem}>
              <Icon name="shield" size={16} style={{ color: theme.game.shield }} />
              <div>
                <div style={{ fontSize: ts('sm'), fontWeight: 700, color: theme.game.shield }}>Shields</div>
                <div style={{ fontSize: ts('xs'), color: theme.text.muted }}>Block one hit</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${theme.border.subtle}`, paddingTop: gap.md }}>
            <div style={{ fontSize: ts('xs'), fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: gap.sm }}>
              Risk Tiers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: gap.xs }}>
              <div style={riskRow}>
                <span style={{ color: theme.success, fontWeight: 700, fontSize: ts('sm'), minWidth: 70 }}>LOW</span>
                <span style={{ color: theme.text.secondary, fontSize: ts('sm') }}>Smaller gems, weaker dividers. Steady gains.</span>
              </div>
              <div style={riskRow}>
                <span style={{ color: theme.warning, fontWeight: 700, fontSize: ts('sm'), minWidth: 70 }}>BALANCED</span>
                <span style={{ color: theme.text.secondary, fontSize: ts('sm') }}>Standard gems and dividers. Fair risk.</span>
              </div>
              <div style={riskRow}>
                <span style={{ color: theme.danger, fontWeight: 700, fontSize: ts('sm'), minWidth: 70 }}>HIGH</span>
                <span style={{ color: theme.text.secondary, fontSize: ts('sm') }}>Bigger gems, harsher dividers. Higher ceiling.</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </GameStage>
  );

  /* ─── FOOTER ─── */
  const footerContent = (
    <GameFooterBar>
      <span>Solo · Provably Fair</span>
      <span>SOL/USD · 10 candles · 15s</span>
    </GameFooterBar>
  );

  return (
    <>
      {isMobile && <div style={{ padding: `${gap.sm}px 12px` }}>{header}</div>}
      <CasinoGameLayout
        rail={railContent}
        stage={stageContent}
        footer={footerContent}
      />
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const legendItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.gap.sm,
  flex: '1 1 140px',
  padding: theme.gap.sm,
  background: theme.bg.primary,
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.border.subtle}`,
};

const riskRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.gap.sm,
  padding: `${theme.gap.xs}px 0`,
};
