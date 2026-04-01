/**
 * Shared demo-mode detection for all games.
 * Returns true only if the frontend requests demo AND the user has no real balance but has demo balance.
 */
import { eq } from 'drizzle-orm';
import { balances, users } from '@tradingarena/db';
import { getDb } from '../config/database.js';

export async function detectDemoBet(userId: string, requestedDemo: boolean): Promise<boolean> {
  if (!requestedDemo) return false;

  const db = getDb();
  const [bal, user] = await Promise.all([
    db.query.balances.findFirst({ where: eq(balances.userId, userId) }),
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { demoBalance: true } }),
  ]);

  const realBalance = parseInt(String(bal?.availableAmount ?? 0)) || 0;
  const demoBalance = user?.demoBalance ?? 0;

  return realBalance === 0 && demoBalance > 0;
}
