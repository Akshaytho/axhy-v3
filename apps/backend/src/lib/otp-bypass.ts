/**
 * Production-safe operator OTP bypass via phone allowlist.
 *
 * Background: founder needs to test screens in production while WhatsApp
 * delivery is blocked by Meta business verification (1-2 weeks). The previous
 * blanket `AXHY_OTP_BYPASS=1` env var was unsafe (anyone with the magic code
 * could log in as anyone) and is refused by the server.ts security guard
 * when NODE_ENV=production.
 *
 * This module adds a strict allowlist: `AXHY_OTP_BYPASS_PHONES` env var
 * holds comma-separated E.164 phone numbers. ONLY those phones are allowed
 * to use the magic code '123456' to bypass the real OTP verify step. Every
 * other phone falls through to the normal Redis-backed verify. If the env
 * var is unset or empty, the allowlist is empty and NO phone gets bypass.
 *
 * Safe to enable in production permanently — it's the operational tool for
 * "let me test this specific account without sending a real WhatsApp message."
 *
 * @derives(2026-05-25 founder direction — safe replacement for AXHY_OTP_BYPASS=1)
 * @derives(ENTERPRISE_PRODUCTION_STANDARD.md E1 — security boundary)
 */

const BYPASS_MAGIC_CODE = '123456';

/**
 * Normalize a phone number for comparison: strip whitespace, parentheses,
 * dashes, and a leading "0". E.164 plus sign is preserved.
 *
 * The same normalization is applied to allowlist entries AND to the input
 * phone, so '+91 9381 378257' in the env var matches '+919381378257' from
 * the client.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s()\-]/g, '').trim();
}

/**
 * Parse AXHY_OTP_BYPASS_PHONES into a Set of normalized phone numbers.
 * Empty / unset env var returns an empty Set (no phone matches).
 */
function getAllowlist(): Set<string> {
  const raw = process.env.AXHY_OTP_BYPASS_PHONES;
  if (!raw) return new Set();
  const phones = raw
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p) => p.length > 0);
  return new Set(phones);
}

/**
 * Returns true if the phone number is in the operator allowlist.
 * Phone is normalized before lookup.
 *
 * @derives(ADR-0007)
 */
export function isPhoneAllowlisted(phone: string): boolean {
  return getAllowlist().has(normalizePhone(phone));
}

/**
 * Returns true if the (phone, code) pair satisfies the production-safe
 * bypass: phone is in the allowlist AND code is the magic value. Caller
 * should treat this as a successful OTP verify and skip the Redis lookup.
 *
 * @derives(ADR-0007)
 */
export function shouldBypassOtp(phone: string, code: string): boolean {
  return code === BYPASS_MAGIC_CODE && isPhoneAllowlisted(phone);
}
