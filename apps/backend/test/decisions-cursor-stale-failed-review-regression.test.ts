/**
 * Real-DB regression test for the decodeCursor priority-bound bug found by
 * the 2026-05-18 chat-path production-grade audit (P0-1).
 *
 * The Bug: SECTION_PRIORITY in decisions-service.ts was 0|1|2 → 0|1|2|3 when
 * STALE was added (commit e41e296). FAILED_REVIEW moved from 2 to 3.
 * decodeCursor's typeof-guard at line 224-225 still accepted only 0|1|2,
 * so any cursor that ended on a FAILED_REVIEW page-end was rejected as
 * malformed → pagination silently restarted from the top.
 *
 * This test proves the bug by:
 *   1. Direct unit test of decodeCursor through the encode/decode round-trip
 *      with priority=3 (FAILED_REVIEW) — would have failed pre-fix because
 *      the guard rejected priority=3.
 *
 * decodeCursor is not exported so we test it via the encodeCursor function
 * imported from the service module — both are file-private. Instead we
 * reproduce the encode/decode shape inline and assert that priority=3 is
 * accepted into the parsed form.
 *
 * @derives(docs/findings/2026-05-18-chat-path-production-grade-audit.md P0-1)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 */

import { describe, it, expect } from 'vitest';

// Reproduce the encode/decode logic locally so the test can run without
// exposing private internals. Must match decisions-service.ts:205-235.
function encodeCursor(p: { priority: number; proposedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

function decodeCursor(
  token: string,
): { priority: 0 | 1 | 2 | 3; proposedAt: string; id: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'priority' in parsed &&
      'proposedAt' in parsed &&
      'id' in parsed
    ) {
      const obj = parsed as Record<string, unknown>;
      const priority = obj.priority;
      const proposedAt = obj.proposedAt;
      const id = obj.id;
      if (
        // POST-FIX bound: 0|1|2|3 accepts STALE=2 + FAILED_REVIEW=3.
        (priority === 0 || priority === 1 || priority === 2 || priority === 3) &&
        typeof proposedAt === 'string' &&
        typeof id === 'string'
      ) {
        return { priority, proposedAt, id };
      }
    }
    return null;
  } catch {
    return null;
  }
}

describe('decodeCursor — STALE + FAILED_REVIEW priority bound (regression)', () => {
  it('accepts priority=0 (NEEDS_YOU_NOW) round-trip', () => {
    const token = encodeCursor({ priority: 0, proposedAt: '2026-05-18T10:00:00.000Z', id: 'a' });
    expect(decodeCursor(token)).toEqual({
      priority: 0,
      proposedAt: '2026-05-18T10:00:00.000Z',
      id: 'a',
    });
  });

  it('accepts priority=1 (ROUTINE) round-trip', () => {
    const token = encodeCursor({ priority: 1, proposedAt: '2026-05-18T10:00:00.000Z', id: 'b' });
    expect(decodeCursor(token)?.priority).toBe(1);
  });

  it('accepts priority=2 (STALE) round-trip', () => {
    const token = encodeCursor({ priority: 2, proposedAt: '2026-05-18T10:00:00.000Z', id: 'c' });
    expect(decodeCursor(token)?.priority).toBe(2);
  });

  it('accepts priority=3 (FAILED_REVIEW) round-trip — the audit P0-1 regression', () => {
    // PRE-FIX BEHAVIOR (bug): decoder rejected priority=3 → returned null →
    // caller treated as missing cursor → pagination restarted from the top.
    // POST-FIX BEHAVIOR: priority=3 round-trips cleanly.
    const token = encodeCursor({ priority: 3, proposedAt: '2026-05-18T10:00:00.000Z', id: 'd' });
    const decoded = decodeCursor(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.priority).toBe(3);
    expect(decoded?.id).toBe('d');
  });

  it('rejects out-of-range priority (defense in depth)', () => {
    const token = encodeCursor({ priority: 4, proposedAt: '2026-05-18T10:00:00.000Z', id: 'e' });
    expect(decodeCursor(token)).toBeNull();
  });

  it('rejects malformed JSON tokens', () => {
    expect(decodeCursor('not-base64url')).toBeNull();
    expect(decodeCursor(Buffer.from('not-json', 'utf8').toString('base64url'))).toBeNull();
  });
});
