/**
 * Route-test helpers — wrap Fastify `app.inject` with auth + idempotency
 * defaults so tests stop hand-writing Bearer headers per call.
 *
 * Use ONLY for tests that hit real routes (not data-layer-only tests).
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(panel-2026-05-10) — Wave 4b Phase 2.5 — replaces case-3 shadow-impl
 */

import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';

import type { Supervisor } from './with-multiple-tenants.js';

export type InjectAuthedOpts = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  /** Extra headers merged with auth + idempotency defaults. */
  headers?: Record<string, string>;
  /** Override the auto-generated Idempotency-Key (rarely needed). */
  idempotencyKey?: string;
};

/**
 * Inject an authenticated request as `supervisor`. Auto-fills:
 *   - `Authorization: Bearer ${supervisor.accessToken}`
 *   - `Content-Type: application/json` for POST/PUT/PATCH
 *   - `Idempotency-Key: <uuid>` for /chat/* routes (which require it)
 *
 * Returns the Fastify inject response — call `.json()` / `.statusCode`
 * on it as usual.
 */
export async function injectAuthed(
  app: FastifyInstance,
  supervisor: Supervisor,
  opts: InjectAuthedOpts,
): Promise<ReturnType<FastifyInstance['inject']>> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${supervisor.accessToken}`,
    ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(opts.url.startsWith('/chat/')
      ? { 'idempotency-key': opts.idempotencyKey ?? randomUUID() }
      : {}),
    ...(opts.headers ?? {}),
  };

  const inject: InjectOptions = {
    method: opts.method,
    url: opts.url,
    headers,
    ...(opts.body !== undefined ? { payload: opts.body as InjectOptions['payload'] } : {}),
  };

  return app.inject(inject);
}
