/**
 * Pure-unit tests for the policy-write ACL helper.
 *
 * Covers the role↔key-prefix matrix from
 * docs/locked/rule-hierarchy-three-layers.md Key-Namespace ACL +
 * docs/locked/security-gaps-to-fix.md GAP 2.
 *
 * The matching integration test that wires this into the policy write
 * route lives at apps/backend/test/policy-write-route.test.ts and uses
 * a real Railway-sandbox tx.
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 */

import { describe, it, expect } from 'vitest';

import {
  assertPolicyKeyAllowedForRole,
  getPolicyKeyACL,
  PolicyKeyForbiddenError,
} from '../src/lib/policy-write-acl.js';

describe('policy-write-acl: ai.rules.company.*', () => {
  it('OWNER may write a company rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('OWNER', 'ai.rules.company.uniform_required'),
    ).not.toThrow();
  });

  it('SUPER_ADMIN may write a company rule key (platform bypass)', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPER_ADMIN', 'ai.rules.company.uniform_required'),
    ).not.toThrow();
  });

  it('HR cannot write a company rule key', () => {
    expect(() => assertPolicyKeyAllowedForRole('HR', 'ai.rules.company.uniform_required')).toThrow(
      PolicyKeyForbiddenError,
    );
  });

  it('SUPERVISOR cannot write a company rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPERVISOR', 'ai.rules.company.uniform_required'),
    ).toThrow(PolicyKeyForbiddenError);
  });

  it('WORKER cannot write a company rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('WORKER', 'ai.rules.company.uniform_required'),
    ).toThrow(PolicyKeyForbiddenError);
  });
});

describe('policy-write-acl: ai.rules.hr.*', () => {
  it('HR may write an HR rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('HR', 'ai.rules.hr.max_leave_days_per_month'),
    ).not.toThrow();
  });

  it('OWNER may write an HR rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('OWNER', 'ai.rules.hr.max_leave_days_per_month'),
    ).not.toThrow();
  });

  it('SUPER_ADMIN may write an HR rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPER_ADMIN', 'ai.rules.hr.max_leave_days_per_month'),
    ).not.toThrow();
  });

  it('SUPERVISOR cannot write an HR rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPERVISOR', 'ai.rules.hr.max_leave_days_per_month'),
    ).toThrow(PolicyKeyForbiddenError);
  });

  it('WORKER cannot write an HR rule key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('WORKER', 'ai.rules.hr.max_leave_days_per_month'),
    ).toThrow(PolicyKeyForbiddenError);
  });
});

describe('policy-write-acl: ai.limits.*', () => {
  it('OWNER may write a limits key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('OWNER', 'ai.limits.messages_per_supervisor_daily'),
    ).not.toThrow();
  });

  it('SUPER_ADMIN may write a limits key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPER_ADMIN', 'ai.limits.messages_per_supervisor_daily'),
    ).not.toThrow();
  });

  it('HR cannot write a limits key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('HR', 'ai.limits.messages_per_supervisor_daily'),
    ).toThrow(PolicyKeyForbiddenError);
  });

  it('SUPERVISOR cannot write a limits key', () => {
    expect(() =>
      assertPolicyKeyAllowedForRole('SUPERVISOR', 'ai.limits.messages_per_supervisor_daily'),
    ).toThrow(PolicyKeyForbiddenError);
  });
});

describe('policy-write-acl: unrestricted keys', () => {
  it('any role may write a key with no restricted prefix', () => {
    expect(() => assertPolicyKeyAllowedForRole('SUPERVISOR', 'sla.default_minutes')).not.toThrow();
    expect(() =>
      assertPolicyKeyAllowedForRole('HR', 'worker.preferred_language_default'),
    ).not.toThrow();
    expect(() => assertPolicyKeyAllowedForRole('WORKER', 'random.unrestricted')).not.toThrow();
  });
});

describe('policy-write-acl: error shape', () => {
  it('PolicyKeyForbiddenError carries the right metadata', () => {
    try {
      assertPolicyKeyAllowedForRole('HR', 'ai.rules.company.uniform_required');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyKeyForbiddenError);
      if (err instanceof PolicyKeyForbiddenError) {
        expect(err.code).toBe('POLICY_KEY_FORBIDDEN_FOR_ROLE');
        expect(err.key).toBe('ai.rules.company.uniform_required');
        expect(err.role).toBe('HR');
        expect(err.allowedRoles).toEqual(['OWNER', 'SUPER_ADMIN']);
      }
    }
  });

  it('error message mentions the role and key', () => {
    try {
      assertPolicyKeyAllowedForRole('SUPERVISOR', 'ai.limits.daily_inr_cap');
      throw new Error('should have thrown');
    } catch (err) {
      if (err instanceof PolicyKeyForbiddenError) {
        expect(err.message).toContain('SUPERVISOR');
        expect(err.message).toContain('ai.limits.daily_inr_cap');
      }
    }
  });
});

describe('policy-write-acl: ACL table introspection', () => {
  it('getPolicyKeyACL exposes the three locked-doc prefixes', () => {
    const acl = getPolicyKeyACL();
    const prefixes = acl.map((entry) => entry.prefix).sort();
    expect(prefixes).toEqual(['ai.limits.', 'ai.rules.company.', 'ai.rules.hr.']);
  });

  it('SUPER_ADMIN appears in every allow-list (platform bypass)', () => {
    const acl = getPolicyKeyACL();
    for (const entry of acl) {
      expect(entry.allowedRoles).toContain('SUPER_ADMIN');
    }
  });
});
