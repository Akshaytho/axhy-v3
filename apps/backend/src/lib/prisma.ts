/**
 * Singleton Prisma client. Picks DATABASE_URL with sane fallbacks for local +
 * Railway-CLI shells (where DATABASE_PUBLIC_URL is set but internal one isn't
 * reachable).
 *
 * @derives(ADR-0004)
 */

import { PrismaClient } from '@prisma/client';

const url =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL ?? '';

if (!url) {
  throw new Error('No DATABASE_URL set. See apps/backend/.env.example.');
}

export const prisma = new PrismaClient({
  datasources: { db: { url } },
});
