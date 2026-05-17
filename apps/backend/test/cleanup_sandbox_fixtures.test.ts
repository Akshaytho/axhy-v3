/**
 * F-013 — Sandbox-only test-fixture cleanup utility tests.
 *
 * Verifies the locked safety constraints:
 *   - Dry-run is the default; no deletes happen without --apply.
 *   - Prefix-only selector — non-matching slugs untouched.
 *   - Denylist guard refuses to delete protected slugs (axhy-sandbox).
 *   - Company-root delete cascades to child rows (Sites, etc.).
 *   - CLI contract: result.failed=false on clean runs, no exceptions thrown
 *     on per-company failures.
 *
 * @derives(feature-queue F-013 — 2026-05-17)
 */

import * as os from 'node:os';

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { runFixtureCleanup } from '../scripts/cleanup_sandbox_fixtures.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const REPORT_DIR = os.tmpdir();

// Use a F013-specific prefix so these tests cannot collide with the
// real cleanup utility's defaults (p15b-, cal-find-).
const TEST_PREFIX = `f013-${Date.now()}-`;

let phoneSeq = 1;
function nextPhone(): string {
  const n = `${Date.now()}${phoneSeq++}`.slice(-10);
  return `+91${n}`;
}

async function makeCompany(
  label: string,
  opts?: { slug?: string },
): Promise<{ id: string; slug: string }> {
  const slug = opts?.slug ?? `${TEST_PREFIX}${label}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const co = await prisma.company.create({
    data: {
      name: `${TEST_PREFIX}${label}-co`,
      slug,
      ownerPhone: nextPhone(),
      ownerName: 'Owner',
    },
  });
  return { id: co.id, slug: co.slug };
}

async function makeSite(companyId: string, name: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name, state: 'ACTIVE' } });
  return s.id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('F-013 sandbox-fixture cleanup (real DB)', () => {
  // -------------------------------------------------------------------------
  // Case 1 — Dry-run by default: matches reported, no deletes happen
  // -------------------------------------------------------------------------
  it('Case 1: dry-run reports matches but does NOT delete', async () => {
    const co = await makeCompany('c1');

    const result = await runFixtureCleanup({
      prisma,
      prefixes: [TEST_PREFIX],
      reportDir: REPORT_DIR,
    });

    expect(result.apply).toBe(false);
    expect(result.failed).toBe(false);
    const ours = result.report.companies.find((c) => c.companyId === co.id);
    expect(ours?.outcome).toBe('would-delete');
    // No actual delete — row still exists.
    const stillThere = await prisma.company.findUnique({ where: { id: co.id } });
    expect(stillThere).not.toBeNull();

    // cleanup
    await prisma.company.delete({ where: { id: co.id } });
  });

  // -------------------------------------------------------------------------
  // Case 2 — --apply deletes matched rows + cascades to children
  // -------------------------------------------------------------------------
  it('Case 2: --apply deletes matched company AND cascades to child sites', async () => {
    const co = await makeCompany('c2');
    const site = await makeSite(co.id, 'F013 Site');

    const result = await runFixtureCleanup({
      prisma,
      prefixes: [TEST_PREFIX],
      apply: true,
      reportDir: REPORT_DIR,
    });

    expect(result.apply).toBe(true);
    expect(result.failed).toBe(false);
    const ours = result.report.companies.find((c) => c.companyId === co.id);
    expect(ours?.outcome).toBe('deleted');

    const companyAfter = await prisma.company.findUnique({ where: { id: co.id } });
    expect(companyAfter).toBeNull();
    const siteAfter = await prisma.site.findUnique({ where: { id: site } });
    expect(siteAfter).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 3 — Non-matching slugs are NOT touched
  // -------------------------------------------------------------------------
  it('Case 3: companies whose slug does not match any prefix are never enumerated', async () => {
    // Create a company with a slug deliberately outside the test prefix.
    const unrelated = await makeCompany('c3', {
      slug: `unrelated-${Date.now()}-c3`,
    });

    const result = await runFixtureCleanup({
      prisma,
      prefixes: [TEST_PREFIX],
      apply: true,
      reportDir: REPORT_DIR,
    });

    expect(result.report.companies.find((c) => c.companyId === unrelated.id)).toBeUndefined();
    const stillThere = await prisma.company.findUnique({ where: { id: unrelated.id } });
    expect(stillThere).not.toBeNull();

    // cleanup
    await prisma.company.delete({ where: { id: unrelated.id } });
  });

  // -------------------------------------------------------------------------
  // Case 4 — Denylist refuses to delete axhy-sandbox even if it matches
  //
  // We simulate the denylist behavior by creating a test row whose slug
  // matches the prefix and is added to a custom denylist check. Since the
  // denylist is hardcoded as `axhy-sandbox`, the cleanest deterministic
  // test is to use the real axhy-sandbox prefix path (NOT a configured
  // prefix), but we can still validate the safety code path by exercising
  // the script against axhy-sandbox directly with a forced prefix.
  // -------------------------------------------------------------------------
  it('Case 4: real axhy-sandbox is blocked-by-denylist even with prefix match', async () => {
    // The real axhy-sandbox tenant exists on this sandbox (slug=axhy-sandbox).
    // Force a prefix that matches it ('axhy-') and assert the denylist guard
    // produces blocked-by-denylist outcome with NO delete attempt.
    const before = await prisma.company.findUnique({
      where: { slug: 'axhy-sandbox' },
      select: { id: true },
    });
    expect(before).not.toBeNull();

    const result = await runFixtureCleanup({
      prisma,
      prefixes: ['axhy-'],
      apply: true,
      reportDir: REPORT_DIR,
    });

    const sandboxOutcome = result.report.companies.find((c) => c.companySlug === 'axhy-sandbox');
    expect(sandboxOutcome).toBeDefined();
    expect(sandboxOutcome!.outcome).toBe('blocked-by-denylist');

    const after = await prisma.company.findUnique({ where: { slug: 'axhy-sandbox' } });
    expect(after).not.toBeNull(); // still there
    expect(after!.id).toBe(before!.id);
  });

  // -------------------------------------------------------------------------
  // Case 5 — Empty prefix list refuses to run (safety)
  // -------------------------------------------------------------------------
  it('Case 5: empty prefix list throws (cannot enumerate ALL companies)', async () => {
    await expect(
      runFixtureCleanup({
        prisma,
        prefixes: [],
        reportDir: REPORT_DIR,
      }),
    ).rejects.toThrow(/at least one prefix/);
  });

  // -------------------------------------------------------------------------
  // Case 6 — Multiple prefixes union correctly
  // -------------------------------------------------------------------------
  it('Case 6: multiple prefixes union; both match sets are deleted', async () => {
    const tag = `f013multi-${Date.now()}`;
    const coA = await makeCompany('mA', { slug: `${tag}-a-pre1` });
    const coB = await makeCompany('mB', { slug: `${tag}-b-pre2` });

    const result = await runFixtureCleanup({
      prisma,
      prefixes: [`${tag}-a-`, `${tag}-b-`],
      apply: true,
      reportDir: REPORT_DIR,
    });

    expect(result.failed).toBe(false);
    expect(result.summary.deleted).toBe(2);
    const aAfter = await prisma.company.findUnique({ where: { id: coA.id } });
    const bAfter = await prisma.company.findUnique({ where: { id: coB.id } });
    expect(aAfter).toBeNull();
    expect(bAfter).toBeNull();
  });
});
