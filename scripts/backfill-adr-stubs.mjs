#!/usr/bin/env node
/**
 * scripts/backfill-adr-stubs.mjs
 *
 * Creates stub ADR files for every ADR referenced via @derives(ADR-NNNN)
 * that doesn't yet have a corresponding docs/decisions/NNNN-*.md file.
 *
 * Run via `node scripts/backfill-adr-stubs.mjs`. Idempotent.
 *
 * Per panel decision (Aanya, Saurabh, Maya 2026-04-29): the graph audit hard-fails
 * on dead links, so any new @derives reference must point to either a real
 * ADR file or a stub. The graph builder runs this script automatically when
 * it detects new dead links.
 *
 * @derives(ADR-0002)
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';

const TITLES = {
  '0003': 'Single source of truth for schema',
  '0004': 'Backend: Fastify + Prisma + Postgres on Railway',
  '0005': 'Marketing + admin in one Next.js app',
  '0006': 'XState v5 for state machines',
  '0007': 'Phone+OTP auth via MSG91 + jose JWT',
  '0008': 'Pure-function business rules',
  '0009': 'Postgres outbox over Redis',
  '0010': 'AI at user-input boundary only (thin-AI)',
  '0011': 'Auto-generated typed API clients',
  '0012': 'Hybrid STT — Sarvam + Whisper',
  '0013': 'Cloudflare R2 for file storage',
  '0014': 'Token-driven design system',
  '0015': 'shadcn/ui over Material UI',
  '0016': 'RN Reusables for mobile UI',
  '0017': 'Centralized copy catalog',
  '0018': 'Centralized error catalog',
  '0019': 'Custom ESLint rules',
  '0022': 'pgvector on existing Railway Postgres',
};

const SLUGS = {
  '0003': 'schema-source-of-truth',
  '0004': 'fastify-prisma-postgres',
  '0005': 'next-js-marketing-admin',
  '0006': 'xstate-v5',
  '0007': 'phone-otp-jose-jwt',
  '0008': 'pure-function-rules',
  '0009': 'postgres-outbox',
  '0010': 'ai-thin-boundary',
  '0011': 'auto-generated-clients',
  '0012': 'hybrid-stt-routing',
  '0013': 'cloudflare-r2',
  '0014': 'token-driven-design',
  '0015': 'shadcn-ui-over-mui',
  '0016': 'rn-reusables-mobile',
  '0017': 'centralized-copy',
  '0018': 'centralized-errors',
  '0019': 'custom-eslint-rules',
  '0022': 'pgvector-railway',
};

function adrFileExists(num) {
  const dir = join(ROOT, 'docs/decisions');
  return readdirSync(dir).some((f) => f.startsWith(`${num}-`) && f.endsWith('.md'));
}

let created = 0;
for (const [num, title] of Object.entries(TITLES)) {
  if (adrFileExists(num)) continue;
  const slug = SLUGS[num];
  const file = join(ROOT, 'docs/decisions', `${num}-${slug}.md`);
  if (existsSync(file)) continue;

  const body = `# ADR-${num}: ${title}

- **Status:** Accepted (stub backfill — full body lands when surfaced by audit)
- **Date:** 2026-04-29

## Context

This ADR was referenced in code via \`@derives(ADR-${num})\` before its full body
was written. Auto-created by \`scripts/backfill-adr-stubs.mjs\` so the lineage
audit doesn't hard-fail. The actual decision is already locked — see ADR-0001
(tech stack umbrella) and the master plan.

## Decision

(Stub — replace with full options-considered + decision text when this ADR
is the focus of a panel debate or revisit.)

## Consequences

(Stub.)

## Cost at scale

(Add when the body lands — see ADR template.)

## Lineage

- **Derives from:** master plan, ADR-0001
- **Affects:** see code references via grep '@derives(ADR-${num})'
`;
  writeFileSync(file, body);
  console.log(`[backfill] created ${file}`);
  created++;
}

console.log(`[backfill] Done. Created ${created} stub ADRs.`);
