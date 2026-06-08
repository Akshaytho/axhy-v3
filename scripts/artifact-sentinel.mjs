#!/usr/bin/env node
/**
 * Artifact sentinel — corrals stray, non-code artifacts into ONE external
 * folder so the repo stops accreting random .md / screenshots / scratch docs
 * in untracked places.
 *
 * Runs at post-commit. For files ADDED in HEAD that are relocatable artifact
 * types AND not in the protected allowlist, it MOVES them to
 * $AXHY_ARTIFACTS_DIR (default: <repo>/../axhy-artifacts) and stages their
 * removal from the repo (git rm --cached). Stray *scripts* are WARNED, never
 * auto-moved — moving code-like files can break a runtime.
 *
 * Protected (NEVER moved) — build / brain / contract critical:
 *   src/, test(s)/, *.test.*, *.spec.*, prisma/, scripts/, .husky/, .claude/,
 *   .github/, .vscode/, node_modules/, dist/, .turbo/, build/, coverage/,
 *   docs/ (brain + spec source — the graph/brain build ingests it),
 *   REBUILD/ (design hub), handoff/ (boot contract), README.md, CLAUDE.md,
 *   and config files (package.json, tsconfig*, *.toml, *.lock, *.ya?ml,
 *   .env*, app.json, eas.json, migration.sql, migration_lock.toml).
 *
 * Flags:
 *   --dry-run     report what WOULD move/warn; touch nothing
 *   --self-test   classify a built-in list of representative paths and exit
 *
 * @derives(founder directive 2026-06-07 — single external artifacts folder)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve, relative, extname } from 'node:path';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const ARTIFACTS_DIR = process.env.AXHY_ARTIFACTS_DIR || resolve(REPO_ROOT, '..', 'axhy-artifacts');
const DRY_RUN = process.argv.includes('--dry-run');
const SELF_TEST = process.argv.includes('--self-test');

const MOVE_EXT = new Set(['.md', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx']);
const SCRIPT_EXT = new Set(['.sh', '.mjs', '.js', '.ts', '.tsx', '.py', '.rb']);

const PROTECTED_SEGMENTS = [
  '/src/', '/test/', '/tests/', '/prisma/', '/.husky/', '/.claude/', '/.github/',
  '/.vscode/', '/node_modules/', '/dist/', '/.turbo/', '/build/', '/coverage/',
];
const PROTECTED_PREFIXES = [
  'src/', 'test/', 'tests/', 'scripts/', 'prisma/', '.husky/', '.claude/', '.github/',
  '.vscode/', 'docs/', 'REBUILD/', 'handoff/', 'node_modules/', 'dist/',
];
const PROTECTED_BASENAMES = new Set([
  'README.md', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'package.json',
  'pnpm-workspace.yaml', 'migration.sql', 'migration_lock.toml', 'app.json', 'eas.json',
]);
const PROTECTED_BASENAME_RE = [/^tsconfig.*\.json$/, /\.lock$/, /\.lockb$/, /\.toml$/, /\.ya?ml$/, /^\.env/];

function isProtected(rel) {
  const b = basename(rel);
  if (PROTECTED_BASENAMES.has(b)) return true;
  if (PROTECTED_BASENAME_RE.some((re) => re.test(b))) return true;
  if (rel.includes('.test.') || rel.includes('.spec.')) return true;
  if (PROTECTED_PREFIXES.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) return true;
  if (PROTECTED_SEGMENTS.some((s) => ('/' + rel).includes(s))) return true;
  return false;
}

function category(ext) {
  if (ext === '.md') return 'docs';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'screenshots';
  if (['.pdf', '.doc', '.docx'].includes(ext)) return 'word-docs';
  return 'reports';
}

/** PROTECT | MOVE | WARN | ignore */
function classify(rel) {
  const ext = extname(rel).toLowerCase();
  if (isProtected(rel)) return 'PROTECT';
  if (MOVE_EXT.has(ext)) return 'MOVE';
  if (SCRIPT_EXT.has(ext)) return 'WARN';
  return 'ignore';
}

if (SELF_TEST) {
  const samples = [
    'packages/shared-schema/prisma/migrations/20260607_x/migration.sql',
    'handoff/NEXT_SESSION.md',
    'docs/specs/2026-05-12-hr-updates-spec.md',
    'docs/locked/security-gaps-to-fix.md',
    'CLAUDE.md',
    'README.md',
    'scripts/run-migrations.mjs',
    'apps/backend/src/routes/leave-requests.ts',
    'apps/backend/test/leave-decision.test.ts',
    'REBUILD/plan.md',
    'apps/admin-web/screenshot-playwright.ts',
    'apps/backend/AUDIT_NOTES.md',
    'ANALYSIS.md',
    'apps/admin-web/shot.png',
    'reports/Q3.pdf',
  ];
  console.log('[artifact-sentinel --self-test] classification (PROTECT=stays, MOVE=relocated, WARN=flagged):');
  for (const s of samples) console.log(`  ${classify(s).padEnd(8)} ${s}`);
  process.exit(0);
}

function addedFilesInHead() {
  try {
    const out = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t'))
      .filter(([status]) => status.startsWith('A'))
      .map((parts) => parts[parts.length - 1]);
  } catch {
    return [];
  }
}

const moved = [];
const warned = [];
for (const rel of addedFilesInHead()) {
  const verdict = classify(rel);
  if (verdict === 'MOVE') {
    const dest = join(ARTIFACTS_DIR, category(extname(rel).toLowerCase()), rel);
    moved.push({ rel, dest });
    if (!DRY_RUN) {
      try {
        mkdirSync(dirname(dest), { recursive: true });
        if (existsSync(join(REPO_ROOT, rel))) renameSync(join(REPO_ROOT, rel), dest);
        execFileSync('git', ['rm', '--cached', '--', rel], { cwd: REPO_ROOT, stdio: 'ignore' });
      } catch (err) {
        console.log(`[artifact-sentinel] could not relocate ${rel}: ${err.message}`);
      }
    }
  } else if (verdict === 'WARN') {
    warned.push(rel);
  }
}

if (moved.length) {
  console.log(
    `[artifact-sentinel] ${DRY_RUN ? 'WOULD RELOCATE' : 'RELOCATED'} ${moved.length} stray artifact(s) → ${ARTIFACTS_DIR}:`,
  );
  for (const m of moved) console.log(`  • ${m.rel}  →  ${relative(resolve(REPO_ROOT, '..'), m.dest)}`);
  if (!DRY_RUN) {
    console.log('[artifact-sentinel] Staged their removal from the repo — they live in axhy-artifacts/ now. Commit to record.');
  }
}
if (warned.length) {
  console.log(`[artifact-sentinel] ${warned.length} stray SCRIPT(s) NOT auto-moved (review — moving code can break a runtime):`);
  for (const w of warned) console.log(`  ⚠ ${w}`);
}
if (!moved.length && !warned.length) {
  console.log('[artifact-sentinel] clean — no stray artifacts added in HEAD.');
}
