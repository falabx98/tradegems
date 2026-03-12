import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { RiskTier } from '../../types/game';
import { formatSol, solToLamports } from '../../utils/sol';
import { playBetPlaced, hapticMedium } from '../../utils/sounds';
import { getServerConfig } from '../../utils/api';

const BET_OPTIONS = [
  { label: '0.01', lamports: 10_000_000 },
  { label: '0.05', lamports: 50_000_000 },
  { label: '0.1',  lamports: 100_000_000 },
  { label: '0.25', lamports: 250_000_000 },
  { label: '0.5',  lamports: 500_000_000 },
  { label: '1',    lamports: 1_000_000_000 },
  { label: '2',    lamports: 2_000_000_000 },
  { label: '5',    lamports: 5_000_000_000 },
];

const GAME_MODE_OPTIONS: {
  tier: RiskTier;
  label: string;
  desc: string;
  color: string;
  multipliers: string[];
  gainTag: string;
  lossTag: string;
}[] = [
  {
    tier: 'conservative',
    label: 'Safe',
    desc: 'Reduced gains & losses. Best for beginners.',
    color: theme.success,
    multipliers: ['x1.04-1.20', 'x1.20-1.48', 'x1.48-1.96', 'x1.96-3.00', 'x3.00-5.00', 'x5.00-8.20'],
    gainTag: '0.80x',
    lossTag: '0.85x',
  },
  {
    tier: 'balanced',
    label: 'Standard',
    desc: 'Normal gains & losses. The default experience.',
    color: theme.warning,
    multipliers: ['x1.05-1.25', 'x1.25-1.60', 'x1.60-2.20', 'x2.20-3.50', 'x3.50-6.00', 'x6.00-10.0'],
    gainTag: '1.00x',
    lossTag: '1.00x',
  },
  {
    tier: 'aggressive',
    label: 'Degen',
    desc: 'Boosted gains but amplified losses. High risk.',
    color: theme.danger,
    multipliers: ['x1.06-1.31', 'x1.31-1.75', 'x1.75-2.50', 'x2.50-4.13', 'x4.13-7.25', 'x7.25-10.0'],
    gainTag: '1.25x',
    lossTag: '1.40x',
  },
];

// Defaults that match server — will be overwritten by getServerConfig()
let _feeRate = 0.05;
let _minBetLamports = 1_000_000;

export function SoloSetupScreen() {
  const isMobile = useIsMobile();
  const { betAmount, setBetAmount, riskTier, setRiskTier, startRound, profile } = useGameStore();
  const go = useAppNavigate();
  const [customBet, setCustomBet] = useState('');
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

  const handleCustomBet = () => {
    const val = parseFloat(customBet);
    if (isNaN(val) || val <= 0) return;
    const lamports = solToLamports(val);
    if (lamports < minBetLamports) return;
    const customFee = Math.floor(lamports * feeRate);
    if (lamports + customFee > profile.balance) return;
    setBetAmount(lamports);
    setCustomBet('');
  };

  const isCustomBetActive = betAmount > 0 && !BET_OPTIONS.some(o => o.lamports === betAmount);

  const handleStart = () => {
    if (!canAfford || !meetsMinBet) return;
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
        {/* Position size */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Position size</span>
            <span style={styles.panelValue} className="mono">
              <img src="/sol-coin.png" alt="SOL" style={{ width: '26px', height: '26px', marginRight: '5px', verticalAlign: 'middle' }} />
              {formatSol(betAmount)}
            </span>
          </div>
          <div style={styles.betGrid}>
            {BET_OPTIONS.map((opt) => {
              const optFee = Math.floor(opt.lamports * feeRate);
              const optTotal = opt.lamports + optFee;
              const canAffordOpt = optTotal <= profile.balance;
              return (
                <button
                  key={opt.lamports}
                  onClick={() => { setBetAmount(opt.lamports); setCustomBet(''); }}
                  disabled={!canAffordOpt}
                  style={{
                    ...styles.betChip,
                    ...(betAmount === opt.lamports ? styles.betChipActive : {}),
                    opacity: !canAffordOpt ? 0.25 : 1,
                  }}
                  className="mono"
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={styles.customBetRow}>
            <span style={styles.customBetLabel}>Custom</span>
            <div style={styles.customBetInputWrap}>
              <img src="/sol-coin.png" alt="SOL" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <input
                type="number"
                placeholder="0.00"
                value={customBet}
                onChange={(e) => setCustomBet(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCustomBet(); }}
                style={{
                  ...styles.customBetInput,
                  ...(isCustomBetActive ? { color: '#c084fc' } : {}),
                }}
                className="mono"
                step="0.01"
                min="0"
              />
              <button
                onClick={handleCustomBet}
                disabled={!customBet || parseFloat(customBet) <= 0}
                style={{
                  ...styles.customBetBtn,
                  opacity: !customBet || parseFloat(customBet) <= 0 ? 0.35 : 1,
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>

        {/* Game Mode */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Game Mode</span>
          </div>
          <div style={styles.riskGrid}>
            {GAME_MODE_OPTIONS.map(({ tier, label, desc, color, multipliers, gainTag, lossTag }) => {
              const isActive = riskTier === tier;
              return (
                <button
                  key={tier}
                  onClick={() => setRiskTier(tier)}
                  style={{
                    ...styles.riskCard,
                    ...(isActive ? {
                      border: `1px solid ${color}40`,
                      background: `${color}08`,
                    } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <div style={{
                      ...styles.riskIndicator,
                      background: isActive ? color : theme.text.muted,
                    }} />
                    <div style={{ ...styles.riskInfo, flex: 1 }}>
                      <span style={{
                        ...styles.riskLabel,
                        color: isActive ? color : theme.text.secondary,
                        fontSize: '15px',
                      }}>{label}</span>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme.text.muted,
                        lineHeight: 1.3,
                      }}>{desc}</span>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column' as const,
                      alignItems: 'flex-end',
                      gap: '2px',
                      flexShrink: 0,
                    }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.game.multiplier,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}>gain {gainTag}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.game.divider,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}>loss {lossTag}</span>
                    </div>
                  </div>
                  {isActive && (
                    <div style={styles.modeMultipliersWrap}>
                      {multipliers.map((m, i) => {
                        const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'legendary'];
                        const rarityColors: Record<string, string> = {
                          common: 'rgba(148, 163, 184, 0.6)',
                          uncommon: 'rgba(52, 211, 153, 0.8)',
                          rare: 'rgba(96, 165, 250, 0.9)',
                          legendary: 'rgba(251, 191, 36, 1)',
                        };
                        const rarity = rarities[i] || 'common';
                        return (
                          <span
                            key={i}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              fontFamily: '"JetBrains Mono", monospace',
                              color: rarityColors[rarity],
                              padding: '2px 5px',
                              borderRadius: '3px',
                              background: `${rarityColors[rarity]}10`,
                              border: `1px solid ${rarityColors[rarity]}20`,
                            }}
                          >
                            {m}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Balance info */}
        <div style={styles.balanceRow}>
          <span style={styles.balanceLabel}>Balance</span>
          <span style={styles.balanceValue} className="mono">
            <img src="/sol-coin.png" alt="SOL" style={{ width: '20px', height: '20px', marginRight: '4px', verticalAlign: 'middle' }} />
            {formatSol(profile.balance)} SOL
          </span>
        </div>

        {/* Fee info */}
        {betAmount > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '4px 12px',
            fontSize: '12px', color: theme.text.muted,
          }}>
            <span>Fee ({(feeRate * 100).toFixed(0)}%)</span>
            <span className="mono">{formatSol(fee)} SOL</span>
          </div>
        )}

        {/* Start Round Button */}
        <button
          onClick={handleStart}
          disabled={!canAfford || !meetsMinBet}
          className="btn-3d btn-3d-primary"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '16px 24px',
            fontSize: '16px',
            width: '100%',
            opacity: !canAfford || !meetsMinBet ? 0.4 : 1,
          }}
        >
          <span style={styles.executeBtnText}>Start Round</span>
          <span style={styles.executeBtnSub} className="mono">
            <img src="/sol-coin.png" alt="SOL" style={{ width: '24px', height: '24px', marginRight: '4px', verticalAlign: 'middle' }} />
            {formatSol(totalCost)} · {GAME_MODE_OPTIONS.find(o => o.tier === riskTier)?.label || riskTier}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
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
    fontFamily: "'Orbitron', sans-serif",
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

  // Panels
  panel: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    flex: 1,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  panelValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },

  // Bet Grid
  betGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.25), rgba(20, 241, 149, 0.25))',
  },
  betChip: {
    padding: '10px 4px',
    background: theme.bg.secondary,
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'all 0.12s ease',
    textAlign: 'center',
  },
  betChipActive: {
    color: '#c084fc',
    background: 'rgba(153, 69, 255, 0.08)',
  },

  // Custom Bet
  customBetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderTop: `1px solid ${theme.border.subtle}`,
  },
  customBetLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.muted,
    flexShrink: 0,
  },
  customBetInputWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: theme.bg.tertiary,
    borderRadius: '6px',
    padding: '0 8px',
    border: `1px solid ${theme.border.subtle}`,
  },
  customBetInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    padding: '7px 0',
    width: '60px',
    minWidth: 0,
  },
  customBetBtn: {
    padding: '5px 10px',
    background: 'rgba(153, 69, 255, 0.12)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '5px',
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '13px',
    fontWeight: 700,
    color: '#c084fc',
    transition: 'all 0.12s ease',
    flexShrink: 0,
  },

  // Risk Grid
  riskGrid: {
    display: 'flex',
    flexDirection: 'column',
  },
  riskCard: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '0px',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    transition: 'all 0.15s ease',
    textAlign: 'left',
  },
  riskIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
  riskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  riskLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    transition: 'color 0.15s ease',
  },
  modeMultipliersWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: `1px solid ${theme.border.subtle}`,
    width: '100%',
  },

  // Balance
  balanceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: '8px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
  },
  balanceLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.muted,
  },
  balanceValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
  },

  // Execute Button
  executeBtnText: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  executeBtnSub: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
  },
};
