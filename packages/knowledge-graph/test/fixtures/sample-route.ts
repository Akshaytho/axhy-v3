/**
 * Test fixture — minimal Fastify route plugin for extractor unit tests.
 * @derives(ADR-0002)
 */
import type { FastifyInstance } from 'fastify';

export async function workerRoutes(fastify: FastifyInstance) {
  fastify.get('/workers', async (_req, _reply) => {
    return [];
  });

  fastify.post('/workers', { preHandler: [fastify.requireRole('HR')] }, async (_req, _reply) => {
    return { id: 'new' };
  });

  fastify.patch('/workers/:id', async (_req, _reply) => {
    return { id: 'patched' };
  });
}
