/**
 * Bot Seeding Script
 * Creates 100 crypto/meme-themed bot users with realistic activity
 * - Rounds, bets, results, leaderboard data
 * - Various levels, VIP tiers, balances
 * - Deletes all non-admin test users first
 */

import postgres from 'postgres';
import { randomUUID } from 'crypto';
import argon2 from 'argon2';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:KMgUGZNVFRLiAMlkTGaVbtvWZSEvBuSm@turntable.proxy.rlwy.net:45790/railway';
const sql = postgres(DATABASE_URL, { max: 5 });

// ─── Bot usernames ───────────────────────────────────────────
const BOT_USERNAMES = [
  'SolWhale', 'DegenApe42', 'PepeMaxi', 'MoonBoi', 'DiamondHands',
  'HODL_King', 'BullRunBro', 'CryptoChad', 'TokenTrader', 'YieldFarmer',
  'RugPullSurvivor', 'ShibaArmy', 'DogePapi', 'PumpItUp', 'LiquidityGod',
  'SatoshiJr', 'VitalikFan', 'SOLdier', 'ApeInAlpha', 'NFTFlippa',
  'BonkLord', 'JeetSlayer', 'GigaBrain', 'WhaleAlert', 'CryptoMommy',
  'LeverageLarry', 'StakingSteve', 'MEVbot_420', 'FloorSweeper', 'MintMaster',
  'BearHunter', 'GreenCandle', 'RedDildo', 'FOMOfreak', 'paperHandsNOT',
  'ChartWizard', 'TechnicalTom', 'LunarLambo', 'RektProof', 'DeFiDegen',
  'YOLOtrader', 'BagHolder99', 'AlphaLeaker', 'InfiniteAPY', 'GasWarrior',
  'WenMoon', 'ChadSolana', 'MemeKing', 'AirdropAndy', 'SnipeBot',
  'TokenSniff3r', 'CryptoPunk', 'BlockchainBro', 'HashRateHero', 'MiningMike',
  'ValidatorVic', 'OracleOscar', 'BridgeBandit', 'SwapSurfer', 'PoolParty',
  'StableStacy', 'WrappedWolf', 'LPfarmer', 'GovernorDAO', 'ProposalPete',
  'FlashLoanPhil', 'ArbitrageAce', 'CrossChainCris', 'L2Larry', 'ZKproof',
  'MerkleMax', 'ConsensusCarl', 'EpochEvan', 'SlotMachine', 'TxHashTony',
  'GweiGary', 'WeiWarrior', 'LamportLad', 'NonceNate', 'SeedPhraseS',
  'ColdWalletCal', 'HotWalletHank', 'PhantomPhil', 'MetaMaskMike', 'LedgerLeo',
  'KeystoneKen', 'FireblocksF', 'CustodyChris', 'AuditAlex', 'BugBountyBob',
  'ExploitEd', 'PatchPaul', 'ForkFred', 'HardForkHal', 'SoftForkSam',
  'ReorgRick', 'FinalityFay', 'ConfirmCathy', 'PropagateP', 'GossipGina',
];

const LAMPORTS = 1_000_000_000; // 1 SOL

// ─── Helpers ─────────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function daysAgo(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

async function main() {
  console.log('🤖 Starting bot seeding...\n');

  // ─── Step 1: Delete all existing users except admins ───────
  console.log('🗑️  Cleaning up existing test users...');

  // Get admin IDs to preserve
  const admins = await sql`SELECT id FROM users WHERE email IN ('notanontrader@gmail.com', 'notfalab@tradesol.com')`;
  const adminIds = admins.map(a => a.id);
  console.log(`   Preserving ${adminIds.length} admin accounts`);

  if (adminIds.length > 0) {
    // Delete in correct FK order
    const nonAdminUsers = await sql`SELECT id FROM users WHERE id != ALL(${adminIds})`;
    const deleteIds = nonAdminUsers.map(u => u.id);

    if (deleteIds.length > 0) {
      console.log(`   Deleting ${deleteIds.length} non-admin users and all their data...`);

      await sql`DELETE FROM referral_earnings WHERE referrer_id = ANY(${deleteIds}) OR referred_user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM referrals WHERE referrer_id = ANY(${deleteIds}) OR referred_user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM referral_codes WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM daily_rewards WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM user_achievements WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM user_mission_progress WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM leaderboard_snapshots WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM activity_feed_items WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM admin_audit_logs WHERE actor_user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM chat_messages WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM risk_flags WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM balance_ledger_entries WHERE user_id = ANY(${deleteIds})`;
      // Delete ALL game data (rounds, bets, results) - wipe clean
      await sql`DELETE FROM bet_results`;
      await sql`DELETE FROM bets`;
      await sql`DELETE FROM round_events`;
      await sql`DELETE FROM round_nodes`;
      await sql`DELETE FROM round_pools`;
      await sql`DELETE FROM rounds`;
      await sql`DELETE FROM withdrawals WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM deposits WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM balances WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM user_deposit_wallets WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM linked_wallets WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM user_sessions WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM user_profiles WHERE user_id = ANY(${deleteIds})`;
      await sql`DELETE FROM users WHERE id = ANY(${deleteIds})`;
      console.log('   ✅ Cleanup complete');
    }
  }

  // Also clean admin data that references deleted rounds
  await sql`DELETE FROM admin_audit_logs WHERE actor_user_id = ANY(${adminIds})`;
  await sql`DELETE FROM balances WHERE user_id = ANY(${adminIds})`;
  await sql`DELETE FROM user_profiles WHERE user_id = ANY(${adminIds})`;
  await sql`DELETE FROM referral_codes WHERE user_id = ANY(${adminIds})`;
  await sql`DELETE FROM user_sessions WHERE user_id = ANY(${adminIds})`;
  await sql`DELETE FROM user_deposit_wallets WHERE user_id = ANY(${adminIds})`;

  // ─── Step 2: Create 100 bot users ─────────────────────────
  console.log('\n👤 Creating 100 bot users...');

  const passwordHash = await argon2.hash('BotPassword123!');
  const vipTiers = ['bronze', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'platinum'];
  const botUsers: { id: string; username: string; level: number; vipTier: string; createdAt: Date }[] = [];

  for (let i = 0; i < 100; i++) {
    const username = BOT_USERNAMES[i];
    const level = rand(1, 25);
    const vipTier = level >= 20 ? 'platinum' : level >= 12 ? 'gold' : level >= 6 ? 'silver' : 'bronze';
    const xpTotal = level * rand(80, 150);
    const xpCurrent = rand(0, 100);
    const createdDaysAgo = rand(1, 60);
    const createdAt = daysAgo(createdDaysAgo);
    const id = randomUUID();

    await sql`
      INSERT INTO users (id, email, username, password_hash, status, role, vip_tier, level, xp_total, xp_current, xp_to_next, bonus_claimed, created_at, updated_at)
      VALUES (${id}, ${`bot_${username.toLowerCase()}@tradesol.bot`}, ${username}, ${passwordHash}, 'active', 'player', ${vipTier}, ${level}, ${xpTotal}, ${xpCurrent}, ${100 + level * 20}, true, ${createdAt.toISOString()}, ${new Date().toISOString()})
    `;

    botUsers.push({ id, username, level, vipTier, createdAt });
  }
  console.log(`   ✅ Created ${botUsers.length} bot users`);

  // ─── Step 3: Create user profiles ─────────────────────────
  console.log('\n📊 Creating user profiles with stats...');

  for (const bot of botUsers) {
    const roundsPlayed = rand(5, 500);
    const winRate = randFloat(0.25, 0.65);
    const totalWagered = rand(1, 200) * LAMPORTS;
    const totalWon = Math.floor(totalWagered * randFloat(0.3, 1.8));
    const bestMultiplier = randFloat(1.2, 8.5).toFixed(4);
    const currentStreak = rand(0, 8);
    const bestStreak = rand(currentStreak, 15);

    await sql`
      INSERT INTO user_profiles (user_id, display_name, total_wagered, total_won, rounds_played, best_multiplier, win_rate, current_streak, best_streak, updated_at)
      VALUES (${bot.id}, ${bot.username}, ${totalWagered}, ${totalWon}, ${roundsPlayed}, ${bestMultiplier}, ${winRate.toFixed(4)}, ${currentStreak}, ${bestStreak}, ${new Date().toISOString()})
    `;
  }
  console.log('   ✅ Profiles created');

  // ─── Step 4: Create balances ──────────────────────────────
  console.log('\n💰 Creating balances...');

  for (const bot of botUsers) {
    const available = rand(0, 50) * LAMPORTS / 10; // 0-5 SOL
    await sql`
      INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount, bonus_amount, updated_at)
      VALUES (${bot.id}, 'SOL', ${available}, 0, 0, 0, ${new Date().toISOString()})
    `;
  }
  console.log('   ✅ Balances created');

  // ─── Step 5: Create rounds (shared between bots) ──────────
  console.log('\n🎮 Creating rounds...');

  const roundIds: { id: string; createdAt: Date }[] = [];
  const configSnapshot = { maxBet: 5000000000, minBet: 10000000, fee: 0.03, duration: 15000 };

  // Create 200 rounds over the last 30 days
  for (let i = 0; i < 200; i++) {
    const id = randomUUID();
    const createdAt = daysAgo(rand(0, 30));
    const startedAt = new Date(createdAt.getTime() + 5000);
    const endedAt = new Date(startedAt.getTime() + 15000);
    const playerCount = rand(2, 12);

    await sql`
      INSERT INTO rounds (id, mode, status, scheduled_at, started_at, ended_at, resolved_at, seed, seed_commitment, config_snapshot, duration_ms, player_count, created_at)
      VALUES (${id}, 'solo', 'resolved', ${createdAt.toISOString()}, ${startedAt.toISOString()}, ${endedAt.toISOString()}, ${endedAt.toISOString()}, ${randomUUID()}, ${randomUUID()}, ${JSON.stringify(configSnapshot)}, 15000, ${playerCount}, ${createdAt.toISOString()})
    `;

    // Create round pool
    const grossPool = playerCount * rand(1, 5) * LAMPORTS / 10;
    const feeAmount = Math.floor(grossPool * 0.03);
    const netPool = grossPool - feeAmount;

    await sql`
      INSERT INTO round_pools (id, round_id, pool_type, liquidity_mode, gross_pool, fee_amount, fee_rate, net_pool, player_count, settled, created_at)
      VALUES (${randomUUID()}, ${id}, 'main', 'p2p', ${grossPool}, ${feeAmount}, '0.03', ${netPool}, ${playerCount}, true, ${createdAt.toISOString()})
    `;

    roundIds.push({ id, createdAt });
  }
  console.log(`   ✅ Created ${roundIds.length} rounds`);

  // ─── Step 6: Create bets and results ──────────────────────
  console.log('\n🎲 Creating bets and results...');

  let totalBets = 0;
  const riskTiers = ['conservative', 'balanced', 'balanced', 'aggressive', 'degen'];
  const resultTypes = ['win', 'win', 'win', 'loss', 'loss', 'loss', 'loss', 'jackpot'];

  // Track which bots played in which rounds to avoid duplicate bets
  const betTracker = new Set<string>();

  for (const round of roundIds) {
    // Pick random bots for this round
    const numPlayers = rand(2, 8);
    const shuffled = [...botUsers].sort(() => Math.random() - 0.5).slice(0, numPlayers);

    for (const bot of shuffled) {
      const key = `${bot.id}-${round.id}`;
      if (betTracker.has(key)) continue;
      betTracker.add(key);

      const betId = randomUUID();
      const amount = rand(1, 50) * LAMPORTS / 100; // 0.01-0.5 SOL
      const fee = Math.floor(amount * 0.03);
      const riskTier = pick(riskTiers);
      const resultType = pick(resultTypes);
      const multiplier = resultType === 'jackpot'
        ? randFloat(3.0, 10.0)
        : resultType === 'win'
          ? randFloat(1.1, 3.0)
          : randFloat(0.0, 0.95);
      const payout = resultType === 'loss' ? 0 : Math.floor(amount * multiplier);
      const xpAwarded = rand(5, 30);

      await sql`
        INSERT INTO bets (id, user_id, round_id, amount, fee, risk_tier, bet_size_tier, status, locked_at, settled_at, created_at)
        VALUES (${betId}, ${bot.id}, ${round.id}, ${amount}, ${fee}, ${riskTier}, ${amount > LAMPORTS / 2 ? 'large' : 'small'}, 'settled', ${round.createdAt.toISOString()}, ${round.createdAt.toISOString()}, ${round.createdAt.toISOString()})
      `;

      await sql`
        INSERT INTO bet_results (id, bet_id, user_id, round_id, final_multiplier, final_score, rank_position, payout_amount, rakeback_amount, xp_awarded, nodes_hit, nodes_missed, near_misses, result_type, created_at)
        VALUES (${randomUUID()}, ${betId}, ${bot.id}, ${round.id}, ${multiplier.toFixed(4)}, ${(amount * multiplier / LAMPORTS).toFixed(4)}, ${rand(1, numPlayers)}, ${payout}, 0, ${xpAwarded}, ${rand(0, 5)}, ${rand(0, 3)}, ${rand(0, 2)}, ${resultType}, ${round.createdAt.toISOString()})
      `;

      totalBets++;
    }
  }
  console.log(`   ✅ Created ${totalBets} bets with results`);

  // ─── Step 7: Create leaderboard snapshots ─────────────────
  console.log('\n🏆 Creating leaderboard snapshots...');

  // Daily leaderboard - sort bots by their profile's total_won
  const today = new Date().toISOString().split('T')[0];
  const topBots = [...botUsers].sort(() => Math.random() - 0.5).slice(0, 50);
  for (let i = 0; i < topBots.length; i++) {
    const score = randFloat(0.1, 15.0);
    await sql`
      INSERT INTO leaderboard_snapshots (leaderboard_type, period_key, user_id, rank, score, snapshot_at)
      VALUES ('profit', ${`daily:${today}`}, ${topBots[i].id}, ${i + 1}, ${score.toFixed(4)}, ${new Date().toISOString()})
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO leaderboard_snapshots (leaderboard_type, period_key, user_id, rank, score, snapshot_at)
      VALUES ('volume', ${`daily:${today}`}, ${topBots[i].id}, ${i + 1}, ${(score * rand(2, 10)).toFixed(4)}, ${new Date().toISOString()})
      ON CONFLICT DO NOTHING
    `;
  }

  // Weekly leaderboard
  const weekKey = `weekly:${today}`;
  const weekBots = [...botUsers].sort(() => Math.random() - 0.5).slice(0, 50);
  for (let i = 0; i < weekBots.length; i++) {
    const score = randFloat(1.0, 80.0);
    await sql`
      INSERT INTO leaderboard_snapshots (leaderboard_type, period_key, user_id, rank, score, snapshot_at)
      VALUES ('profit', ${weekKey}, ${weekBots[i].id}, ${i + 1}, ${score.toFixed(4)}, ${new Date().toISOString()})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log('   ✅ Leaderboard snapshots created');

  // ─── Step 8: Create some recent activity ──────────────────
  console.log('\n⚡ Creating recent activity (last few hours)...');

  // Create 20 recent rounds (last 6 hours) for "live" feel
  for (let i = 0; i < 20; i++) {
    const id = randomUUID();
    const h = randFloat(0.1, 6);
    const createdAt = hoursAgo(h);
    const isActive = h < 0.5;
    const status = isActive ? pick(['entry_open', 'in_progress']) : 'resolved';
    const playerCount = rand(1, 8);
    const startedAt = isActive ? null : new Date(createdAt.getTime() + 5000);
    const endedAt = status === 'resolved' ? new Date(createdAt.getTime() + 20000) : null;

    await sql`
      INSERT INTO rounds (id, mode, status, scheduled_at, started_at, ended_at, resolved_at, seed, seed_commitment, config_snapshot, duration_ms, player_count, created_at)
      VALUES (${id}, 'solo', ${status}, ${createdAt.toISOString()}, ${startedAt?.toISOString() ?? null}, ${endedAt?.toISOString() ?? null}, ${endedAt?.toISOString() ?? null}, ${randomUUID()}, ${randomUUID()}, ${JSON.stringify(configSnapshot)}, 15000, ${playerCount}, ${createdAt.toISOString()})
    `;

    // Add bets for resolved recent rounds
    if (status === 'resolved') {
      const players = [...botUsers].sort(() => Math.random() - 0.5).slice(0, playerCount);
      for (const bot of players) {
        const key = `${bot.id}-${id}`;
        if (betTracker.has(key)) continue;
        betTracker.add(key);

        const betId = randomUUID();
        const amount = rand(1, 30) * LAMPORTS / 100;
        const fee = Math.floor(amount * 0.03);
        const resultType = pick(resultTypes);
        const multiplier = resultType === 'win' ? randFloat(1.1, 2.5) : randFloat(0, 0.9);
        const payout = resultType === 'loss' ? 0 : Math.floor(amount * multiplier);

        await sql`
          INSERT INTO bets (id, user_id, round_id, amount, fee, risk_tier, bet_size_tier, status, locked_at, settled_at, created_at)
          VALUES (${betId}, ${bot.id}, ${id}, ${amount}, ${fee}, ${pick(riskTiers)}, 'small', 'settled', ${createdAt.toISOString()}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
        `;
        await sql`
          INSERT INTO bet_results (id, bet_id, user_id, round_id, final_multiplier, final_score, rank_position, payout_amount, rakeback_amount, xp_awarded, nodes_hit, nodes_missed, near_misses, result_type, created_at)
          VALUES (${randomUUID()}, ${betId}, ${bot.id}, ${id}, ${multiplier.toFixed(4)}, ${(amount * multiplier / LAMPORTS).toFixed(4)}, ${rand(1, playerCount)}, ${payout}, 0, ${rand(5, 20)}, ${rand(0, 4)}, ${rand(0, 2)}, ${rand(0, 1)}, ${resultType}, ${createdAt.toISOString()})
        `;
      }
    }
  }
  console.log('   ✅ Recent activity created');

  // ─── Step 9: Create admin profile and balance ─────────────
  console.log('\n👑 Setting up admin profiles...');

  for (const adminId of adminIds) {
    await sql`
      INSERT INTO user_profiles (user_id, display_name, total_wagered, total_won, rounds_played, best_multiplier, win_rate, current_streak, best_streak, updated_at)
      VALUES (${adminId}, NULL, 0, 0, 0, '1.0', '0.0', 0, 0, ${new Date().toISOString()})
      ON CONFLICT (user_id) DO NOTHING
    `;
    await sql`
      INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount, bonus_amount, updated_at)
      VALUES (${adminId}, 'SOL', 0, 0, 0, 0, ${new Date().toISOString()})
      ON CONFLICT ON CONSTRAINT balances_pk DO NOTHING
    `;
  }
  console.log('   ✅ Admin profiles set up');

  // ─── Summary ──────────────────────────────────────────────
  const userCount = await sql`SELECT COUNT(*) as c FROM users`;
  const roundCount = await sql`SELECT COUNT(*) as c FROM rounds`;
  const betCount = await sql`SELECT COUNT(*) as c FROM bets`;
  const lbCount = await sql`SELECT COUNT(*) as c FROM leaderboard_snapshots`;

  console.log('\n════════════════════════════════════════');
  console.log('🎉 Bot seeding complete!');
  console.log(`   👤 Users:        ${userCount[0].c}`);
  console.log(`   🎮 Rounds:       ${roundCount[0].c}`);
  console.log(`   🎲 Bets:         ${betCount[0].c}`);
  console.log(`   🏆 Leaderboard:  ${lbCount[0].c}`);
  console.log('════════════════════════════════════════\n');

  await sql.end();
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
