#!/usr/bin/env node
/**
 * Default-deny auth check — ledger #23, SAFE half (06-09 handoff decision).
 *
 * Fails the build when any backend route module could ship unauthenticated
 * by accident: every file in apps/backend/src/routes/ must either
 *   (a) reference one of the auth gates (`requireAuth` / `requireWorkerRole`
 *       from middleware/tenant-context.ts), or
 *   (b) carry an explicit `auth-exempt` marker WITH a justification on the
 *       same line (the convention auth-refresh.ts:1 established), reserved
 *       for deliberately-public surfaces (login bootstrap, refresh).
 *
 * The riskier runtime half (a global onRequest hook) is deliberately NOT
 * here — deferred per the 06-09 handoff #23 decision. This check cannot see
 * routes registered outside src/routes/ (none exist; server.ts registers
 * only routes/ modules).
 *
 * Usage: node scripts/check-default-deny.mjs   (CI: default-deny job)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routesDir = join(repoRoot, 'apps/backend/src/routes');

const GATE_RE = /requireAuth|requireWorkerRole/;
// Marker must carry a justification: "auth-exempt" followed by a dash/em-dash
// and at least a few words on the same line.
const EXEMPT_RE = /auth-exempt\s*[—-]\s*\S+/;

const files = readdirSync(routesDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const violations = [];
let gated = 0;
let exempt = 0;

for (const f of files) {
  const src = readFileSync(join(routesDir, f), 'utf8');
  if (GATE_RE.test(src)) {
    gated += 1;
  } else if (EXEMPT_RE.test(src)) {
    exempt += 1;
  } else {
    violations.push(f);
  }
}

if (violations.length > 0) {
  console.error('[default-deny] FAIL — route module(s) with NO auth gate and NO justified auth-exempt marker:');
  for (const f of violations) {
    console.error(`  - apps/backend/src/routes/${f}`);
    console.error('      fix: add requireAuth/requireWorkerRole as a preHandler,');
    console.error('      or, ONLY for a deliberately public surface, add a header comment:');
    console.error('      // auth-exempt — <why this route must be public>');
  }
  process.exit(1);
}

console.log(
  `[default-deny] OK — ${files.length} route modules checked: ${gated} gated, ${exempt} justified-exempt, 0 violations.`,
);
