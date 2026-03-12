import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:KMgUGZNVFRLiAMlkTGaVbtvWZSEvBuSm@turntable.proxy.rlwy.net:45790/railway';
  const sql = postgres(dbUrl);
  const users = await sql`SELECT id, username, email, role, status FROM users WHERE role != 'bot' ORDER BY created_at ASC LIMIT 20`;
  console.log(JSON.stringify(users, null, 2));
  await sql.end();
}

main();
