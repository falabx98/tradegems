import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(connectionString: string) {
  const needsSsl = connectionString.includes('railway') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production';

  const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(needsSsl ? { ssl: 'require' } : {}),
  });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
