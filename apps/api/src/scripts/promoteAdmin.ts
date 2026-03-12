import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:KMgUGZNVFRLiAMlkTGaVbtvWZSEvBuSm@turntable.proxy.rlwy.net:45790/railway';
  const sql = postgres(dbUrl);

  const userId = '56eabf86-965f-4aa4-8223-123fb043c17d'; // xfalabx

  await sql`UPDATE users SET role = 'superadmin' WHERE id = ${userId}`;

  const [user] = await sql`SELECT id, username, email, role FROM users WHERE id = ${userId}`;
  console.log('Updated user:', JSON.stringify(user, null, 2));

  await sql.end();
}

main();
