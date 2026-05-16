/**
 * UUID v4 generator for client-side idempotency keys.
 * Sent as `Idempotency-Key` header on every chat request.
 *
 * @derives(master-plan §G)
 */

/**
 * Generate a UUID v4 string. Uses crypto.randomUUID if available
 * (RN 0.74+ via Hermes), otherwise falls back to a math.random fallback.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes — RFC 4122 v4 from Math.random
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += '-';
    } else if (i === 14) {
      s += '4'; // version 4
    } else if (i === 19) {
      s += hex[Math.floor(Math.random() * 4) | 8]; // variant
    } else {
      s += hex[Math.floor(Math.random() * 16)];
    }
  }
  return s;
}
