import { useState, useEffect } from 'react';
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

// Defaults that match server — will be overwritten by getServerConfig()
let _feeRate = 0.03;
let _minBetLamports = 1_000_000;

export function SoloSetupScreen() {
  const isMobile = useIsMobile();
  const { betAmount, setBetAmount, riskTier, setRiskTier, startRound, profile } = useGameStore();
  const go = useAppNavigate();
  const [feeRate, setFeeRate] = useState(_feeRate);
  const [minBetLamports, setMinBetLamports] = useState(_minBetLamports);

  // M1 fix: Fetch fee rate from server on mount
  useEffect(() => {
    getServerConfig().then(cfg => {
      _feeRate = cfg.feeRate;
      _minBetLamports = cfg.minBetLamports;
      setFeeRate(cfg.feeRate);
      setMinBetLamports(cfg.minBetLamports);
    });
  }, []);

  // M3: Include fee in balance check
  const fee = Math.floor(betAmount * feeRate);
  const totalCost = betAmount + fee;
  const canAfford = totalCost <= profile.balance;

  // M4: Minimum bet validation
  const meetsMinBet = betAmount >= minBetLamports;

  const handleStart = () => {
    if (!canAfford || !meetsMinBet) return;
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      toast.error('Login Required', 'Please log in or connect a wallet before playing.');
      go('auth');
      return;
    }
    playBetPlaced();
    hapticMedium();
    startRound();
  };

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => go('lobby')} style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={styles.headerTitle}>Solo Setup</span>
        <div style={{ width: '36px' }} />
      </div>

      <div style={{
        ...styles.content,
        ...(isMobile ? { maxWidth: '100%' } : {}),
      }}>
        {/* Trading pair info */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: '12px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #9945FF, #14F195)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: 800, color: '#fff',
            }}>S</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary }}>SOL / USD</div>
              <div style={{ fontSize: '11px', color: theme.text.muted }}>Live price feed</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: theme.text.muted }}>You trade the chart</div>
            <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 600 }}>10 candles revealed</div>
          </div>
        </div>

        <BetPanel
          presets={[
            { label: '0.01', lamports: 10_000_000 },
            { label: '0.05', lamports: 50_000_000 },
            { label: '0.1', lamports: 100_000_000 },
            { label: '0.25', lamports: 250_000_000 },
            { label: '0.5', lamports: 500_000_000 },
            { label: '1', lamports: 1_000_000_000 },
            { label: '2', lamports: 2_000_000_000 },
            { label: '5', lamports: 5_000_000_000 },
          ]}
          selectedAmount={betAmount}
          onAmountChange={setBetAmount}
          balance={profile.balance}
          feeRate={feeRate}
          minBet={minBetLamports}
          choices={[
            { id: 'conservative', label: 'SAFE', color: theme.success, payout: '1.2-1.5x' },
            { id: 'balanced', label: 'STANDARD', color: theme.warning, payout: '1.5-3x' },
            { id: 'aggressive', label: 'DEGEN', color: theme.danger, payout: '2-10x' },
          ]}
          selectedChoice={riskTier}
          onChoiceSelect={(id) => setRiskTier(id as RiskTier)}
          submitLabel="START ROUND"
          onSubmit={handleStart}
          submitDisabled={!canAfford || !meetsMinBet}
        />

        <RecentGames
          title="Recent Solo Games"
          fetchGames={async () => {
            const res = await api.getRecentRounds(10) as any;
            return (res.data || res || []).map((r: any) => ({
              id: r.id || r.roundId,
              result: r.resultType === 'win' ? 'win' : 'loss',
              multiplier: r.finalMultiplier || 0,
              amount: r.amount || r.betAmount || 0,
              payout: r.payoutAmount || 0,
              time: r.createdAt,
            }));
          }}
        />

        {/* How it works */}
        <div style={{
          padding: '14px 16px', borderRadius: '12px',
          background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`,
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
            How It Works
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {[
              { step: '1', label: 'Set bet & risk', color: '#8b5cf6' },
              { step: '2', label: 'Watch 10 candles', color: '#3b82f6' },
              { step: '3', label: 'Win multiplier', color: '#2ecc71' },
            ].map(({ step, label, color }) => (
              <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px',
                  background: `${color}15`, border: `1px solid ${color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 800, color,
                }}>{step}</div>
                <div style={{ fontSize: '11px', color: theme.text.secondary, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: theme.bg.secondary,
    color: theme.text.secondary,
    cursor: 'pointer',
  },
  headerTitle: {
    flex: 1,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    textAlign: 'center' as const,
  },

  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '520px',
    margin: '0 auto',
    width: '100%',
  },
};
