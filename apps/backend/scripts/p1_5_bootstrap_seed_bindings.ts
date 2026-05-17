/**
 * P1.5b bootstrap-seed for SiteSupervisorBinding (2026-05-17).
 *
 * Plan: /Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md rev 4.
 * Spec correction: docs/specs/2026-05-14-supervisor-responsibility-model.md
 * Amendments 2026-05-17 A-1 / A-2 (Tier 1 derivation uses Complaint +
 * SwapRequest, not Assignment/Visit — those fields don't exist).
 *
 * Run (from repo root):
 *   pnpm --filter @axhy/backend tsx --env-file=.env.local \
 *     scripts/p1_5_bootstrap_seed_bindings.ts \
 *     [--company <slug>] [--dry-run] \
 *     [--tier1-min-events 3] [--tier1-threshold 0.60] \
 *     [--recent-action-skip-days 7] \
 *     [--report-dir tmp/p1_5_seed_reports]
 *
 * Library function `runBootstrapSeed` is exported separately so tests call it
 * directly (no subprocess, no process.exit, no logger side effects). The CLI
 * wrapper at the bottom of the file owns stdout/stderr + exit-code translation.
 *
 * @derives(supervisor-responsibility-model §9 pick 8 + Amendments 2026-05-17)
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { PrismaClient } from '@prisma/client';

import { withTenantContext } from '../src/middleware/tenant-context.js';
import { createPermanentBinding } from '../src/lib/site-supervisor-binding.js';

// ===========================================================================
// Types
// ===========================================================================

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type BootstrapSeedOpts = {
  prisma: PrismaClient;
  companySlug?: string;
  dryRun?: boolean;
  tier1MinEvents?: number;
  tier1Threshold?: number;
  recentActionSkipDays?: number;
  reportDir: string;
  now?: Date;
  /**
   * @internal TEST-ONLY fault-injection seam.
   * Called once per company immediately before that company's processing
   * starts. If it throws, the script treats the company as failed (sets
   * `companies[i].failed = true`, pushes the error message into warnings,
   * continues with the next company). Default: no-op.
   *
   * Production callers (CLI wrapper, HR portal slice) MUST NOT pass this.
   */
  _testHookBeforeCompany?: (companyId: string, companySlug: string) => Promise<void> | void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type CandidateScore = {
  userId: string;
  complaints: number;
  swaps: number;
  total: number;
  share: number;
};

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type SiteReport = {
  siteId: string;
  siteName: string;
  tier: 'tier1' | 'tier2' | 'tier3-unbound' | 'skipped-window-overlap' | 'skipped-recent-hr-action';
  winnerUserId: string | null;
  winnerScore: { complaints: number; swaps: number; total: number; share: number } | null;
  candidates: CandidateScore[];
  createdBindingId: string | null;
  conflictingBindingId: string | null;
  warnings: string[];
};

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type CompanyReport = {
  companyId: string;
  companySlug: string;
  failed: boolean;
  warnings: string[];
  sites: SiteReport[];
};

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type BootstrapSeedReport = {
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  thresholds: {
    tier1MinEvents: number;
    tier1Threshold: number;
    recentActionSkipDays: number;
  };
  companies: CompanyReport[];
};

/** @derives(ADR-0003) @derives(master-plan §G) — P1.5b bootstrap-seed library */
export type BootstrapSeedRunResult = {
  reportPath: string;
  summary: {
    companiesProcessed: number;
    companiesFailed: number;
    sitesBound: number;
    sitesUnbound: number;
    sitesSkipped: number;
  };
  failed: boolean;
  report: BootstrapSeedReport;
};

// ===========================================================================
// Constants
// ===========================================================================

/** Plain UUID per audit-trail durability convention (schema.prisma:1042 —
 *  createdBy has no FK). Documented as the bootstrap system actor. */
const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';

const REASON_STRING = 'BOOTSTRAP_SEED — pending HR review';

const DEFAULT_TIER1_MIN_EVENTS = 3;
const DEFAULT_TIER1_THRESHOLD = 0.6;
const DEFAULT_RECENT_ACTION_SKIP_DAYS = 7;

// ===========================================================================
// Library function
// ===========================================================================

/**
 * Pure library function. Never calls process.exit. Throws only on
 * unrecoverable errors (cannot write report file, cannot reach Prisma).
 * Per-company failures are caught and recorded in the report; they do
 * NOT throw.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function runBootstrapSeed(opts: BootstrapSeedOpts): Promise<BootstrapSeedRunResult> {
  const startedAt = new Date();
  const now = opts.now ?? startedAt;
  const dryRun = opts.dryRun ?? false;
  const tier1MinEvents = opts.tier1MinEvents ?? DEFAULT_TIER1_MIN_EVENTS;
  const tier1Threshold = opts.tier1Threshold ?? DEFAULT_TIER1_THRESHOLD;
  const recentActionSkipDays = opts.recentActionSkipDays ?? DEFAULT_RECENT_ACTION_SKIP_DAYS;
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentActionCutoff = new Date(now.getTime() - recentActionSkipDays * 24 * 60 * 60 * 1000);

  const companies = await opts.prisma.company.findMany({
    where: {
      status: 'ACTIVE',
      ...(opts.companySlug ? { slug: opts.companySlug } : {}),
    },
    select: { id: true, slug: true },
  });

  // A targeted re-run (--company <slug>) that matches zero rows is almost
  // always a typo. Silently returning failed=false / exit 0 would let an
  // operator believe the seed ran when nothing happened. Fail loud instead.
  // The CLI wrapper's catch path translates this to exit code 2.
  if (opts.companySlug && companies.length === 0) {
    throw new Error(
      `runBootstrapSeed: no ACTIVE company found with slug='${opts.companySlug}'. ` +
        `Check the slug, or omit --company to process every ACTIVE tenant.`,
    );
  }

  const reportCompanies: CompanyReport[] = [];

  for (const co of companies) {
    const companyReport: CompanyReport = {
      companyId: co.id,
      companySlug: co.slug,
      failed: false,
      warnings: [],
      sites: [],
    };

    try {
      // Test-only fault-injection seam. Production callers leave this unset.
      if (opts._testHookBeforeCompany) {
        await opts._testHookBeforeCompany(co.id, co.slug);
      }

      const sites = await processCompany(opts.prisma, co.id, {
        now,
        windowStart,
        recentActionCutoff,
        tier1MinEvents,
        tier1Threshold,
        dryRun,
      });
      companyReport.sites = sites;
    } catch (err: unknown) {
      companyReport.failed = true;
      const msg = err instanceof Error ? err.message : String(err);
      companyReport.warnings.push(msg);
    }

    reportCompanies.push(companyReport);
  }

  const completedAt = new Date();

  const report: BootstrapSeedReport = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    dryRun,
    thresholds: {
      tier1MinEvents,
      tier1Threshold,
      recentActionSkipDays,
    },
    companies: reportCompanies,
  };

  // Summarize
  const summary = summarize(reportCompanies);
  const failed = summary.companiesFailed > 0;

  // Write report. This is the only filesystem write side effect.
  await fs.mkdir(opts.reportDir, { recursive: true });
  const filename = `p1_5_bootstrap_seed_${completedAt.toISOString().replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(opts.reportDir, filename);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return { reportPath, summary, failed, report };
}

// ===========================================================================
// Per-company processing
// ===========================================================================

type ProcessCompanyOpts = {
  now: Date;
  windowStart: Date;
  recentActionCutoff: Date;
  tier1MinEvents: number;
  tier1Threshold: number;
  dryRun: boolean;
};

async function processCompany(
  prisma: PrismaClient,
  companyId: string,
  o: ProcessCompanyOpts,
): Promise<SiteReport[]> {
  return await withTenantContext(prisma, companyId, async (tx) => {
    const sites = await tx.site.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Pre-resolve the company's ACTIVE supervisor memberships once for the
    // candidate-filter + Tier 2 fallback.
    const activeSupervisorMemberships = await tx.membership.findMany({
      where: { companyId, role: 'SUPERVISOR', status: 'ACTIVE' },
      select: { userId: true },
    });
    const activeSupervisorUserIds = new Set(activeSupervisorMemberships.map((m) => m.userId));
    const isSingleSupervisor = activeSupervisorUserIds.size === 1;
    const soleSupervisorUserId = isSingleSupervisor ? [...activeSupervisorUserIds][0] : null;

    const reports: SiteReport[] = [];

    for (const site of sites) {
      const r = await processSite(tx, {
        companyId,
        site,
        activeSupervisorUserIds,
        soleSupervisorUserId,
        ...o,
      });
      reports.push(r);
    }

    return reports;
  });
}

type ProcessSiteOpts = ProcessCompanyOpts & {
  companyId: string;
  site: { id: string; name: string };
  activeSupervisorUserIds: Set<string>;
  soleSupervisorUserId: string | null;
};

async function processSite(
  tx: import('@prisma/client').Prisma.TransactionClient,
  o: ProcessSiteOpts,
): Promise<SiteReport> {
  const { companyId, site, now, windowStart, recentActionCutoff } = o;

  const baseReport: SiteReport = {
    siteId: site.id,
    siteName: site.name,
    tier: 'tier3-unbound',
    winnerUserId: null,
    winnerScore: null,
    candidates: [],
    createdBindingId: null,
    conflictingBindingId: null,
    warnings: [],
  };

  // ---- Per-site script-level skip: recent HR action.
  const recentEnded = await tx.siteSupervisorBinding.findFirst({
    where: {
      companyId,
      siteId: site.id,
      actingForUserId: null,
      endedAt: { gte: recentActionCutoff },
    },
    select: { id: true },
  });
  if (recentEnded) {
    return {
      ...baseReport,
      tier: 'skipped-recent-hr-action',
      conflictingBindingId: recentEnded.id,
    };
  }

  // ---- Tier 1: Complaint + SwapRequest counts.
  //
  // Panel-polish 2026-05-17 P2 #2: we intentionally do NOT filter Complaint
  // or SwapRequest by status / resolution. Rationale:
  //   * The signal we want is "this supervisor was operationally engaged
  //     with this site recently" — captured by the supervisor having
  //     bothered to file/initiate the row at all. A withdrawn or rejected
  //     row still proves operational presence.
  //   * Seeded bindings carry `reason='BOOTSTRAP_SEED — pending HR review'`
  //     so any noise from low-signal rows is caught at HR review, not at
  //     seed time.
  //   * Filtering by status would create coupling between bootstrap and
  //     the per-table status conventions (which differ between Complaint
  //     and SwapRequest) and is the kind of policy choice that belongs in
  //     a later HR-tunable knob, not in the seed defaults.
  //
  // If a future review pushes back on noise from withdrawn rows, add a
  // `--include-complaint-statuses` flag rather than narrowing the default.
  const [complaintCounts, swapCounts] = await Promise.all([
    tx.complaint.groupBy({
      by: ['supervisorId'],
      where: { companyId, siteId: site.id, createdAt: { gte: windowStart } },
      _count: { _all: true },
    }),
    tx.swapRequest.groupBy({
      by: ['supervisorId'],
      where: { companyId, siteId: site.id, createdAt: { gte: windowStart } },
      _count: { _all: true },
    }),
  ]);

  // Merge per-supervisor + filter to ACTIVE SUPERVISOR memberships.
  const perSupervisor = new Map<string, { complaints: number; swaps: number }>();
  for (const row of complaintCounts) {
    if (!o.activeSupervisorUserIds.has(row.supervisorId)) continue;
    const cur = perSupervisor.get(row.supervisorId) ?? {
      complaints: 0,
      swaps: 0,
    };
    cur.complaints += row._count._all;
    perSupervisor.set(row.supervisorId, cur);
  }
  for (const row of swapCounts) {
    if (!o.activeSupervisorUserIds.has(row.supervisorId)) continue;
    const cur = perSupervisor.get(row.supervisorId) ?? {
      complaints: 0,
      swaps: 0,
    };
    cur.swaps += row._count._all;
    perSupervisor.set(row.supervisorId, cur);
  }

  const totalEvents = [...perSupervisor.values()].reduce(
    (sum, v) => sum + v.complaints + v.swaps,
    0,
  );

  const candidates: CandidateScore[] = [...perSupervisor.entries()]
    .map(([userId, c]) => {
      const total = c.complaints + c.swaps;
      return {
        userId,
        complaints: c.complaints,
        swaps: c.swaps,
        total,
        share: totalEvents === 0 ? 0 : total / totalEvents,
      };
    })
    .sort((a, b) => b.total - a.total);

  baseReport.candidates = candidates;

  // Tier 1 thresholds + exact-tie check.
  let tier1Winner: CandidateScore | null = null;
  if (candidates.length > 0) {
    const top = candidates[0];
    const second = candidates[1];
    const tied = second && second.total === top.total;
    if (tied) {
      baseReport.warnings.push(
        `Tier 1 exact tie at site '${site.name}' between ${candidates
          .filter((c) => c.total === top.total)
          .map((c) => c.userId)
          .join(', ')} — falling through`,
      );
    } else if (top.total >= o.tier1MinEvents && top.share >= o.tier1Threshold) {
      tier1Winner = top;
    }
  }

  let winnerUserId: string | null = null;
  let winnerScore: CandidateScore | null = null;
  let tier: SiteReport['tier'] = 'tier3-unbound';

  if (tier1Winner) {
    winnerUserId = tier1Winner.userId;
    winnerScore = tier1Winner;
    tier = 'tier1';
  } else if (o.soleSupervisorUserId) {
    winnerUserId = o.soleSupervisorUserId;
    tier = 'tier2';
  }

  if (!winnerUserId) {
    return { ...baseReport, tier: 'tier3-unbound', winnerUserId: null, winnerScore: null };
  }

  // ---- Call createPermanentBinding (or simulate in dry-run).
  if (o.dryRun) {
    return {
      ...baseReport,
      tier,
      winnerUserId,
      winnerScore,
      createdBindingId: null,
    };
  }

  const result = await createPermanentBinding(
    tx,
    {
      companyId,
      siteId: site.id,
      userId: winnerUserId,
      effectiveFrom: now,
      effectiveUntil: null,
      reason: REASON_STRING,
      createdBy: SYSTEM_ACTOR_UUID,
    },
    {
      tenantTimeZone: null,
      bypassFreezeReason: 'BOOTSTRAP_SEED',
      now,
    },
  );

  if (result.kind === 'CREATED') {
    return {
      ...baseReport,
      tier,
      winnerUserId,
      winnerScore,
      createdBindingId: result.bindingId,
    };
  }
  // WINDOW_OVERLAP
  return {
    ...baseReport,
    tier: 'skipped-window-overlap',
    winnerUserId,
    winnerScore,
    conflictingBindingId: result.conflictingBindingId,
  };
}

// ===========================================================================
// Summary
// ===========================================================================

function summarize(reportCompanies: CompanyReport[]): BootstrapSeedRunResult['summary'] {
  let companiesFailed = 0;
  let sitesBound = 0;
  let sitesUnbound = 0;
  let sitesSkipped = 0;

  for (const co of reportCompanies) {
    if (co.failed) companiesFailed += 1;
    for (const s of co.sites) {
      switch (s.tier) {
        case 'tier1':
        case 'tier2':
          if (s.createdBindingId) sitesBound += 1;
          else sitesSkipped += 1; // dry-run path
          break;
        case 'tier3-unbound':
          sitesUnbound += 1;
          break;
        case 'skipped-window-overlap':
        case 'skipped-recent-hr-action':
          sitesSkipped += 1;
          break;
      }
    }
  }

  return {
    companiesProcessed: reportCompanies.length,
    companiesFailed,
    sitesBound,
    sitesUnbound,
    sitesSkipped,
  };
}

// ===========================================================================
// CLI wrapper (only when invoked as main module)
// ===========================================================================

function parseArgvToOpts(argv: readonly string[]): Omit<BootstrapSeedOpts, 'prisma'> {
  const opts: Omit<BootstrapSeedOpts, 'prisma'> = {
    reportDir: 'tmp/p1_5_seed_reports',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--company':
        opts.companySlug = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--tier1-min-events':
        opts.tier1MinEvents = Number(argv[++i]);
        break;
      case '--tier1-threshold':
        opts.tier1Threshold = Number(argv[++i]);
        break;
      case '--recent-action-skip-days':
        opts.recentActionSkipDays = Number(argv[++i]);
        break;
      case '--report-dir':
        opts.reportDir = argv[++i];
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return opts;
}

function isMainModule(): boolean {
  // tsx/node: import.meta.url === pathToFileURL(process.argv[1]).href
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // Dynamic import keeps PrismaClient out of the library-export surface.
  // The library function takes prisma as an opt; the CLI builds one here.
  (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const parsed = parseArgvToOpts(process.argv);
      const result = await runBootstrapSeed({ ...parsed, prisma });
      // Locked stdout contract — one JSON line parseable by ops + tests.
      process.stdout.write(
        JSON.stringify({
          reportPath: result.reportPath,
          summary: result.summary,
          failed: result.failed,
        }) + '\n',
      );
      process.exitCode = result.failed ? 1 : 0;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[p1_5_bootstrap_seed] unrecoverable error: ${msg}\n`);
      process.exitCode = 2;
    } finally {
      await prisma.$disconnect();
    }
  })();
}

// fileURLToPath imported above to satisfy isolatedModules-friendly entry detection
void fileURLToPath;
