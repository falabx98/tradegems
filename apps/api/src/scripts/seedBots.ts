import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { users, userProfiles } from '@tradingarena/db';

// 100 bot usernames
const BOT_USERNAMES = [
  // Crypto/Trading (35)
  'SatoshiFan', 'DiamondHands', 'MoonBoy', 'WhaleAlert', 'DeFi_Duke',
  'CryptoKing', 'NFT_Ninja', 'BlockBuilder', 'TokenTrader', 'ChainMaster',
  'SolanaStorm', 'EthMaxi', 'GasFeeGod', 'LiquidityLord', 'YieldFarmer',
  'RugPullSurvivor', 'BullRunner', 'BearSlayer', 'PumpKing', 'DumpGuard',
  'HashPower', 'MinerMike', 'StakeKing', 'ApeIn_Andy', 'FOMOFighter',
  'HODLer_Pro', 'WenLambo', 'GemHunter', 'DexWizard', 'AirdropAce',
  'FlipMaster', 'AlphaCaller', 'DeltaTrader', 'ShortSqueeze', 'LongGame',
  // Cool Nicknames (35)
  'ShadowTrader', 'NightOwl', 'IceKing', 'SilentStrike', 'DarkPhoenix',
  'ThunderBolt', 'StormRider', 'NeonWolf', 'CyberSamurai', 'VoidWalker',
  'GhostRunner', 'BlazePath', 'IronFist', 'NovaStar', 'ZeroGravity',
  'QuantumLeap', 'VectorPrime', 'PixelDrift', 'CosmicRay', 'TurboBlitz',
  'ArcticFox', 'RavenClaw', 'TitanForge', 'CrimsonBlade', 'OnyxShield',
  'VoltEdge', 'SpectreOps', 'EchoStrike', 'PrismShift', 'SteelNerve',
  'HexFlare', 'AeroKnight', 'PulseFire', 'JadeDragon', 'ChronoShift',
  // Normal English Names (30)
  'Jake_M', 'Sarah_T', 'Mike_W', 'Emily_R', 'Chris_B',
  'Alex_P', 'Jordan_K', 'Sam_L', 'Riley_J', 'Taylor_D',
  'Max_H', 'Olivia_S', 'Noah_C', 'Sophia_G', 'Liam_F',
  'AvaTrader', 'EthanPlays', 'Mia_2025', 'Lucas_Pro', 'IsabellaGo',
  'MasonX', 'CharlotteW', 'LoganTrades', 'AmeliaK', 'JacksonV',
  'Harper_M', 'AidenXO', 'EllaTrades', 'CadenWins', 'LilyPad99',
];

function getLevelForIndex(index: number): number {
  if (index < 40) {
    // First 40 bots: levels 1-9
    return Math.floor(Math.random() * 9) + 1;
  } else if (index < 70) {
    // Next 30 bots: levels 10-19
    return Math.floor(Math.random() * 10) + 10;
  } else if (index < 88) {
    // Next 18 bots: levels 20-29
    return Math.floor(Math.random() * 10) + 20;
  } else if (index < 97) {
    // Next 9 bots: levels 30-49
    return Math.floor(Math.random() * 20) + 30;
  } else {
    // Last 3 bots: levels 50-60
    return Math.floor(Math.random() * 11) + 50;
  }
}

function getVipTier(level: number): string {
  if (level >= 40) return 'platinum';
  if (level >= 20) return 'gold';
  if (level >= 10) return 'silver';
  return 'bronze';
}

// 20 default avatar images
const AVATAR_POOL = Array.from({ length: 20 }, (_, i) => {
  const names = [
    'emerald', 'ruby', 'sapphire', 'diamond', 'amethyst',
    'topaz', 'opal', 'turquoise', 'citrine', 'garnet',
    'jade', 'obsidian', 'lapis', 'rose_quartz', 'peridot',
    'tanzanite', 'amber', 'malachite', 'tiger_eye', 'alexandrite',
  ];
  return `/avatars/pepe_${String(i + 1).padStart(2, '0')}_${names[i]}.png`;
});

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:KMgUGZNVFRLiAMlkTGaVbtvWZSEvBuSm@turntable.proxy.rlwy.net:45790/railway';
  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('Seeding 100 bot users...');

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < BOT_USERNAMES.length; i++) {
    const username = BOT_USERNAMES[i];

    // Check if username already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .then(r => r[0]);

    if (existing) {
      console.log(`  Skipping "${username}" (already exists)`);
      skipped++;
      continue;
    }

    const level = getLevelForIndex(i);
    const vipTier = getVipTier(level);
    const xpToNext = Math.floor(100 * Math.pow(1.3, level));
    // Total XP accumulated through all levels
    let xpTotal = 0;
    for (let l = 1; l < level; l++) {
      xpTotal += Math.floor(100 * Math.pow(1.3, l));
    }
    // Current XP is a random portion of the current level's requirement
    const xpCurrent = Math.floor(Math.random() * xpToNext);
    xpTotal += xpCurrent;

    // Insert user
    const [newUser] = await db.insert(users).values({
      email: null,
      username,
      passwordHash: null,
      role: 'bot',
      status: 'active',
      vipTier,
      level,
      xpTotal,
      xpCurrent,
      xpToNext,
    }).returning({ id: users.id });

    // Generate profile stats scaled to level
    const roundsPlayed = randomBetween(10, Math.min(500, 10 + level * 12));
    const avgBet = randomBetween(50_000_000, 500_000_000); // 0.05 - 0.5 SOL
    const totalWagered = roundsPlayed * avgBet;
    const winRate = randomFloat(0.45, 0.55);
    const totalWon = Math.floor(totalWagered * winRate * randomFloat(0.9, 1.1));
    const bestMultiplier = randomFloat(1.5, 8.0);
    const currentStreak = randomBetween(0, 5);
    const bestStreak = randomBetween(3, 12);

    await db.insert(userProfiles).values({
      userId: newUser.id,
      displayName: username,
      avatarUrl: AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)],
      roundsPlayed,
      totalWagered,
      totalWon,
      bestMultiplier: bestMultiplier.toFixed(4),
      winRate: winRate.toFixed(4),
      currentStreak,
      bestStreak,
    });

    created++;
    console.log(`  Created bot "${username}" (level ${level}, ${vipTier})`);
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
