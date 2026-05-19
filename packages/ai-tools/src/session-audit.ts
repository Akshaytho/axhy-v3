/**
 * Session-Start Audit
 *
 * Runs at the beginning of every Claude Code session (or on-demand).
 * Checks the codebase against locked constitutional docs.
 * No DB needed — pure filesystem checks.
 *
 * Usage:
 *   pnpm --filter @axhy/ai-tools audit
 *
 * Exit code:
 *   0 = clean (all checks pass)
 *   1 = violations found (fix before working)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

type Violation = { check: string; severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW'; detail: string };

const violations: Violation[] = [];

function fail(check: string, severity: Violation['severity'], detail: string) {
  violations.push({ check, severity, detail });
}

function grep(pattern: string, dirs: string[], exts: string[]): string[] {
  const extArgs = exts.map((e) => `--include='*${e}'`).join(' ');
  const dirArgs = dirs.map((d) => join(REPO_ROOT, d)).join(' ');
  try {
    const result = execSync(`grep -rn ${extArgs} '${pattern}' ${dirArgs} 2>/dev/null || true`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line) return false;
        if (line.includes('// audit-ok')) return false;
        return true;
      });
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCKED DOC CHANGE DETECTION — alerts when constitutional docs were amended
// ═══════════════════════════════════════════════════════════════════════════

const HASH_FILE = join(REPO_ROOT, 'docs/locked/.audit-hashes.json');

function hashContent(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

type DocHashes = Record<string, string>;

function loadSavedHashes(): DocHashes {
  if (!existsSync(HASH_FILE)) return {};
  try {
    return JSON.parse(readFileSync(HASH_FILE, 'utf8')) as DocHashes;
  } catch {
    return {};
  }
}

function detectLockedDocChanges(): string[] {
  const lockedDir = join(REPO_ROOT, 'docs/locked');
  if (!existsSync(lockedDir)) return [];

  const saved = loadSavedHashes();
  const current: DocHashes = {};
  const changed: string[] = [];

  const files = readdirSync(lockedDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(join(lockedDir, file), 'utf8');
    const hash = hashContent(content);
    current[file] = hash;

    if (saved[file] && saved[file] !== hash) {
      changed.push(file);
    }
  }

  // Save current hashes for next session
  writeFileSync(HASH_FILE, JSON.stringify(current, null, 2) + '\n');
  return changed;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEARNING SYSTEM — self-extending audit from past mistakes
// ═══════════════════════════════════════════════════════════════════════════

type Learning = {
  file: string;
  brokenRule: string;
  persona: string;
  date: string;
  rootCause: string;
  checkPattern: string | null;
  checkPaths: string | null;
  checkExpect: 'none' | 'exists';
};

function parseFmValue(fm: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm');
  const m = fm.match(re);
  return m ? m[1]!.trim() : '';
}

function loadLearnings(): Learning[] {
  const dir = join(REPO_ROOT, 'docs/learnings');
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const learnings: Learning[] = [];

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1]!;

    const brokenRule = parseFmValue(fm, 'broken_rule');
    if (!brokenRule) continue;

    learnings.push({
      file,
      brokenRule,
      persona: parseFmValue(fm, 'persona') || 'all',
      date: parseFmValue(fm, 'date'),
      rootCause: parseFmValue(fm, 'root_cause') || '',
      checkPattern: parseFmValue(fm, 'check_pattern') || null,
      checkPaths: parseFmValue(fm, 'check_paths') || null,
      checkExpect: (parseFmValue(fm, 'check_expect') as 'none' | 'exists') || 'none',
    });
  }

  return learnings.sort((a, b) => b.date.localeCompare(a.date));
}

function getHotRules(learnings: Learning[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of learnings) {
    const key = l.brokenRule.split('—')[0]!.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function printLearningDigest(learnings: Learning[], hotRules: Map<string, number>) {
  if (learnings.length === 0) {
    console.log('[audit] Phase 0: No learnings yet. Clean slate.\n');
    return;
  }

  console.log(`[audit] Phase 0: ${learnings.length} learning(s) from past sessions`);

  const recent = learnings.slice(0, 5);
  for (const l of recent) {
    console.log(`  ${l.date} [${l.persona}] ${l.brokenRule}`);
  }
  if (learnings.length > 5) {
    console.log(`  ... and ${learnings.length - 5} more in docs/learnings/`);
  }

  const hotSpots = [...hotRules.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (hotSpots.length > 0) {
    console.log('');
    console.log('[audit] HOT SPOTS — rules broken multiple times:');
    for (const [rule, count] of hotSpots) {
      const tag = count >= 3 ? 'CHRONIC — escalated to HIGH' : 'REPEAT';
      console.log(`  [${tag}] ${rule}: broken ${count}x`);
    }
  }

  const withChecks = learnings.filter((l) => l.checkPattern && l.checkPaths);
  console.log(
    `[audit] ${withChecks.length} of ${learnings.length} learnings have active detection patterns`,
  );

  const needsCompaction = learnings.length >= 20 || hotSpots.some(([, c]) => c >= 3);
  if (needsCompaction) {
    console.log(`[audit] COMPACT RECOMMENDED — run: pnpm --filter @axhy/ai-tools brain:compact`);
    console.log(
      `[audit] Merges ${learnings.length} files into ~${hotSpots.length + (learnings.length - hotSpots.reduce((a, [, c]) => a + c, 0))} (keeps all detection patterns)`,
    );
  }
  console.log();
}

function runLearnedChecks(learnings: Learning[], hotRules: Map<string, number>) {
  let ran = 0;

  for (const learning of learnings) {
    if (!learning.checkPattern || !learning.checkPaths) continue;
    ran++;

    const paths = learning.checkPaths.split(',').map((p) => p.trim());
    const hits = grep(learning.checkPattern, paths, ['.ts', '.tsx']);

    // Pattern breadth guard — a pattern matching 20+ raw hits is too broad.
    // It will fire on normal code, cause false positives, and erode trust.
    if (hits.length > 20) {
      console.log(
        `[audit] WARNING: Learning ${learning.file} pattern is too broad (${hits.length} hits).`,
      );
      console.log(`[audit]   Pattern: ${learning.checkPattern}`);
      console.log(`[audit]   Narrow the check_pattern or add // audit-ok to known-good lines.`);
      continue;
    }

    const filtered = hits.filter((h) => {
      if (h.includes('node_modules') || h.includes('/dist/') || h.includes('.next/')) return false;
      if (h.includes('.test.') || h.includes('.spec.') || h.includes('/test/')) return false;
      if (h.includes('/scripts/') || h.includes('session-audit.ts')) return false;
      if (h.includes('// learned-ok')) return false;
      const colonIdx = h.indexOf(':', h.indexOf(':') + 1);
      const linePart = colonIdx > 0 ? h.slice(colonIdx + 1).trim() : '';
      if (linePart.startsWith('//') || linePart.startsWith('*') || linePart.startsWith('/*'))
        return false;
      return true;
    });

    const ruleKey = learning.brokenRule.split('—')[0]!.trim();
    const ruleBreakCount = hotRules.get(ruleKey) || 0;
    const isChronicHotSpot = ruleBreakCount >= 3;

    if (learning.checkExpect === 'none') {
      for (const hit of filtered) {
        // Learned checks cap at HIGH. Only hardcoded invariants (Policy,
        // AuditEvent) can be BLOCKER — a bad learning pattern must never
        // permanently block all commits.
        const severity = isChronicHotSpot ? 'HIGH' : 'MEDIUM';
        const tag = isChronicHotSpot ? ' [CHRONIC]' : '';
        fail(
          `learned:${learning.file}`,
          severity,
          `[${learning.brokenRule}]${tag} ${hit.replace(REPO_ROOT + '/', '')}`,
        );
      }
    } else if (learning.checkExpect === 'exists' && filtered.length === 0) {
      const severity = isChronicHotSpot ? 'HIGH' : 'MEDIUM';
      const tag = isChronicHotSpot ? ' [CHRONIC]' : '';
      fail(
        `learned:${learning.file}`,
        severity,
        `[${learning.brokenRule}]${tag} Expected pattern '${learning.checkPattern}' not found in ${learning.checkPaths}`,
      );
    }
  }

  return ran;
}

// ─── CHECK 1: Locked docs exist ────────────────────────────────────────────

function checkLockedDocsExist() {
  const expected = [
    'docs/locked/chat-behavior-rules.md',
    'docs/locked/chat-sidebar-context-flow.md',
    'docs/locked/rule-hierarchy-three-layers.md',
    'docs/locked/livingdoc-extraction-rules.md',
    'docs/locked/chat-abuse-prevention.md',
    'docs/locked/chat-tools-and-decisions.md',
    'docs/locked/chat-error-scenarios.md',
    'docs/locked/development-code-standards.md',
    'docs/locked/development-anti-cheating.md',
    'docs/locked/security-gaps-to-fix.md',
    'docs/locked/operational-invariants.md',
    'docs/locked/verification-checklists.md',
    'docs/locked/ai-fact-verification.md',
  ];

  for (const doc of expected) {
    const fullPath = join(REPO_ROOT, doc);
    if (!existsSync(fullPath)) {
      fail('locked-docs', 'BLOCKER', `Missing locked doc: ${doc}`);
      continue;
    }
    const content = readFileSync(fullPath, 'utf8');
    if (!content.includes('Status: LOCKED')) {
      fail('locked-docs', 'BLOCKER', `Locked doc missing LOCKED status: ${doc}`);
    }
  }
}

// eslint-disable-next-line no-warning-comments -- check name, not a real todo
// ─── CHECK 2: No TODO/FIXME/HACK in committed code ────────────────────────

function checkNoTodos() {
  const hits = grep('TODO\\|FIXME\\|HACK\\|XXX', ['apps', 'packages'], ['.ts', '.tsx']);
  for (const hit of hits) {
    if (hit.includes('node_modules') || hit.includes('/dist/') || hit.includes('.next/')) continue;
    if (hit.includes('session-audit.ts') || hit.includes('brain-builder.ts')) continue;
    if (hit.includes('.test.') || hit.includes('.spec.') || hit.includes('/test/')) continue;
    if (hit.includes('fixture') || hit.includes('eslint-config')) continue;
    if (hit.includes('/scripts/')) continue;
    if (hit.includes('knowledge-graph/src/audit.ts')) continue; // contains ADR-NNNN placeholder
    fail('no-todos', 'HIGH', hit.replace(REPO_ROOT + '/', ''));
  }
}

// ─── CHECK 3: No `any` types ──────────────────────────────────────────────

function checkNoAny() {
  const hits = grep(': any[^_]\\|: any$\\|as any', ['apps', 'packages'], ['.ts', '.tsx']);
  for (const hit of hits) {
    if (hit.includes('node_modules') || hit.includes('/dist/') || hit.includes('/generated/'))
      continue;
    if (hit.includes('.next/')) continue; // Next.js generated types
    if (hit.includes('.d.ts')) continue;
    if (hit.includes('session-audit.ts')) continue;
    if (hit.includes('.test.') || hit.includes('.spec.') || hit.includes('/test/')) continue;
    if (hit.includes('fixture') || hit.includes('eslint-config')) continue;
    if (hit.includes('/scripts/')) continue;
    // Skip comment lines — "any" as a word in comments, not as a type
    const colonIdx = hit.indexOf(':', hit.indexOf(':') + 1);
    const codePart = colonIdx > 0 ? hit.slice(colonIdx + 1).trim() : '';
    if (codePart.startsWith('//') || codePart.startsWith('*') || codePart.startsWith('/*'))
      continue;
    fail('no-any', 'HIGH', hit.replace(REPO_ROOT + '/', ''));
  }
}

// ─── CHECK 4: No empty catch blocks ───────────────────────────────────────

function checkNoEmptyCatch() {
  const hits = grep(
    'catch.*{[[:space:]]*}\\|\\.catch(() => {})\\|\\.catch(()=>{})\\|\\.catch(() => { })',
    ['apps', 'packages'],
    ['.ts', '.tsx'],
  );
  for (const hit of hits) {
    if (hit.includes('node_modules') || hit.includes('/dist/') || hit.includes('.next/')) continue;
    if (hit.includes('.test.') || hit.includes('.spec.') || hit.includes('/test/')) continue;
    if (hit.includes('/scripts/')) continue;
    if (hit.includes('session-audit.ts')) continue;
    fail('no-empty-catch', 'HIGH', hit.replace(REPO_ROOT + '/', ''));
  }
}

// ─── CHECK 5: Protocol file exists ────────────────────────────────────────

function checkProtocolExists() {
  const protocol = join(REPO_ROOT, 'docs/protocols/self-reasoning.md');
  if (!existsSync(protocol)) {
    fail(
      'protocol',
      'BLOCKER',
      'Missing self-reasoning protocol: docs/protocols/self-reasoning.md',
    );
  }
}

// ─── CHECK 6: Panel reference exists ──────────────────────────────────────

function checkPanelExists() {
  const panel = join(REPO_ROOT, 'docs/reference/panel-members.md');
  if (!existsSync(panel)) {
    fail('panel', 'MEDIUM', 'Missing panel reference: docs/reference/panel-members.md');
  }
}

// ─── CHECK 7: Schema.prisma exists and has key models ─────────────────────

function checkSchemaIntegrity() {
  const schemaPath = join(REPO_ROOT, 'packages/shared-schema/prisma/schema.prisma');
  if (!existsSync(schemaPath)) {
    fail('schema', 'BLOCKER', 'Missing schema.prisma');
    return;
  }
  const schema = readFileSync(schemaPath, 'utf8');

  const requiredModels = [
    'Company',
    'User',
    'ChatThread',
    'ChatMessage',
    'SupervisorDecision',
    'LivingDoc',
    'Policy',
    'AuditEvent',
  ];
  for (const model of requiredModels) {
    if (!schema.includes(`model ${model}`)) {
      fail('schema', 'HIGH', `schema.prisma missing required model: ${model}`);
    }
  }
}

// ─── CHECK 8: State machine files exist ───────────────────────────────────

function checkStateMachines() {
  const smDir = join(REPO_ROOT, 'packages/state-machines');
  if (!existsSync(smDir)) {
    fail('state-machines', 'MEDIUM', 'Missing packages/state-machines/ directory');
    return;
  }
  const srcDir = join(smDir, 'src');
  if (!existsSync(srcDir)) return;

  const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
  if (files.length === 0) {
    fail(
      'state-machines',
      'MEDIUM',
      'No state machine definitions found in packages/state-machines/src/',
    );
  }
}

// ─── CHECK 9: Routes have requireAuth ─────────────────────────────────────

function checkRouteAuth() {
  const routeDir = join(REPO_ROOT, 'apps/backend/src/routes');
  if (!existsSync(routeDir)) return; // backend not built yet

  function walkRoutes(dir: string): string[] {
    const out: string[] = [];
    try {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walkRoutes(p));
        else if (name.endsWith('.ts') && !name.includes('.test.')) out.push(p);
      }
    } catch {
      /* skip unreadable */
    }
    return out;
  }

  const routeFiles = walkRoutes(routeDir);
  for (const file of routeFiles) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    if (rel.includes('_test') || rel.includes('health')) continue;

    if (content.includes('app.') || content.includes('router.')) {
      if (
        !content.includes('requireAuth') &&
        !content.includes('publicRoute') &&
        !content.includes('// auth-exempt')
      ) {
        // auth.ts is intentionally public (login/OTP routes)
        if (!rel.includes('auth.ts') && !rel.includes('health')) {
          fail('route-auth', 'HIGH', `Route file missing requireAuth: ${rel}`);
        }
      }
    }
  }
}

// ─── CHECK 10: No raw prisma outside transactions ─────────────────────────

function checkTenantIsolation() {
  const hits = grep(
    'prisma\\.[a-z]*\\.create\\|prisma\\.[a-z]*\\.update\\|prisma\\.[a-z]*\\.delete',
    ['apps/backend'],
    ['.ts'],
  );
  for (const hit of hits) {
    if (hit.includes('node_modules') || hit.includes('/dist/')) continue;
    if (
      hit.includes('.test.') ||
      hit.includes('.spec.') ||
      hit.includes('/test/') ||
      hit.includes('seed') ||
      hit.includes('/scripts/')
    )
      continue;
    if (hit.includes('withTenantContext') || hit.includes('// raw-ok')) continue;
    fail(
      'tenant-isolation',
      'MEDIUM',
      `Possible raw prisma outside transaction: ${hit.replace(REPO_ROOT + '/', '')}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE CHECKS — each tied to a specific rule in a specific locked doc
// ═══════════════════════════════════════════════════════════════════════════

// ─── chat-behavior-rules.md ───────────────────────────────────────────────

function checkChatBehaviorRules() {
  const chatDir = join(REPO_ROOT, 'apps/backend/src/routes');
  if (!existsSync(chatDir)) return;

  // Rule 6: NEVER STREAM DECISIONS — no WebSocket/SSE in chat routes
  const streamHits = grep(
    'WebSocket\\|Server-Sent\\|EventSource\\|text/event-stream\\|ws://\\|wss://\\|socket\\.io',
    ['apps/backend/src'],
    ['.ts'],
  );
  for (const hit of streamHits) {
    if (hit.includes('node_modules') || hit.includes('/dist/') || hit.includes('.test.')) continue;
    if (hit.includes('// stream-ok')) continue;
    // Skip lines where the match is inside a comment
    const colonIdx2 = hit.indexOf(':', hit.indexOf(':') + 1);
    const linePart = colonIdx2 > 0 ? hit.slice(colonIdx2 + 1).trim() : '';
    if (linePart.startsWith('//') || linePart.startsWith('*') || linePart.startsWith('/*'))
      continue;
    fail(
      'chat-rule-6-no-streaming',
      'HIGH',
      `[chat-behavior-rules.md Rule 6] Streaming found: ${hit.replace(REPO_ROOT + '/', '')}`,
    );
  }

  // Rule 5: RESPECT THE BUDGET — assertWithinBudget must exist before AI calls
  const aiCallFiles = grep(
    'callModel\\|openai\\.chat\\|anthropic\\.messages',
    ['apps/backend/src'],
    ['.ts'],
  );
  for (const hit of aiCallFiles) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/test/')) continue;
    const filePath = hit.split(':')[0]!;
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    if (!content.includes('assertWithinBudget') && !content.includes('// budget-exempt')) {
      const rel = relative(REPO_ROOT, filePath);
      fail(
        'chat-rule-5-budget',
        'HIGH',
        `[chat-behavior-rules.md Rule 5] AI call without assertWithinBudget: ${rel}`,
      );
    }
  }

  // Rule 10: IDEMPOTENCY — chat routes must check Idempotency-Key
  const chatRouteFile = join(REPO_ROOT, 'apps/backend/src/routes/chat.ts');
  if (existsSync(chatRouteFile)) {
    const content = readFileSync(chatRouteFile, 'utf8');
    if (!content.includes('idempotency') && !content.includes('Idempotency')) {
      fail(
        'chat-rule-10-idempotency',
        'HIGH',
        '[chat-behavior-rules.md Rule 10] Chat route missing Idempotency-Key enforcement',
      );
    }
  }
}

// ─── chat-tools-and-decisions.md ──────────────────────────────────────────

function checkDecisionFlow() {
  // Decisions must be PROPOSED state — no direct APPLIED creation
  const directApplied = grep(
    'status.*[\'"]APPLIED[\'"].*create\\|create.*status.*[\'"]APPLIED[\'"]',
    ['apps/backend/src'],
    ['.ts'],
  );
  for (const hit of directApplied) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/test/')) continue;
    if (hit.includes('// apply-ok') || hit.includes('complaint')) continue; // complaints are fire-and-display
    fail(
      'decisions-proposed-only',
      'HIGH',
      `[chat-tools-and-decisions.md] Decision created as APPLIED (must be PROPOSED): ${hit.replace(REPO_ROOT + '/', '')}`,
    );
  }
}

// ─── development-code-standards.md ────────────────────────────────────────

function checkRouteLayerCompleteness() {
  const routeDir = join(REPO_ROOT, 'apps/backend/src/routes');
  if (!existsSync(routeDir)) return;

  function walkFiles(dir: string): string[] {
    const out: string[] = [];
    try {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walkFiles(p));
        else if (name.endsWith('.ts') && !name.includes('.test.')) out.push(p);
      }
    } catch {
      /* skip */
    }
    return out;
  }

  const routeFiles = walkFiles(routeDir);
  for (const file of routeFiles) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    if (rel.includes('auth.ts') || rel.includes('health') || rel.includes('_test')) continue;
    if (!content.includes('app.') && !content.includes('router.')) continue;

    // Standard 1: every route needs requireAuth + withTenantContext + Zod validation
    const hasAuth = content.includes('requireAuth') || content.includes('// auth-exempt');
    const hasTenant = content.includes('withTenantContext') || content.includes('// tenant-exempt');
    const hasZod =
      content.includes('.parse(') || content.includes('.safeParse(') || content.includes('z.');

    if (!hasAuth) {
      fail(
        'route-layers',
        'HIGH',
        `[development-code-standards.md D5] Missing requireAuth: ${rel}`,
      );
    }
    if (!hasTenant) {
      fail(
        'route-layers',
        'MEDIUM',
        `[development-code-standards.md D5] Missing withTenantContext: ${rel}`,
      );
    }
    if (!hasZod && content.includes('req.body')) {
      fail(
        'route-layers',
        'MEDIUM',
        `[development-code-standards.md Std 4] Route reads req.body without Zod: ${rel}`,
      );
    }
  }
}

// ─── operational-invariants.md ────────────────────────────────────────────

function checkOperationalInvariants() {
  // Invariant 5: incrementSpend must use raw SQL atomic increment, not read-modify-write
  const spendFiles = grep('incrementSpend\\|aiSpendDailyInr', ['apps/backend/src'], ['.ts']);
  const checkedSpendFiles = new Set<string>();
  for (const hit of spendFiles) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/test/')) continue;
    const filePath = hit.split(':')[0]!;
    if (checkedSpendFiles.has(filePath)) continue;
    checkedSpendFiles.add(filePath);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    if (
      content.includes('aiSpendDailyInr') &&
      (content.includes('.findUnique') || content.includes('.findFirst')) &&
      content.includes('.update') &&
      !content.includes('$executeRaw') &&
      !content.includes('$queryRaw')
    ) {
      fail(
        'invariant-5-atomic-spend',
        'HIGH',
        `[operational-invariants.md Inv 5] Read-modify-write on aiSpendDailyInr (must be atomic SQL): ${relative(REPO_ROOT, filePath)}`,
      );
    }
  }

  // Invariant 8: Policy must be append-only — no UPDATE/DELETE on Policy model
  const policyMutations = grep(
    'prisma\\.policy\\.update\\|prisma\\.policy\\.delete\\|prisma\\.policy\\.upsert',
    ['apps/backend/src'],
    ['.ts'],
  );
  for (const hit of policyMutations) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/test/')) continue;
    fail(
      'invariant-8-policy-append-only',
      'BLOCKER',
      `[operational-invariants.md Inv 8] Policy UPDATE/DELETE found (must be append-only): ${hit.replace(REPO_ROOT + '/', '')}`,
    );
  }

  // Invariant 9: AuditEvent must be append-only — no UPDATE/DELETE
  const auditMutations = grep(
    'prisma\\.auditEvent\\.update\\|prisma\\.auditEvent\\.delete',
    ['apps/backend/src'],
    ['.ts'],
  );
  for (const hit of auditMutations) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/test/')) continue;
    fail(
      'invariant-9-audit-immutable',
      'BLOCKER',
      `[operational-invariants.md Inv 9] AuditEvent UPDATE/DELETE found (must be immutable): ${hit.replace(REPO_ROOT + '/', '')}`,
    );
  }
}

// ─── security-gaps-to-fix.md ──────────────────────────────────────────────

function checkSecurityGaps() {
  // Gap 1: Company.status must be checked in requireAuth or middleware
  const authMiddleware = join(REPO_ROOT, 'apps/backend/src/middleware');
  if (existsSync(authMiddleware)) {
    const authFiles = readdirSync(authMiddleware).filter((f) => f.endsWith('.ts'));
    let foundStatusCheck = false;
    for (const f of authFiles) {
      const content = readFileSync(join(authMiddleware, f), 'utf8');
      if (
        content.includes('Company') &&
        (content.includes('status') || content.includes('ACTIVE') || content.includes('SUSPENDED'))
      ) {
        foundStatusCheck = true;
      }
    }
    if (!foundStatusCheck) {
      fail(
        'gap-1-company-status',
        'HIGH',
        '[security-gaps-to-fix.md Gap 1] Middleware does not check Company.status = ACTIVE',
      );
    }
  }

  // Gap 3: Rule text must be delimited in prompt composition
  const promptFiles = grep(
    'company_rules\\|hr_rules\\|supervisor_rules',
    ['apps/backend/src'],
    ['.ts'],
  );
  if (promptFiles.length === 0) {
    // Prompt composition not built yet — not a violation, just note
  } else {
    let hasDelimiters = false;
    for (const hit of promptFiles) {
      if (
        hit.includes('<company_rules>') ||
        hit.includes('company_rules') ||
        hit.includes('delimiter')
      ) {
        hasDelimiters = true;
      }
    }
    if (!hasDelimiters) {
      fail(
        'gap-3-prompt-injection',
        'HIGH',
        '[security-gaps-to-fix.md Gap 3] Prompt composition may lack rule text delimiters',
      );
    }
  }

  // Gap 10: ruleText must have max length in Zod schema
  const ruleZodFiles = grep('ruleText', ['apps/backend/src', 'packages'], ['.ts']);
  const checkedRuleFiles = new Set<string>();
  for (const hit of ruleZodFiles) {
    if (hit.includes('node_modules') || hit.includes('.test.') || hit.includes('/dist/')) continue;
    const filePath = hit.split(':')[0]!;
    if (checkedRuleFiles.has(filePath)) continue;
    checkedRuleFiles.add(filePath);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    const definesRuleTextSchema = /ruleText:\s*z\.string\(\)/.test(content);
    if (definesRuleTextSchema && !content.includes('.max(')) {
      fail(
        'gap-10-rule-max-length',
        'MEDIUM',
        `[security-gaps-to-fix.md Gap 10] ruleText Zod schema missing .max() bound: ${relative(REPO_ROOT, filePath)}`,
      );
    }
  }
}

// ─── rule-hierarchy-three-layers.md ───────────────────────────────────────

function checkRuleHierarchy() {
  // Key-namespace ACL: check if Policy write routes enforce role-to-prefix mapping
  const policyRouteFile = join(REPO_ROOT, 'apps/backend/src/routes/policy.ts');
  if (existsSync(policyRouteFile)) {
    const content = readFileSync(policyRouteFile, 'utf8');
    if (
      !content.includes('ai.rules.company') &&
      !content.includes('namespace') &&
      !content.includes('prefix')
    ) {
      fail(
        'rule-hierarchy-acl',
        'HIGH',
        '[rule-hierarchy-three-layers.md] Policy route missing key-namespace ACL enforcement',
      );
    }
  }
}

// ─── chat-abuse-prevention.md ─────────────────────────────────────────────

function checkAbusePrevention() {
  // Per-supervisor message rate limit must exist
  const chatRoute = join(REPO_ROOT, 'apps/backend/src/routes/chat.ts');
  if (existsSync(chatRoute)) {
    const content = readFileSync(chatRoute, 'utf8');
    if (
      !content.includes('rateLimit') &&
      !content.includes('messageCount') &&
      !content.includes('messages_per_supervisor')
    ) {
      fail(
        'abuse-rate-limit',
        'MEDIUM',
        '[chat-abuse-prevention.md] Chat route missing per-supervisor message rate limit',
      );
    }
  }

  // Concurrent semaphore (50 limit)
  if (existsSync(chatRoute)) {
    const content = readFileSync(chatRoute, 'utf8');
    if (
      !content.includes('semaphore') &&
      !content.includes('concurrent') &&
      !content.includes('CONCURRENT')
    ) {
      fail(
        'abuse-concurrent-limit',
        'MEDIUM',
        '[chat-abuse-prevention.md] Chat route missing 50-concurrent semaphore',
      );
    }
  }
}

// ─── Run all checks ────────────────────────────────────────────────────────

// Emergency override — production hotfix escape hatch.
// Logged, not silent. Use ONLY when audit blocks a critical fix.
if (process.env.AXHY_AUDIT_EMERGENCY === '1') {
  console.log('[audit] EMERGENCY OVERRIDE — audit skipped.');
  console.log('[audit] Set by: AXHY_AUDIT_EMERGENCY=1');
  console.log('[audit] This bypass is logged. Fix the underlying issue ASAP.');
  console.log('[audit] Do NOT use this to avoid fixing real violations.\n');
  process.exit(0);
}

console.log('[audit] Starting session audit...\n');

// Locked doc change detection — alerts when constitutional docs were amended
const changedDocs = detectLockedDocChanges();
if (changedDocs.length > 0) {
  console.log('[audit] LOCKED DOCS CHANGED since last audit:');
  for (const doc of changedDocs) {
    console.log(`  AMENDED: ${doc} — re-verify code against updated rules`);
  }
  console.log('[audit] Run impactCheck on changed docs to find code that needs updating.\n');
}

// Phase 0: Learning Digest — surface past learnings + hot spots
const learnings = loadLearnings();
const hotRules = getHotRules(learnings);
printLearningDigest(learnings, hotRules);

// Phase 1: structural checks (files exist, patterns absent)
console.log('[audit] Phase 1: Structural checks...');
checkLockedDocsExist();
checkProtocolExists();
checkPanelExists();
checkSchemaIntegrity();
checkStateMachines();
checkNoTodos();
checkNoAny();
checkNoEmptyCatch();
checkRouteAuth();
checkTenantIsolation();

// Phase 2: compliance checks (locked doc rules vs actual code)
console.log('[audit] Phase 2: Compliance checks...');
checkChatBehaviorRules();
checkDecisionFlow();
checkRouteLayerCompleteness();
checkOperationalInvariants();
checkSecurityGaps();
checkRuleHierarchy();
checkAbusePrevention();

// Phase 3: Learned checks — auto-growing from docs/learnings/
const learnedCheckCount = runLearnedChecks(learnings, hotRules);
if (learnedCheckCount > 0) {
  console.log(`[audit] Phase 3: Ran ${learnedCheckCount} learned check(s)`);
} else {
  console.log('[audit] Phase 3: No learned checks yet (add check_pattern to learnings)');
}

// Phase 4: Anti-gaming integrity checks — detect Claude cheating the audit
console.log('[audit] Phase 4: Integrity checks...');

// 4a: Skip comment budget — if there are too many // audit-ok comments,
// Claude is spraying skips instead of fixing code. The escape hatch is
// meant for rare false positives, not wholesale bypass.
const SKIP_PATTERNS = [
  '// audit-ok',
  '// raw-ok',
  '// stream-ok',
  '// budget-exempt',
  '// learned-ok',
  '// auth-exempt',
  '// tenant-exempt',
  '// apply-ok',
];
let totalSkips = 0;
for (const pat of SKIP_PATTERNS) {
  const skipHits = grep(pat.replace('// ', '//\\s*'), ['apps', 'packages'], ['.ts', '.tsx']);
  const real = skipHits.filter(
    (h) => !h.includes('node_modules') && !h.includes('/dist/') && !h.includes('session-audit.ts'),
  );
  totalSkips += real.length;
}
if (totalSkips > 15) {
  fail(
    'integrity-skip-budget',
    'BLOCKER',
    `${totalSkips} audit-skip comments in codebase (budget: 15). Claude is gaming the audit — remove skips and fix the real violations.`,
  );
} else if (totalSkips > 8) {
  fail(
    'integrity-skip-budget',
    'HIGH',
    `${totalSkips} audit-skip comments in codebase (warning at 8). Review whether each skip is justified.`,
  );
} else if (totalSkips > 0) {
  console.log(`[audit] Skip comment budget: ${totalSkips}/15 used`);
}

// 4b: Learning pattern validation — every learning with check_pattern
// must match at least 1 file (otherwise the pattern is fake/broken).
for (const learning of learnings) {
  if (!learning.checkPattern || !learning.checkPaths) continue;
  const paths = learning.checkPaths.split(',').map((p) => p.trim());
  const testHits = grep(learning.checkPattern, paths, ['.ts', '.tsx', '.md']);
  // A pattern that matches 0 files is either fake or outdated
  if (testHits.length === 0 && learning.checkExpect === 'none') {
    fail(
      'integrity-dead-pattern',
      'MEDIUM',
      `Learning ${learning.file} has check_pattern that matches 0 files — pattern may be fake or outdated`,
    );
  }
}

// 4c: Comment-keyword gaming — detect audit keywords placed in comments
// to satisfy grep checks without implementing the actual behavior.
// Heuristic check — high thresholds to avoid flagging legitimate docs.
// withTenantContext/rateLimit removed: too commonly referenced in docs.
const GAMING_KEYWORDS = [
  {
    pattern: '//.*\\$executeRaw\\|//.*\\$queryRaw',
    label: '$executeRaw/$queryRaw in comments',
    threshold: 6,
  },
  { pattern: '//.*assertWithinBudget', label: 'assertWithinBudget in comments', threshold: 4 },
];
for (const kw of GAMING_KEYWORDS) {
  const gamingHits = grep(kw.pattern, ['apps/backend/src'], ['.ts']);
  const real = gamingHits.filter(
    (h) =>
      !h.includes('node_modules') &&
      !h.includes('/dist/') &&
      !h.includes('.test.') &&
      !h.includes('session-audit.ts') &&
      !h.includes('@derives'),
  );
  if (real.length > kw.threshold) {
    fail(
      'integrity-comment-gaming',
      'MEDIUM',
      `${kw.label}: ${real.length} occurrences (threshold ${kw.threshold}). Review whether these are documentation or audit evasion.`,
    );
  }
}

// ─── Report ────────────────────────────────────────────────────────────────

const blockers = violations.filter((v) => v.severity === 'BLOCKER');
const highs = violations.filter((v) => v.severity === 'HIGH');
const mediums = violations.filter((v) => v.severity === 'MEDIUM');
const lows = violations.filter((v) => v.severity === 'LOW');

if (violations.length === 0) {
  console.log('[audit] ALL CHECKS PASS. Codebase is clean against locked docs.\n');
  process.exit(0);
}

console.log(`[audit] Found ${violations.length} violation(s):\n`);

if (blockers.length > 0) {
  console.log(`  BLOCKERS (${blockers.length}) — fix before ANY work:`);
  for (const v of blockers) console.log(`    [${v.check}] ${v.detail}`);
  console.log();
}

if (highs.length > 0) {
  console.log(`  HIGH (${highs.length}) — fix before committing:`);
  for (const v of highs) console.log(`    [${v.check}] ${v.detail}`);
  console.log();
}

if (mediums.length > 0) {
  console.log(`  MEDIUM (${mediums.length}) — fix when touching related code:`);
  for (const v of mediums) console.log(`    [${v.check}] ${v.detail}`);
  console.log();
}

if (lows.length > 0) {
  console.log(`  LOW (${lows.length}) — nice to fix:`);
  for (const v of lows) console.log(`    [${v.check}] ${v.detail}`);
  console.log();
}

if (blockers.length > 0) {
  console.log('[audit] BLOCKERS FOUND. Do NOT start work until these are fixed.\n');
  process.exit(1);
}

if (highs.length > 0) {
  console.log('[audit] HIGH violations found. Fix these before committing any code.\n');
  process.exit(1);
}

console.log('[audit] No blockers or high violations. Safe to proceed.\n');
process.exit(0);
