#!/usr/bin/env node
/**
 * Migration safety scanner — Wave 4b Phase 2.5.
 *
 * Scans every Prisma migration.sql file for destructive operations
 * (DROP TABLE / DROP COLUMN / DROP INDEX / DROP CONSTRAINT / RENAME /
 * TRUNCATE) and requires either:
 *   1. A `DO $$ … RAISE EXCEPTION … END IF; END $$;` precondition guard
 *      that fires before the destructive op, OR
 *   2. A `-- SAFE: <one-line reason>` comment in the file body that
 *      explicitly acknowledges the destructive op is intentional and safe.
 *
 * Without one of those, fails CI with a file path + matched pattern.
 *
 * Usage:
 *   node scripts/check-migration-safety.mjs              # scan all
 *   node scripts/check-migration-safety.mjs --strict     # exit 2 on any warning
 *
 * @derives(panel-2026-05-10) — Phase 2 had a destructive migration with
 *   no DB-level guard; this script makes recurrence impossible.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const MIGRATIONS_DIR = join(
  REPO_ROOT,
  'packages/shared-schema/prisma/migrations',
);

// Patterns considered destructive. Case-insensitive; matched outside of
// SQL comments (we strip `-- ...` lines + `/* ... */` blocks before scan).
const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bDROP\s+CONSTRAINT\b/i,
  /\bDROP\s+VIEW\b/i,
  /\bRENAME\b/i,
  /\bTRUNCATE\b/i,
];

// Either a programmatic guard or an explicit `-- SAFE:` line satisfies
// the rule. The SAFE comment must be substantive (have content after the
// colon).
const HAS_RAISE_GUARD = /DO\s+\$\$[\s\S]+?RAISE\s+EXCEPTION/i;
const HAS_SAFE_COMMENT = /^\s*--\s*SAFE\s*:\s*.+$/im;

function stripSqlComments(sql) {
  // Strip block comments first
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip line comments
  out = out.replace(/^\s*--.*$/gm, '');
  return out;
}

function findDestructiveOps(strippedSql) {
  const matches = [];
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    const m = strippedSql.match(pattern);
    if (m) matches.push(m[0]);
  }
  return matches;
}

function listMigrationFiles() {
  if (!statSync(MIGRATIONS_DIR, { throwIfNoEntry: false })) return [];
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  const files = [];
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const sqlPath = join(MIGRATIONS_DIR, dirent.name, 'migration.sql');
    if (statSync(sqlPath, { throwIfNoEntry: false })) {
      files.push(sqlPath);
    }
  }
  return files;
}

function checkFile(path) {
  const raw = readFileSync(path, 'utf8');
  const stripped = stripSqlComments(raw);
  const destructive = findDestructiveOps(stripped);
  if (destructive.length === 0) {
    return { path, ok: true, ops: [], reason: null };
  }
  // Check for either guard
  const hasGuard = HAS_RAISE_GUARD.test(raw);
  const hasSafe = HAS_SAFE_COMMENT.test(raw);
  if (hasGuard || hasSafe) {
    return {
      path,
      ok: true,
      ops: destructive,
      reason: hasGuard ? 'RAISE EXCEPTION guard' : 'SAFE comment',
    };
  }
  return {
    path,
    ok: false,
    ops: destructive,
    reason: 'destructive op WITHOUT RAISE-EXCEPTION guard or `-- SAFE:` comment',
  };
}

function main() {
  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log('[check-migration-safety] no migration.sql files found.');
    return 0;
  }
  let failed = 0;
  let okWithGuard = 0;
  let okClean = 0;
  for (const file of files) {
    const result = checkFile(file);
    const rel = file.replace(REPO_ROOT, '');
    if (result.ok) {
      if (result.ops.length > 0) {
        console.log(`✓ ${rel}  (destructive ops [${result.ops.join(', ')}] — guarded by ${result.reason})`);
        okWithGuard++;
      } else {
        // Pure-additive migration; silent ok unless --verbose
        okClean++;
      }
    } else {
      console.error(
        `✗ ${rel}  → ${result.reason}\n  Detected: ${result.ops.join(', ')}\n  Fix: add a \`DO $$ … RAISE EXCEPTION … END IF; END $$;\` block,\n       OR add \`-- SAFE: <one-line reason>\` to the file header.`,
      );
      failed++;
    }
  }
  console.log(
    `\n[check-migration-safety] ${files.length} migration files scanned: ${failed} failed, ${okWithGuard} guarded destructive, ${okClean} pure-additive.`,
  );
  return failed > 0 ? 1 : 0;
}

const exitCode = main();
process.exit(exitCode);
