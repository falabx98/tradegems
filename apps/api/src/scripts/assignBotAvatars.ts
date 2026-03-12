import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { users, userProfiles } from '@tradingarena/db';

const AVATARS = Array.from({ length: 20 }, (_, i) => {
  const names = [
    'emerald', 'ruby', 'sapphire', 'diamond', 'amethyst',
    'topaz', 'opal', 'turquoise', 'citrine', 'garnet',
    'jade', 'obsidian', 'lapis', 'rose_quartz', 'peridot',
    'tanzanite', 'amber', 'malachite', 'tiger_eye', 'alexandrite',
  ];
  return `/avatars/pepe_${String(i + 1).padStart(2, '0')}_${names[i]}.png`;
});

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:KMgUGZNVFRLiAMlkTGaVbtvWZSEvBuSm@turntable.proxy.rlwy.net:45790/railway';
  const client = postgres(dbUrl);
  const db = drizzle(client);

  const bots = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.role, 'bot'));
  console.log(`Found ${bots.length} bots to update with avatars...`);

  for (const bot of bots) {
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    await db.update(userProfiles).set({ avatarUrl: avatar }).where(eq(userProfiles.userId, bot.id));
    console.log(`  ${bot.username} → ${avatar}`);
  }

  console.log(`\nDone! Updated ${bots.length} bot avatars.`);
  await client.end();
  process.exit(0);
}

main();
