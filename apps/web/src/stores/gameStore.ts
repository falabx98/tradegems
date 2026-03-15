import { create } from 'zustand';
import {
  RoundConfig,
  RoundPhase,
  RoundResult,
  RiskTier,
  GameMode,
  PlayerProfile,
  GameNode,
} from '../types/game';
import { generateRound, simulateRound, getPhase } from '../engine/roundEngine';
import {
  DEFAULT_ENGINE_CONFIG,
  getBetTier,
  computeNodeEffect,
} from '../engine/engineConfig';
import type { EngineConfig } from '../engine/engineConfig';
import { api, getServerConfig } from '../utils/api';
import { toast } from './toastStore';

interface GameState {
  // Current view
  screen: 'lobby' | 'auth' | 'setup' | 'playing' | 'result' | 'wallet' | 'history' | 'leaderboard' | 'rewards' | 'settings' | 'prediction' | 'fairness' | 'season' | 'admin' | 'profile' | 'trading-sim' | 'lottery' | 'candleflip' | 'rug-game';
  mode: GameMode;

  // Round state
  roundConfig: RoundConfig | null;
  phase: RoundPhase;
  elapsed: number;
  isRunning: boolean;

  // Server round tracking
  serverRoundId: string | null;
  betPlaced: boolean;

  // Player choices
  betAmount: number;
  riskTier: RiskTier;

  // Live state during round
  currentMultiplier: number;
  shields: number;
  activatedNodeIds: Set<string>;
  missedNodeIds: Set<string>;
  nearMissNodeIds: Set<string>;

  // Engine config
  engineConfig: EngineConfig;

  // Result
  result: RoundResult | null;

  // Player profile
  profile: PlayerProfile;

  // Chat
  chatOpen: boolean;
  unreadChat: number;

  // Tournament (stub — feature not yet implemented)
  tournamentRoomId: string | null;
  joinTournament: (buyIn: number) => Promise<void>;
  leaveTournament: () => Promise<void>;
  resetTournament: () => void;

  // Actions
  setScreen: (screen: GameState['screen']) => void;
  setMode: (mode: GameMode) => void;
  setBetAmount: (amount: number) => void;
  setRiskTier: (tier: RiskTier) => void;
  startRound: () => void;
  updateElapsed: (elapsed: number) => void;
  activateNode: (node: GameNode) => void;
  missNode: (node: GameNode) => void;
  nearMissNode: (node: GameNode) => void;
  endRound: () => void;
  resetRound: () => void;
  playAgain: () => void;
  syncProfile: () => Promise<void>;
  toggleChat: () => void;
  clearUnreadChat: () => void;
  incrementUnreadChat: (count: number) => void;
}

const DEFAULT_PROFILE: PlayerProfile = {
  id: 'local-player',
  username: 'Player',
  level: 1,
  xp: 0,
  xpToNext: 100,
  vipTier: 'bronze',
  rakebackRate: 0.01,
  avatarUrl: null,
  balance: 0, // lamports
  totalWagered: 0,
  totalWon: 0,
  roundsPlayed: 0,
  winRate: 0,
  streak: 0,
  bestMultiplier: 1.0,
};

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'lobby',
  mode: 'solo',
  roundConfig: null,
  phase: 'pre',
  elapsed: 0,
  isRunning: false,
  serverRoundId: null,
  betPlaced: false,
  betAmount: 100_000_000, // 0.1 SOL in lamports
  riskTier: 'balanced',
  currentMultiplier: 1.0,
  shields: 0,
  activatedNodeIds: new Set(),
  missedNodeIds: new Set(),
  nearMissNodeIds: new Set(),
  engineConfig: DEFAULT_ENGINE_CONFIG,
  result: null,
  profile: DEFAULT_PROFILE,
  chatOpen: false,
  unreadChat: 0,

  // Tournament stubs
  tournamentRoomId: null,
  joinTournament: async (_buyIn: number) => { throw new Error('Tournaments coming soon'); },
  leaveTournament: async () => { set({ tournamentRoomId: null }); },
  resetTournament: () => { set({ tournamentRoomId: null }); },

  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setBetAmount: (amount) => set({ betAmount: amount }),
  setRiskTier: (tier) => set({ riskTier: tier }),

  startRound: () => {
    const state = get();

    // Generate round locally (deterministic engine)
    const config = generateRound(undefined, state.engineConfig);

    // Deduct betAmount + fee from local balance immediately
    // Use cached server config fee rate; sync it in background if not loaded yet
    const cachedConfig = (globalThis as any).__serverConfig;
    const feeRate = cachedConfig?.feeRate ?? 0.03;
    const fee = Math.floor(state.betAmount * feeRate);
    const totalCost = state.betAmount + fee;
    const profile = { ...state.profile };
    profile.balance = Math.max(0, profile.balance - totalCost);

    set({
      roundConfig: config,
      phase: 'opening',
      elapsed: 0,
      isRunning: true,
      currentMultiplier: 1.0,
      shields: 0,
      activatedNodeIds: new Set(),
      missedNodeIds: new Set(),
      nearMissNodeIds: new Set(),
      result: null,
      screen: 'playing',
      betPlaced: false,
      serverRoundId: null,
      profile,
    });

    // Place bet on server in background (non-blocking)
    (async () => {
      try {
        // Schedule a solo round and place bet
        const round = await api.startSoloRound() as any;
        const roundId = round.id;

        const idempotencyKey = `solo-${roundId}`;
        await api.placeBet(roundId, {
          amount: state.betAmount, // already in lamports
          riskTier: state.riskTier,
          idempotencyKey,
        });

        set({ serverRoundId: roundId, betPlaced: true });
      } catch (err: any) {
        console.warn('Server bet placement failed:', err);
        toast.error('Bet Failed', err?.message || 'Server bet placement failed. Balance will be corrected.');
        // Sync profile to correct local balance after failed bet placement
        get().syncProfile();
      }
    })();
  },

  updateElapsed: (elapsed) => {
    const phase = getPhase(elapsed);
    set({ elapsed, phase });
  },

  activateNode: (node) => {
    const state = get();
    const newActivated = new Set(state.activatedNodeIds);
    newActivated.add(node.id);

    const modifier = state.roundConfig?.riskModifiers[state.riskTier];
    const engineCfg = state.roundConfig?.engineConfig ?? state.engineConfig;
    if (!modifier) return;

    const betTier = getBetTier(state.betAmount, engineCfg);
    const { newMultiplier, newShields } = computeNodeEffect(
      node, state.currentMultiplier, state.shields,
      modifier, betTier,
    );

    // Clamp to max
    const maxMult = engineCfg.maxFinalMultiplier;
    const clampedMultiplier = Math.max(0, Math.min(maxMult, newMultiplier));

    set({
      activatedNodeIds: newActivated,
      currentMultiplier: clampedMultiplier,
      shields: newShields,
    });
  },

  missNode: (node) => {
    const state = get();
    const newMissed = new Set(state.missedNodeIds);
    newMissed.add(node.id);
    set({ missedNodeIds: newMissed });
  },

  nearMissNode: (node) => {
    const state = get();
    const newNearMissed = new Set(state.nearMissNodeIds);
    newNearMissed.add(node.id);
    set({ nearMissNodeIds: newNearMissed });
  },

  endRound: () => {
    const state = get();
    if (!state.roundConfig) return;

    const result = simulateRound(state.roundConfig, state.betAmount, state.riskTier);

    // Update profile locally
    // Balance was already deducted on startRound (betAmount + fee),
    // so just credit the payout amount back
    const profile = { ...state.profile };
    profile.roundsPlayed++;
    profile.totalWagered += state.betAmount;
    profile.totalWon += result.payout;
    profile.xp += result.xpGained;
    profile.balance += Math.floor(result.payout); // credit payout (cost already deducted at start)
    if (result.finalMultiplier > profile.bestMultiplier) {
      profile.bestMultiplier = result.finalMultiplier;
    }
    if (profile.xp >= profile.xpToNext) {
      profile.level++;
      profile.xp -= profile.xpToNext;
      profile.xpToNext = Math.floor(profile.xpToNext * 1.3);
    }
    // M4 fix: winRate = totalWon / totalWagered (ROI, same as server formula)
    // Avoids the old _wins hack that didn't persist across reloads
    profile.winRate = profile.totalWagered > 0
      ? profile.totalWon / profile.totalWagered
      : 0;

    set({
      phase: 'frozen',
      isRunning: false,
      result,
      screen: 'result',
      profile,
    });

    // Resolve on server in background and sync real balance
    (async () => {
      const { serverRoundId, betPlaced } = get();
      try {
        if (serverRoundId && betPlaced) {
          // Resolve solo round server-side (uses server's seed — source of truth)
          await api.resolveSoloRound(serverRoundId);

          // Fetch the actual server result to correct any seed mismatch
          try {
            const serverResult = await api.getRoundResult(serverRoundId) as any;
            if (serverResult && serverResult.finalMultiplier !== undefined) {
              const serverPayout = Number(serverResult.payoutAmount ?? 0);
              const serverMult = parseFloat(serverResult.finalMultiplier);
              // Update displayed result with server's authoritative values
              set((s) => ({
                result: s.result ? {
                  ...s.result,
                  finalMultiplier: serverMult,
                  payout: serverPayout,
                } : s.result,
              }));
            }
          } catch {
            // Non-critical — local result still displayed
          }
        }
      } catch (err: any) {
        console.warn('Server round resolution failed:', err);
        toast.warning('Sync Issue', 'Round result may differ from server. Balance will be corrected.');
      } finally {
        // Always sync real profile from server — corrects balance whether bet succeeded or not
        await get().syncProfile();
      }
    })();
  },

  resetRound: () => {
    set({
      roundConfig: null,
      phase: 'pre',
      elapsed: 0,
      isRunning: false,
      currentMultiplier: 1.0,
      shields: 0,
      activatedNodeIds: new Set(),
      missedNodeIds: new Set(),
      nearMissNodeIds: new Set(),
      result: null,
      screen: 'lobby',
      serverRoundId: null,
      betPlaced: false,
    });
  },

  playAgain: () => {
    set({
      roundConfig: null,
      phase: 'pre',
      elapsed: 0,
      isRunning: false,
      currentMultiplier: 1.0,
      shields: 0,
      activatedNodeIds: new Set(),
      missedNodeIds: new Set(),
      nearMissNodeIds: new Set(),
      result: null,
      screen: 'setup',
      serverRoundId: null,
      betPlaced: false,
    });
  },

  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen, unreadChat: !s.chatOpen ? 0 : s.unreadChat })),
  clearUnreadChat: () => set({ unreadChat: 0 }),
  incrementUnreadChat: (count: number) => set((s) => ({ unreadChat: s.chatOpen ? 0 : s.unreadChat + count })),

  syncProfile: async () => {
    try {
      const [me, balances] = await Promise.all([
        api.getMe(),
        api.getBalances(),
        // Fetch and cache server config (fee rate, bet limits)
        getServerConfig().then(cfg => { (globalThis as any).__serverConfig = cfg; }).catch(() => {}),
      ]);

      const solBalance = balances.balances?.find((b: any) => b.asset === 'SOL');
      const availableLamports = solBalance ? parseInt(solBalance.available) : 0;

      let stats: any = {};
      try {
        stats = await api.getMyStats();
      } catch {
        // Stats endpoint might not return data for new users
      }

      set((state) => ({
        profile: {
          ...state.profile,
          id: me.id,
          username: me.username ?? state.profile.username,
          level: me.level ?? state.profile.level,
          vipTier: (me.vipTier as any) ?? state.profile.vipTier,
          avatarUrl: me.avatarUrl ?? state.profile.avatarUrl,
          balance: availableLamports, // stored as lamports
          totalWagered: stats.totalWagered ?? state.profile.totalWagered,
          totalWon: stats.totalWon ?? state.profile.totalWon,
          roundsPlayed: stats.roundsPlayed ?? state.profile.roundsPlayed,
          winRate: stats.winRate ?? state.profile.winRate,
          bestMultiplier: stats.bestMultiplier ? parseFloat(stats.bestMultiplier) : state.profile.bestMultiplier,
        },
      }));
    } catch (err) {
      console.warn('Profile sync failed:', err);
    }
  },
}));
