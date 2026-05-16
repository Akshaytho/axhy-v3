/**
 * tools/connectedness/src/check.ts
 *
 * Idx-4 — `pnpm connectedness:check` CI guard.
 *
 * Runs the 6 MVP rules:
 *   CI-1  Manifest validity on live: entries
 *   CI-2  Touched-entity ownership (git-diff scoped)
 *   CI-3  Generated freshness
 *   CI-4  No dual ownership
 *   CI-5  Provisional ownership trigger (Outbox)
 *   CI-6  Planned-arrival promotion
 *
 * Exit code 0 = all checks pass. Non-zero = at least one failure.
 * Git-dependent rules (CI-2, CI-3, CI-5) skip gracefully when no git context is available.
 *
 * Usage:
 *   pnpm connectedness:check                 # full local check
 *   pnpm connectedness:check --base=main     # CI mode (git diff against main)
 *   pnpm connectedness:check --skip-git      # local mode, no git rules
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYAML } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

type Failure = {
  rule: string;
  severity: 'error' | 'warn';
  message: string;
};

type CheckOutcome = {
  rule: string;
  failures: Failure[];
  skipped?: string;
};

type ManifestRouteSplit = { live: string[]; planned: string[] };

type RawManifest = {
  feature: string;
  status: string;
  owns?: {
    tables?: string[];
    state_machines?: ManifestRouteSplit | string[];
  };
  provisional_owns?: {
    tables?: Array<{
      name: string;
      reason?: string;
      rightful_owner?: string;
      migrate_when?: string;
    }>;
  };
  routes?: ManifestRouteSplit | string[];
  ui?: {
    surfaces?: string[];
    prototypes?: string[];
  };
  packages?: string[];
  specs?: string[];
  tests?: ManifestRouteSplit | string[];
  affects?: string[];
  external_references?: Array<{ name: string; why: string; iteration: number }>;
  sourcePath: string;
};

type NodeRecord = {
  kind: string;
  name: string;
  sourcePath: string | null;
  metadata: Record<string, unknown>;
};

type NodesFile = { generatedAt: string; nodes: NodeRecord[] };

const args = process.argv.slice(2);
const baseRef = parseFlag(args, '--base');
const skipGit = args.includes('--skip-git');

async function main(): Promise<void> {
  const manifests = loadManifests();
  const nodes = loadNodes();

  const outcomes: CheckOutcome[] = [];
  outcomes.push(runManifestValidity(manifests, nodes));
  outcomes.push(runTouchedEntityOwnership(manifests));
  outcomes.push(runGeneratedFreshness());
  outcomes.push(runNoDualOwnership(manifests));
  outcomes.push(runProvisionalOwnershipTrigger(manifests));
  outcomes.push(runPlannedArrivalPromotion(manifests));

  let totalErrors = 0;
  for (const o of outcomes) {
    if (o.skipped) {
      console.log(`◌ ${o.rule} — SKIPPED (${o.skipped})`);
      continue;
    }
    const errs = o.failures.filter((f) => f.severity === 'error');
    const warns = o.failures.filter((f) => f.severity === 'warn');
    const status = errs.length === 0 ? (warns.length === 0 ? '✓ PASS' : '⚠ WARN') : '✗ FAIL';
    console.log(`${status} ${o.rule}`);
    for (const f of o.failures) {
      const prefix = f.severity === 'error' ? '    error:' : '    warn :';
      console.log(`${prefix} ${f.message}`);
    }
    totalErrors += errs.length;
  }

  console.log('');
  console.log(`Total errors: ${totalErrors}`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

function parseFlag(argv: string[], name: string): string | null {
  for (const a of argv) {
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return null;
}

// ── Loaders ────────────────────────────────────────────────────────────────

function loadManifests(): RawManifest[] {
  const dir = join(REPO_ROOT, 'connectedness/features');
  const manifests: RawManifest[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.yml')) continue;
    const sourcePath = `connectedness/features/${entry}`;
    const raw = readFileSync(join(dir, entry), 'utf8');
    const m = parseYAML(raw) as RawManifest;
    m.sourcePath = sourcePath;
    manifests.push(m);
  }
  return manifests;
}

function loadNodes(): NodeRecord[] {
  const path = join(REPO_ROOT, 'connectedness/generated/nodes.json');
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  return (JSON.parse(raw) as NodesFile).nodes;
}

function asSplit(v: ManifestRouteSplit | string[] | undefined): ManifestRouteSplit {
  if (!v) return { live: [], planned: [] };
  if (Array.isArray(v)) return { live: v, planned: [] };
  return { live: v.live ?? [], planned: v.planned ?? [] };
}

// ── CI-1: Manifest validity on live: entries ───────────────────────────────

function runManifestValidity(manifests: RawManifest[], nodes: NodeRecord[]): CheckOutcome {
  const failures: Failure[] = [];
  const apiEndpointNames = new Set(
    nodes.filter((n) => n.kind === 'api_endpoint').map((n) => n.name),
  );

  for (const m of manifests) {
    const ref = m.sourcePath;
    const routes = asSplit(m.routes);
    for (const route of routes.live) {
      if (!apiEndpointNames.has(route)) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: routes.live entry '${route}' has no matching api_endpoint in nodes.json`,
        });
      }
    }

    const sms = asSplit(m.owns?.state_machines);
    for (const sm of sms.live) {
      if (!existsSync(join(REPO_ROOT, sm))) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: owns.state_machines.live entry '${sm}' not found on disk`,
        });
      }
    }

    const tests = asSplit(m.tests);
    for (const testGlob of tests.live) {
      const matched = matchesGlobOrFile(testGlob);
      if (!matched) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: tests.live entry '${testGlob}' matched no files`,
        });
      }
    }

    for (const pkg of m.packages ?? []) {
      if (!existsSync(join(REPO_ROOT, pkg))) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: packages entry '${pkg}' does not exist`,
        });
      }
    }

    for (const spec of m.specs ?? []) {
      if (!existsSync(join(REPO_ROOT, spec))) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: specs entry '${spec}' does not exist`,
        });
      }
    }

    for (const proto of m.ui?.prototypes ?? []) {
      if (!existsSync(join(REPO_ROOT, proto))) {
        failures.push({
          rule: 'CI-1',
          severity: 'error',
          message: `${ref}: ui.prototypes entry '${proto}' does not exist`,
        });
      }
    }
  }

  return { rule: 'CI-1 manifest-validity (live entries)', failures };
}

function matchesGlobOrFile(pattern: string): boolean {
  // Minimal glob support: only `**/*.test.ts` and `<dir>/**/*.test.ts` style.
  // Hand-roll because we don't want a new dependency for one matcher.
  if (!pattern.includes('*')) {
    return existsSync(join(REPO_ROOT, pattern));
  }
  // Strip the glob suffix: everything up to the first `*`.
  const star = pattern.indexOf('*');
  let prefix = pattern.slice(0, star);
  // Remove trailing path separator if present.
  if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
  const absPrefix = join(REPO_ROOT, prefix);
  if (!existsSync(absPrefix)) return false;
  // Walk the prefix dir; if any file's relative path matches the glob ext, count it.
  const suffixRe = patternToRegex(pattern);
  return walkAny(absPrefix, suffixRe);
}

function patternToRegex(pattern: string): RegExp {
  // Convert `connectedness/features/*.yml` -> /^connectedness\/features\/[^/]+\.yml$/
  // and `apps/backend/test/decisions/**/*.test.ts` -> recursive match
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function walkAny(dir: string, suffixRe: RegExp): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = full.replace(REPO_ROOT + '/', '');
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (walkAny(full, suffixRe)) return true;
    } else if (suffixRe.test(rel)) {
      return true;
    }
  }
  return false;
}

// ── CI-2: Touched-entity ownership (git-diff scoped) ────────────────────────

function runTouchedEntityOwnership(manifests: RawManifest[]): CheckOutcome {
  if (skipGit || !baseRef) {
    return {
      rule: 'CI-2 touched-entity-ownership',
      failures: [],
      skipped: skipGit ? '--skip-git flag set' : 'no --base=<ref> given (local mode)',
    };
  }

  let changed: string[];
  try {
    const out = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    changed = out.split('\n').filter(Boolean);
  } catch (err) {
    return {
      rule: 'CI-2 touched-entity-ownership',
      failures: [],
      skipped: `git diff failed: ${(err as Error).message}`,
    };
  }

  const failures: Failure[] = [];
  const claimedRoutes = collectClaimedRoutes(manifests);
  const claimedTables = collectClaimedTables(manifests);

  for (const file of changed) {
    if (file.startsWith('apps/backend/src/routes/') && file.endsWith('.ts')) {
      const fileContent = readFileIfExists(join(REPO_ROOT, file));
      if (!fileContent) continue;
      const routes = parseRoutesFromFile(fileContent);
      for (const r of routes) {
        if (!claimedRoutes.has(r)) {
          failures.push({
            rule: 'CI-2',
            severity: 'error',
            message: `Route '${r}' (declared in ${file}) is not claimed by any manifest's routes.live[] or routes.planned[]`,
          });
        }
      }
    }
    if (file === 'packages/shared-schema/prisma/schema.prisma') {
      const content = readFileIfExists(join(REPO_ROOT, file));
      if (!content) continue;
      const models = parseModelsFromSchema(content);
      for (const model of models) {
        if (!claimedTables.has(model)) {
          failures.push({
            rule: 'CI-2',
            severity: 'error',
            message: `Prisma model '${model}' is in schema.prisma but no manifest claims it (owns.tables or provisional_owns.tables)`,
          });
        }
      }
    }
  }

  return { rule: 'CI-2 touched-entity-ownership', failures };
}

function collectClaimedRoutes(manifests: RawManifest[]): Set<string> {
  const out = new Set<string>();
  for (const m of manifests) {
    const r = asSplit(m.routes);
    for (const x of r.live) out.add(x);
    for (const x of r.planned) out.add(x);
  }
  return out;
}

function collectClaimedTables(manifests: RawManifest[]): Set<string> {
  const out = new Set<string>();
  for (const m of manifests) {
    for (const t of m.owns?.tables ?? []) out.add(t);
    for (const t of m.provisional_owns?.tables ?? []) out.add(t.name);
  }
  return out;
}

function readFileIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseRoutesFromFile(content: string): string[] {
  const out = new Set<string>();
  const re = /\bapp\s*\.\s*([a-z]+)\s*(?:<[^>]*>\s*)?\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const method = (m[1] ?? '').toUpperCase();
    const path = m[2] ?? '';
    if (!path.startsWith('/')) continue;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) continue;
    out.add(`${method} ${path}`);
  }
  return [...out];
}

function parseModelsFromSchema(content: string): string[] {
  const out: string[] = [];
  const re = /^model\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

// ── CI-3: Generated freshness ───────────────────────────────────────────────

function runGeneratedFreshness(): CheckOutcome {
  if (skipGit) {
    return {
      rule: 'CI-3 generated-freshness',
      failures: [],
      skipped: '--skip-git flag set',
    };
  }
  try {
    execSync('git diff --exit-code connectedness/generated/', { cwd: REPO_ROOT });
    return { rule: 'CI-3 generated-freshness', failures: [] };
  } catch {
    return {
      rule: 'CI-3 generated-freshness',
      failures: [
        {
          rule: 'CI-3',
          severity: 'error',
          message:
            'connectedness/generated/ has uncommitted changes — run `pnpm connectedness:build` and commit the result',
        },
      ],
    };
  }
}

// ── CI-4: No dual ownership ─────────────────────────────────────────────────

function runNoDualOwnership(manifests: RawManifest[]): CheckOutcome {
  const failures: Failure[] = [];
  const tableToOwners = new Map<string, string[]>();

  for (const m of manifests) {
    for (const t of m.owns?.tables ?? []) {
      pushMap(tableToOwners, t, m.feature);
    }
    for (const t of m.provisional_owns?.tables ?? []) {
      pushMap(tableToOwners, t.name, `${m.feature} (provisional)`);
    }
  }

  for (const [table, owners] of tableToOwners.entries()) {
    if (owners.length > 1) {
      failures.push({
        rule: 'CI-4',
        severity: 'error',
        message: `Table '${table}' is claimed by ${owners.length} manifests: ${owners.join(', ')}`,
      });
    }
  }

  const routeToOwners = new Map<string, string[]>();
  for (const m of manifests) {
    const r = asSplit(m.routes);
    for (const x of [...r.live, ...r.planned]) {
      pushMap(routeToOwners, x, m.feature);
    }
  }
  for (const [route, owners] of routeToOwners.entries()) {
    if (owners.length > 1) {
      failures.push({
        rule: 'CI-4',
        severity: 'error',
        message: `Route '${route}' is claimed by ${owners.length} manifests: ${owners.join(', ')}`,
      });
    }
  }

  return { rule: 'CI-4 no-dual-ownership', failures };
}

function pushMap(map: Map<string, string[]>, key: string, value: string): void {
  const cur = map.get(key);
  if (cur) cur.push(value);
  else map.set(key, [value]);
}

// ── CI-5: Provisional ownership trigger (Outbox) ────────────────────────────

function runProvisionalOwnershipTrigger(manifests: RawManifest[]): CheckOutcome {
  if (skipGit || !baseRef) {
    return {
      rule: 'CI-5 provisional-ownership-trigger',
      failures: [],
      skipped: skipGit ? '--skip-git flag set' : 'no --base=<ref> given (local mode)',
    };
  }

  let changed: string[];
  try {
    const out = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    changed = out.split('\n').filter(Boolean);
  } catch (err) {
    return {
      rule: 'CI-5 provisional-ownership-trigger',
      failures: [],
      skipped: `git diff failed: ${(err as Error).message}`,
    };
  }

  const failures: Failure[] = [];
  for (const m of manifests) {
    for (const t of m.provisional_owns?.tables ?? []) {
      // Fire only when the PR adds NEW callers of the provisional table outside
      // the holding feature's declared surface. Pre-existing callers are
      // grandfathered (consistent with CI-2/CI-3 touched-only design).
      const newCallers = findExternalCallersInChangedFiles(t.name, m.feature, manifests, changed);
      if (newCallers.length > 0) {
        failures.push({
          rule: 'CI-5',
          severity: 'error',
          message:
            `PR introduces new Outbox-style caller(s) outside '${m.feature}' surface for ` +
            `provisionally-held table '${t.name}'. ` +
            `Rightful owner per manifest: '${t.rightful_owner ?? 'unspecified'}'. ` +
            `Files: ${newCallers.slice(0, 3).join(', ')}${newCallers.length > 3 ? `, +${newCallers.length - 3} more` : ''}. ` +
            `Create '${t.rightful_owner ?? 'new-feature'}.yml' and move ownership of '${t.name}' there per migrate_when condition.`,
        });
      }
    }
  }
  return { rule: 'CI-5 provisional-ownership-trigger', failures };
}

function findExternalCallersInChangedFiles(
  table: string,
  provisionalOwnerFeature: string,
  manifests: RawManifest[],
  changedFiles: string[],
): string[] {
  const tableLower = table.toLowerCase();
  const calleeRe = new RegExp(`\\b(prisma|tx)\\s*\\.\\s*${tableLower}\\s*\\.`, 'i');
  const ownerManifest = manifests.find((m) => m.feature === provisionalOwnerFeature);
  const ownerTestGlobs = ownerManifest ? asSplit(ownerManifest.tests).live : [];

  const hits: string[] = [];
  for (const file of changedFiles) {
    if (!/\.tsx?$/.test(file)) continue;

    // Skip files in the holding feature's declared test surface.
    const inOwnerSurface = ownerTestGlobs.some((g) => {
      const prefix = g.split('*')[0]?.replace(/\/$/, '') ?? '';
      return prefix && file.startsWith(prefix);
    });
    if (inOwnerSurface) continue;

    const content = readFileIfExists(join(REPO_ROOT, file));
    if (!content) continue;
    if (calleeRe.test(content)) hits.push(file);
  }
  return hits;
}

// ── CI-6: Planned-arrival promotion ─────────────────────────────────────────

function runPlannedArrivalPromotion(manifests: RawManifest[]): CheckOutcome {
  const failures: Failure[] = [];
  const apiEndpointNames = new Set(
    loadNodes()
      .filter((n) => n.kind === 'api_endpoint')
      .map((n) => n.name),
  );

  for (const m of manifests) {
    const routes = asSplit(m.routes);
    for (const route of routes.planned) {
      if (apiEndpointNames.has(route)) {
        failures.push({
          rule: 'CI-6',
          severity: 'error',
          message: `${m.sourcePath}: planned route '${route}' is now live (api_endpoint exists). Move from routes.planned to routes.live.`,
        });
      }
    }
    const sms = asSplit(m.owns?.state_machines);
    for (const sm of sms.planned) {
      if (existsSync(join(REPO_ROOT, sm))) {
        failures.push({
          rule: 'CI-6',
          severity: 'error',
          message: `${m.sourcePath}: planned state machine '${sm}' now exists on disk. Move from owns.state_machines.planned to owns.state_machines.live.`,
        });
      }
    }
    const tests = asSplit(m.tests);
    for (const testGlob of tests.planned) {
      if (matchesGlobOrFile(testGlob)) {
        failures.push({
          rule: 'CI-6',
          severity: 'error',
          message: `${m.sourcePath}: planned test '${testGlob}' now matches files on disk. Move from tests.planned to tests.live.`,
        });
      }
    }
  }

  return { rule: 'CI-6 planned-arrival-promotion', failures };
}

main().catch((err) => {
  console.error('[connectedness:check] error:', err);
  process.exit(1);
});
