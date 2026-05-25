/**
 * Tests for role-gates middleware.
 *
 * Most-important test: parse docs/locked/hiring-hierarchy.md and assert
 * HIRING_AUTHORITY const matches the authority table byte-for-byte.
 * Drift fails the build.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  HIRING_AUTHORITY,
  assertTargetRole,
  TargetRoleError,
} from '../src/middleware/role-gates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

describe('role-gates — HIRING_AUTHORITY', () => {
  it('matches the locked hiring-hierarchy.md authority table', () => {
    const lockedDoc = readFileSync(
      path.join(REPO_ROOT, 'docs/locked/hiring-hierarchy.md'),
      'utf-8',
    );

    // Parse rows of the "Authority Table" section:
    //   | OWNER | HR, OWNER | ... |
    //   | HR    | SUPERVISOR, WORKER | ... |
    // Stop at "(none)" rows for SUPERVISOR + WORKER (no creates allowed).
    const tableSection = lockedDoc.split('## Authority Table')[1] ?? '';
    const rowRegex = /\|\s*(SUPER_ADMIN|OWNER|HR|SUPERVISOR|WORKER)\s*\|\s*([^|]+?)\s*\|/g;
    const parsed: Record<string, string[]> = {};
    let m: RegExpExecArray | null;
    while ((m = rowRegex.exec(tableSection)) !== null) {
      const caller = m[1]!;
      const allowedRaw = m[2]!.trim();
      if (allowedRaw === '(none)') {
        parsed[caller] = [];
      } else {
        parsed[caller] = allowedRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^[A-Z_]+$/.test(s));
      }
    }

    // All 5 roles must appear
    expect(Object.keys(parsed).sort()).toEqual(
      ['HR', 'OWNER', 'SUPERVISOR', 'SUPER_ADMIN', 'WORKER'].sort(),
    );

    for (const caller of Object.keys(parsed)) {
      const fromDoc = parsed[caller]!.slice().sort();
      const fromConst = [...HIRING_AUTHORITY[caller as keyof typeof HIRING_AUTHORITY]].sort();
      expect(fromConst, `HIRING_AUTHORITY[${caller}] should match locked doc`).toEqual(fromDoc);
    }
  });

  it('assertTargetRole allows HR -> WORKER', () => {
    expect(() => assertTargetRole('HR', 'WORKER')).not.toThrow();
  });

  it('assertTargetRole allows HR -> SUPERVISOR', () => {
    expect(() => assertTargetRole('HR', 'SUPERVISOR')).not.toThrow();
  });

  it('assertTargetRole allows OWNER -> HR', () => {
    expect(() => assertTargetRole('OWNER', 'HR')).not.toThrow();
  });

  it('assertTargetRole rejects SUPERVISOR -> WORKER with TargetRoleError', () => {
    expect(() => assertTargetRole('SUPERVISOR', 'WORKER')).toThrow(TargetRoleError);
  });

  it('assertTargetRole rejects HR -> OWNER (cannot create owner from HR)', () => {
    expect(() => assertTargetRole('HR', 'OWNER')).toThrow(TargetRoleError);
  });

  it('assertTargetRole rejects WORKER -> anything', () => {
    expect(() => assertTargetRole('WORKER', 'WORKER')).toThrow(TargetRoleError);
    expect(() => assertTargetRole('WORKER', 'SUPERVISOR')).toThrow(TargetRoleError);
  });
});
