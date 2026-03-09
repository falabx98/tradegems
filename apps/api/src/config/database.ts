import { createDb, type Database } from '@tradingarena/db';
import { env } from './env.js';

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = createDb(env.DATABASE_URL);
  }
  return db;
}
