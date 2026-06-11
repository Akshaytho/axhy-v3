/**
 * Dispatcher DB client — the RLS Option-A split (decision 2026-06-09, memory
 * rls-tenant-isolation-rollout): the background/outbox worker KEEPS an
 * RLS-bypassing connection (trusted process, no user input — and its sweeps
 * are inherently cross-tenant), while the API's DATABASE_URL flips to the
 * non-superuser `axhy_app` role.
 *
 * Behavior:
 *   - DISPATCHER_DATABASE_URL unset (today's prod, all tests): this IS the
 *     shared singleton from lib/prisma.ts — same object, same pool, zero
 *     behavior change.
 *   - DISPATCHER_DATABASE_URL set (post-flip): a dedicated PrismaClient on
 *     that URL, so the dispatcher + its handlers + the piggybacked sweeps
 *     (reset-ai-spend, binding-expire, replacement-invite-expiry) keep
 *     seeing all tenants' rows while the API runs under RLS.
 *
 * The startup probe in dispatcher/index.ts verifies the connected role can
 * actually bypass RLS and crashes loudly if not — a dispatcher running as
 * axhy_app would otherwise SILENTLY no-op (visits stuck AWAITING_VERIFICATION,
 * AI spend uncharged — the worst finding of the 2026-06-11 RLS audit).
 *
 * @derives(ADR-0009)
 * @derives(docs/locked/operational-invariants.md INVARIANT 1)
 */

import { PrismaClient } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const dispatcherUrl = process.env.DISPATCHER_DATABASE_URL;

export const dispatcherPrisma: PrismaClient = dispatcherUrl
  ? new PrismaClient({ datasources: { db: { url: dispatcherUrl } } })
  : prisma;
