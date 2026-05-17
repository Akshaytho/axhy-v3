/**
 * F-013 — Sandbox-only test-fixture cleanup utility (2026-05-17).
 *
 * Deletes accumulated test-fixture `Company` rows by slug prefix; child rows
 * cascade via the existing Prisma `onDelete: Cascade` chain on Company FKs.
 *
 * SAFETY rails (constraints locked by friend 2026-05-17 — F-013 queue entry):
 *   - Dry-run by default; `--apply` required to actually delete.
 *   - Prefix-only selector (defaults: `p15b-`, `cal-find-`; extend with
 *     repeatable `--prefix <p>`). A company is a candidate ONLY if its slug
 *     starts with one of the configured prefixes.
 *   - Hardcoded denylist (`SLUG_DENYLIST`) of non-test slugs that must NEVER
 *     be touched even if their slug happens to start with a configured prefix.
 *     Currently denies `axhy-sandbox` (the persistent production-shape sandbox
 *     tenant).
 *   - Company-root delete; cascade handles children.
 *   - Same JSON-line stdout + `process.exitCode` contract as
 *     `p1_5_bootstrap_seed_bindings.ts` — library never `process.exit`s;
 *     CLI wrapper owns translation.
 *
 * Run (from repo root):
 *   pnpm --filter @axhy/backend tsx --env-file=.env.local \
 *     scripts/cleanup_sandbox_fixtures.ts [--apply] \
 *     [--prefix p15b-] [--prefix cal-find-] \
 *     [--report-dir tmp/cleanup_reports]
 *
 * @derives(feature-queue F-013 — 2026-05-17 friend lock)
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PrismaClient } from '@prisma/client';

// ===========================================================================
// Hardcoded safety
// ===========================================================================

/**
 * Slugs that MUST NEVER be deleted by this utility, even if they happen to
 * match a configured prefix. The persistent sandbox tenant `axhy-sandbox` is
 * the canonical entry — it holds the only real-shape data we use to validate
 * non-fixture scripts. Add other "do not touch" sandbox slugs here as the
 * sandbox accumulates real-data tenants.
 */
const SLUG_DENYLIST: ReadonlySet<string> = new Set(['axhy-sandbox']);

/** Default fixture prefixes — extendable via `--prefix <p>` CLI flag. */
const DEFAULT_PREFIXES: readonly string[] = ['p15b-', 'cal-find-'];

// ===========================================================================
// Types
// ===========================================================================

/** @derives(ADR-0003) @derives(master-plan §G) — F-013 sandbox-only fixture cleanup */
export type FixtureCleanupOpts = {
  prisma: PrismaClient;
  /** Default: ['p15b-', 'cal-find-']. */
  prefixes?: readonly string[];
  /** Default: false (dry-run). When false, NO deletes happen — the script
   *  reports what it WOULD delete. */
  apply?: boolean;
  /** REQUIRED — tests pass `os.tmpdir()`. */
  reportDir: string;
  now?: Date;
};

/** @derives(ADR-0003) @derives(master-plan §G) — F-013 sandbox-only fixture cleanup */
export type CompanyOutcome = {
  companyId: string;
  companySlug: string;
  matchedPrefix: string;
  outcome: 'would-delete' | 'deleted' | 'blocked-by-denylist' | 'delete-failed';
  errorMessage?: string;
};

/** @derives(ADR-0003) @derives(master-plan §G) — F-013 sandbox-only fixture cleanup */
export type FixtureCleanupReport = {
  startedAt: string;
  completedAt: string;
  apply: boolean;
  prefixes: readonly string[];
  denylist: readonly string[];
  companies: CompanyOutcome[];
};

/** @derives(ADR-0003) @derives(master-plan §G) — F-013 sandbox-only fixture cleanup */
export type FixtureCleanupRunResult = {
  reportPath: string;
  summary: {
    matched: number;
    blockedByDenylist: number;
    wouldDelete: number;
    deleted: number;
    failed: number;
  };
  apply: boolean;
  failed: boolean;
  report: FixtureCleanupReport;
};

// ===========================================================================
// Library function
// ===========================================================================

/**
 * Pure library function. Never calls `process.exit`. Never throws on
 * per-company failures (those are caught and recorded). Throws only on
 * unrecoverable errors (cannot reach Prisma; cannot write report file).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — sandbox hygiene
 */
export async function runFixtureCleanup(
  opts: FixtureCleanupOpts,
): Promise<FixtureCleanupRunResult> {
  const startedAt = new Date();
  const apply = opts.apply ?? false;
  const prefixes = opts.prefixes ?? DEFAULT_PREFIXES;

  if (prefixes.length === 0) {
    throw new Error(
      'runFixtureCleanup: at least one prefix is required; refuse to enumerate ALL companies as a safety measure',
    );
  }

  // Fetch every Company whose slug starts with any configured prefix.
  // Prisma doesn't have a native "starts-with-any" predicate, so OR the
  // per-prefix `startsWith` filters together.
  const companies = await opts.prisma.company.findMany({
    where: {
      OR: prefixes.map((p) => ({ slug: { startsWith: p } })),
    },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  });

  const outcomes: CompanyOutcome[] = [];

  for (const co of companies) {
    const matchedPrefix = prefixes.find((p) => co.slug.startsWith(p)) ?? '<none>';

    // Denylist guard — defense-in-depth even though no denylist slug should
    // ever match a configured prefix today.
    if (SLUG_DENYLIST.has(co.slug)) {
      outcomes.push({
        companyId: co.id,
        companySlug: co.slug,
        matchedPrefix,
        outcome: 'blocked-by-denylist',
      });
      continue;
    }

    if (!apply) {
      outcomes.push({
        companyId: co.id,
        companySlug: co.slug,
        matchedPrefix,
        outcome: 'would-delete',
      });
      continue;
    }

    // --apply path
    try {
      await opts.prisma.company.delete({ where: { id: co.id } });
      outcomes.push({
        companyId: co.id,
        companySlug: co.slug,
        matchedPrefix,
        outcome: 'deleted',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({
        companyId: co.id,
        companySlug: co.slug,
        matchedPrefix,
        outcome: 'delete-failed',
        errorMessage: message,
      });
    }
  }

  const completedAt = new Date();

  const report: FixtureCleanupReport = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    apply,
    prefixes: [...prefixes],
    denylist: [...SLUG_DENYLIST],
    companies: outcomes,
  };

  const summary = {
    matched: outcomes.length,
    blockedByDenylist: outcomes.filter((o) => o.outcome === 'blocked-by-denylist').length,
    wouldDelete: outcomes.filter((o) => o.outcome === 'would-delete').length,
    deleted: outcomes.filter((o) => o.outcome === 'deleted').length,
    failed: outcomes.filter((o) => o.outcome === 'delete-failed').length,
  };

  await fs.mkdir(opts.reportDir, { recursive: true });
  const filename = `cleanup_sandbox_fixtures_${completedAt
    .toISOString()
    .replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(opts.reportDir, filename);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return {
    reportPath,
    summary,
    apply,
    failed: summary.failed > 0,
    report,
  };
}

// ===========================================================================
// CLI wrapper (only when invoked as main module)
// ===========================================================================

function parseArgvToOpts(argv: readonly string[]): Omit<FixtureCleanupOpts, 'prisma'> {
  const opts: Omit<FixtureCleanupOpts, 'prisma'> & { _prefixes: string[] } = {
    reportDir: 'tmp/cleanup_reports',
    _prefixes: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--apply':
        opts.apply = true;
        break;
      case '--prefix': {
        const v = argv[++i];
        if (!v) throw new Error('--prefix requires a value');
        opts._prefixes.push(v);
        break;
      }
      case '--report-dir':
        opts.reportDir = argv[++i] ?? opts.reportDir;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  const { _prefixes, ...rest } = opts;
  return {
    ...rest,
    ...(_prefixes.length > 0 ? { prefixes: _prefixes } : {}),
  };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const parsed = parseArgvToOpts(process.argv);
      const result = await runFixtureCleanup({ ...parsed, prisma });
      process.stdout.write(
        JSON.stringify({
          reportPath: result.reportPath,
          summary: result.summary,
          apply: result.apply,
          failed: result.failed,
        }) + '\n',
      );
      process.exitCode = result.failed ? 1 : 0;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[cleanup_sandbox_fixtures] unrecoverable error: ${msg}\n`);
      process.exitCode = 2;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
