/**
 * Unit tests for the production-safe phone-allowlist OTP bypass.
 *
 * Covers the strict allowlist contract:
 *   - Empty / unset AXHY_OTP_BYPASS_PHONES → no phone matches
 *   - Phone in allowlist + magic code "123456" → bypass accepts
 *   - Phone in allowlist + wrong code → bypass refuses
 *   - Phone NOT in allowlist + magic code → bypass refuses
 *   - Phone normalization (whitespace, parens, dashes) is symmetric
 *
 * @derives(2026-05-25 founder direction — safe replacement for AXHY_OTP_BYPASS=1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { isPhoneAllowlisted, shouldBypassOtp } from '../src/lib/otp-bypass.js';

let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AXHY_OTP_BYPASS_PHONES;
  delete process.env.AXHY_OTP_BYPASS_PHONES;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.AXHY_OTP_BYPASS_PHONES;
  else process.env.AXHY_OTP_BYPASS_PHONES = originalEnv;
});

describe('isPhoneAllowlisted', () => {
  it('returns false for any phone when AXHY_OTP_BYPASS_PHONES is unset', () => {
    expect(isPhoneAllowlisted('+919381378257')).toBe(false);
    expect(isPhoneAllowlisted('+15556319578')).toBe(false);
    expect(isPhoneAllowlisted('')).toBe(false);
  });

  it('returns false for any phone when AXHY_OTP_BYPASS_PHONES is empty string', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = '';
    expect(isPhoneAllowlisted('+919381378257')).toBe(false);
  });

  it('returns true for a single allowlisted phone (exact match)', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = '+919381378257';
    expect(isPhoneAllowlisted('+919381378257')).toBe(true);
    expect(isPhoneAllowlisted('+919999999999')).toBe(false);
  });

  it('returns true for any phone in a comma-separated list', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = '+919381378257,+919999999999,+918888888888';
    expect(isPhoneAllowlisted('+919381378257')).toBe(true);
    expect(isPhoneAllowlisted('+919999999999')).toBe(true);
    expect(isPhoneAllowlisted('+918888888888')).toBe(true);
    expect(isPhoneAllowlisted('+917777777777')).toBe(false);
  });

  it('normalizes whitespace, parens, and dashes symmetrically', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = '+91 (9381) 378-257';
    expect(isPhoneAllowlisted('+919381378257')).toBe(true);
    expect(isPhoneAllowlisted('+91 93813 78257')).toBe(true);
    expect(isPhoneAllowlisted('+91-9381-378-257')).toBe(true);
  });

  it('ignores empty entries from trailing or duplicate commas', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = '+919381378257,,,+919999999999,';
    expect(isPhoneAllowlisted('+919381378257')).toBe(true);
    expect(isPhoneAllowlisted('+919999999999')).toBe(true);
    expect(isPhoneAllowlisted('')).toBe(false);
  });

  it('returns false when env contains only whitespace / empty entries', () => {
    process.env.AXHY_OTP_BYPASS_PHONES = ' , , , ';
    expect(isPhoneAllowlisted('+919381378257')).toBe(false);
    expect(isPhoneAllowlisted('')).toBe(false);
  });
});

describe('shouldBypassOtp — truth table', () => {
  const ALLOWLISTED = '+919381378257';
  const NOT_ALLOWLISTED = '+917777777777';
  const MAGIC = '123456';
  const WRONG = '654321';

  beforeEach(() => {
    process.env.AXHY_OTP_BYPASS_PHONES = ALLOWLISTED;
  });

  it('TRUE: allowlisted phone + magic code', () => {
    expect(shouldBypassOtp(ALLOWLISTED, MAGIC)).toBe(true);
  });

  it('FALSE: allowlisted phone + wrong code (must fall through to real verify)', () => {
    expect(shouldBypassOtp(ALLOWLISTED, WRONG)).toBe(false);
  });

  it('FALSE: non-allowlisted phone + magic code (must fall through; no backdoor)', () => {
    expect(shouldBypassOtp(NOT_ALLOWLISTED, MAGIC)).toBe(false);
  });

  it('FALSE: non-allowlisted phone + wrong code', () => {
    expect(shouldBypassOtp(NOT_ALLOWLISTED, WRONG)).toBe(false);
  });

  it('FALSE: allowlisted phone but env var was unset between calls', () => {
    delete process.env.AXHY_OTP_BYPASS_PHONES;
    expect(shouldBypassOtp(ALLOWLISTED, MAGIC)).toBe(false);
  });
});
