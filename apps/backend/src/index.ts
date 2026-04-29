/**
 * apps/backend
 *
 * Axhy backend service. Fastify HTTP layer + Prisma + state-machine spine.
 * Multi-tenant via server-side `companyId` injection.
 *
 * @derives(ADR-0004)
 */

const PORT = Number(process.env.PORT ?? 4000);

console.log(`[axhy-backend] scaffold; port ${PORT}; real server lands during build phase 1`);
