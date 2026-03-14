import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL is required'); process.exit(1); }
  const sql = postgres(dbUrl);
  const users = await sql`SELECT id, username, email, role, status FROM users WHERE role != 'bot' ORDER BY created_at ASC LIMIT 20`;
  console.log(JSON.stringify(users, null, 2));
  await sql.end();
}

main();
