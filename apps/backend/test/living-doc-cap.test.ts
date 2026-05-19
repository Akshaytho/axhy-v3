/**
 * Tests for the LivingDoc 100-active-rule cap with auto-EXPIRE (GAP 5).
 *
 * Pure-unit tests of `enforceLivingDocCap` — the cap logic is data-only
 * (operates on JS arrays). The integration with chat.ts /chat/apply is
 * exercised by the chat suite (see chat-apply tests).
 *
 * Per docs/locked/livingdoc-extraction-rules.md:
 *   - MAX 100 ACTIVE rules per LivingDoc, across all 5 sections.
 *   - Oldest ACTIVE rules auto-EXPIRE first.
 *   - PENDING, REJECTED, EXPIRED rules don't count toward the cap.
 *
 * @derives(plans/abstract-wandering-kazoo.md follow-on)
 */

import { describe, it, expect } from 'vitest';

import {
  enforceLivingDocCap,
  readSections,
  MAX_ACTIVE_RULES_PER_LIVING_DOC,
} from '../src/lib/living-doc-cap.js';

const makeRule = (
  overrides: Partial<{
    id: string;
    state: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
    createdAt: string;
    ruleText: string;
  }>,
) => ({
  id: overrides.id ?? `r-${Math.random().toString(36).slice(2, 10)}`,
  ruleText: overrides.ruleText ?? 'some rule',
  description: 'why',
  visibility: 'COMPANY' as const,
  scope: null,
  createdAt: overrides.createdAt ?? new Date('2026-05-19T00:00:00Z').toISOString(),
  createdBy: 'supervisor' as const,
  state: overrides.state ?? ('ACTIVE' as const),
  source: null,
});

const emptySections = () => ({
  siteRules: [],
  workerNotes: [],
  clientPreferences: [],
  recurringTasks: [],
  freeNotes: [],
});

describe('enforceLivingDocCap', () => {
  it('no-op when active count + addCount <= MAX', () => {
    const sections = emptySections();
    sections.siteRules = [
      makeRule({ id: 'a', createdAt: '2026-05-01T00:00:00Z' }),
      makeRule({ id: 'b', createdAt: '2026-05-02T00:00:00Z' }),
    ];
    const result = enforceLivingDocCap(sections, { expectedAddCount: 1 });
    expect(result.expiries).toEqual([]);
    expect(result.sections.siteRules).toHaveLength(2);
    expect(result.sections.siteRules.every((r) => r.state === 'ACTIVE')).toBe(true);
  });

  it('expires oldest when active count + addCount > MAX', () => {
    const sections = emptySections();
    // Fill exactly 100 active rules
    for (let i = 0; i < MAX_ACTIVE_RULES_PER_LIVING_DOC; i++) {
      sections.siteRules.push(
        makeRule({
          id: `r-${String(i).padStart(3, '0')}`,
          createdAt: new Date(2026, 0, i + 1).toISOString(),
        }),
      );
    }
    // We're about to add 1 more — that would make 101. One must expire.
    const result = enforceLivingDocCap(sections, { expectedAddCount: 1 });
    expect(result.expiries).toHaveLength(1);
    expect(result.expiries[0]!.ruleId).toBe('r-000'); // oldest
    expect(result.expiries[0]!.section).toBe('siteRules');

    const activeRemaining = result.sections.siteRules.filter((r) => r.state === 'ACTIVE');
    expect(activeRemaining).toHaveLength(MAX_ACTIVE_RULES_PER_LIVING_DOC - 1);

    // The expired rule is still in the array, just with state=EXPIRED
    const expired = result.sections.siteRules.find((r) => r.id === 'r-000');
    expect(expired?.state).toBe('EXPIRED');
    expect(expired?.decidedAt).toMatch(/^20\d\d-\d\d-\d\dT/);
  });

  it('expires the oldest across DIFFERENT sections', () => {
    const sections = emptySections();
    // Fill 99 in siteRules (newer) + 1 oldest in freeNotes
    for (let i = 1; i < MAX_ACTIVE_RULES_PER_LIVING_DOC; i++) {
      sections.siteRules.push(
        makeRule({
          id: `s-${String(i).padStart(3, '0')}`,
          createdAt: new Date(2026, 1, i + 1).toISOString(),
        }),
      );
    }
    sections.freeNotes.push(
      makeRule({
        id: 'oldest-cross-section',
        createdAt: new Date(2026, 0, 1).toISOString(), // earliest
      }),
    );

    const result = enforceLivingDocCap(sections, { expectedAddCount: 1 });
    expect(result.expiries).toHaveLength(1);
    expect(result.expiries[0]!.ruleId).toBe('oldest-cross-section');
    expect(result.expiries[0]!.section).toBe('freeNotes');
  });

  it('expires MULTIPLE rules when over by 5', () => {
    const sections = emptySections();
    // 105 ACTIVE rules → adding 1 means we need 6 expiries to land at 99 + 1 = 100
    for (let i = 0; i < 105; i++) {
      sections.workerNotes.push(
        makeRule({
          id: `w-${String(i).padStart(3, '0')}`,
          createdAt: new Date(2026, 0, i + 1).toISOString(),
        }),
      );
    }
    const result = enforceLivingDocCap(sections, { expectedAddCount: 1 });
    expect(result.expiries.length).toBe(6);
    // The 6 oldest got expired (w-000..w-005)
    for (let i = 0; i < 6; i++) {
      expect(result.expiries[i]!.ruleId).toBe(`w-${String(i).padStart(3, '0')}`);
    }
    const activeCount = Object.values(result.sections).reduce(
      (n, arr) => n + arr.filter((r) => r.state === 'ACTIVE').length,
      0,
    );
    expect(activeCount).toBe(MAX_ACTIVE_RULES_PER_LIVING_DOC - 1);
  });

  it('does NOT touch PENDING / REJECTED / EXPIRED rules', () => {
    const sections = emptySections();
    // Fill 100 ACTIVE + 50 non-ACTIVE mixed
    for (let i = 0; i < MAX_ACTIVE_RULES_PER_LIVING_DOC; i++) {
      sections.siteRules.push(
        makeRule({
          id: `a-${i}`,
          createdAt: new Date(2026, 1, i + 1).toISOString(),
          state: 'ACTIVE',
        }),
      );
    }
    sections.siteRules.push(
      makeRule({ id: 'p-1', state: 'PENDING', createdAt: '2025-01-01T00:00:00Z' }),
      makeRule({ id: 'r-1', state: 'REJECTED', createdAt: '2025-01-01T00:00:00Z' }),
      makeRule({ id: 'e-1', state: 'EXPIRED', createdAt: '2025-01-01T00:00:00Z' }),
    );

    const result = enforceLivingDocCap(sections, { expectedAddCount: 1 });
    // One ACTIVE expired; non-ACTIVE rules untouched
    expect(result.expiries.length).toBe(1);
    const expiredIds = result.sections.siteRules
      .filter((r) => r.state === 'EXPIRED')
      .map((r) => r.id);
    expect(expiredIds).toContain('e-1'); // pre-existing
    expect(expiredIds).toContain('a-0'); // newly expired (oldest ACTIVE)
    // PENDING + REJECTED still present in their original states
    expect(result.sections.siteRules.find((r) => r.id === 'p-1')?.state).toBe('PENDING');
    expect(result.sections.siteRules.find((r) => r.id === 'r-1')?.state).toBe('REJECTED');
  });

  it('handles addCount=0 (count alone hitting cap)', () => {
    const sections = emptySections();
    // 101 ACTIVE — already over the cap. addCount=0 should still bring it to 100.
    for (let i = 0; i < 101; i++) {
      sections.siteRules.push(
        makeRule({
          id: `o-${i}`,
          createdAt: new Date(2026, 0, i + 1).toISOString(),
        }),
      );
    }
    const result = enforceLivingDocCap(sections, { expectedAddCount: 0 });
    expect(result.expiries.length).toBe(1);
    expect(result.expiries[0]!.ruleId).toBe('o-0');
    const remainingActive = result.sections.siteRules.filter((r) => r.state === 'ACTIVE');
    expect(remainingActive.length).toBe(MAX_ACTIVE_RULES_PER_LIVING_DOC);
  });

  it('readSections coerces unknown JSON shapes safely', () => {
    expect(
      readSections({
        siteRules: null,
        workerNotes: 'not an array',
        clientPreferences: {},
        recurringTasks: undefined as unknown,
        freeNotes: [makeRule({ id: 'x' })],
      }),
    ).toEqual({
      siteRules: [],
      workerNotes: [],
      clientPreferences: [],
      recurringTasks: [],
      freeNotes: [expect.objectContaining({ id: 'x' })],
    });
  });
});
