/**
 * OTP storage — Redis-backed per ADR-0024.
 *
 * Wave A.2.1 follow-up — addresses friend's Wave A.2 review:
 *   #10 atomicity via Lua (check-rate-limit + insert as one script).
 *   #12 keys go through lib/redis-keys.ts for env-namespacing.
 *   #15 dropped the unused `_prisma` parameter.
 *   #24 per-issuance random salt + HMAC pepper so a leaked Redis dump
 *       isn't immediately brute-forceable. A 6-digit code is only 1M
 *       possibilities; bare sha256(phone:code) lets an attacker with the
 *       hash crack any active OTP in milliseconds. Now: random 16-byte
 *       salt + HMAC-SHA256 keyed with `AXHY_OTP_PEPPER` env var.
 *
 * OTP MUST fail CLOSED on Redis outage (auth-critical, unlike rate limits).
 *
 * @derives(ADR-0024 — Redis for caches)
 * @derives(ADR-0007)
 * @derives(friend review Wave A.2 #10, #12, #15, #24)
 */

import crypto from 'node:crypto';

import { getRedis } from './redis.js';
import { RedisKeys } from './redis-keys.js';
import { shouldBypassOtp } from './otp-bypass.js';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 min validity
const RL_WINDOW_MS = 15 * 60 * 1000;
const PROD_MAX_OTPS_PER_15MIN = 3;
const DEV_MAX_OTPS_PER_15MIN = 100;

function maxOtpsPer15Min(): number {
  return process.env.AXHY_OTP_BYPASS === '1' ? DEV_MAX_OTPS_PER_15MIN : PROD_MAX_OTPS_PER_15MIN;
}

/**
 * HMAC pepper — secret stored in env so a Redis dump alone can't brute-force
 * OTP codes (1M possibilities for a 6-digit code = milliseconds without a
 * pepper). Defaults to JWT_SECRET when AXHY_OTP_PEPPER unset (any deploy
 * already has JWT_SECRET); fully empty fallback for dev only.
 */
function getPepper(): string {
  return process.env.AXHY_OTP_PEPPER ?? process.env.JWT_SECRET ?? 'dev-only-fallback';
}

/**
 * Per-issuance random salt + HMAC-SHA256 hash. The salt is stored in
 * Redis alongside the hash so verify can recompute. Without the pepper,
 * a Redis dump still doesn't let an attacker derive codes — they'd need
 * the env secret too.
 */
function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function hashCode(phone: string, code: string, salt: string): string {
  return crypto.createHmac('sha256', getPepper()).update(`${phone}:${salt}:${code}`).digest('hex');
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Lua: atomic rate-limit + insert. KEYS[1]=rl, KEYS[2]=store
 *   ARGV[1] = now ms; ARGV[2] = rl-window cutoff; ARGV[3] = cap
 *   ARGV[4] = rl-window pexpire ms
 *   ARGV[5] = rl-zset unique member; ARGV[6] = hash-field key (issuedAt)
 *   ARGV[7] = hash-field value (salt|hash); ARGV[8] = store pexpire ms
 * Returns 1 on success, 0 when over cap.
 */
const ISSUE_LUA = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
  local count = redis.call('ZCARD', KEYS[1])
  if count >= tonumber(ARGV[3]) then
    return 0
  end
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  redis.call('HSET', KEYS[2], ARGV[6], ARGV[7])
  redis.call('PEXPIRE', KEYS[2], ARGV[8])
  return 1
`;

/**
 * Issue a new OTP for the given phone. Friend review #15 — no `_prisma`
 * param.
 *
 * @derives(ADR-0007) @derives(ADR-0024)
 */
export async function issueOtp(phone: string): Promise<{
  code: string;
  expiresAt: Date;
  resendInSeconds: number;
}> {
  const redis = getRedis();
  const now = Date.now();
  const cap = maxOtpsPer15Min();
  const code = generateCode();
  const salt = generateSalt();
  const codeHash = hashCode(phone, code, salt);
  const expiresAt = new Date(now + OTP_TTL_MS);
  const rlMember = `${now}-${crypto.randomUUID()}`;
  // Encoded as `salt|hash` so verify can split + re-hash.
  const fieldValue = `${salt}|${codeHash}`;

  const result = (await redis.eval(
    ISSUE_LUA,
    2,
    RedisKeys.otpRateLimit(phone),
    RedisKeys.otpStore(phone),
    String(now),
    String(now - RL_WINDOW_MS),
    String(cap),
    String(RL_WINDOW_MS + 1_000),
    rlMember,
    String(now),
    fieldValue,
    String(OTP_TTL_MS + 1_000),
  )) as number;

  if (result === 0) {
    throw new Error(`OTP_RATE_LIMITED: ${cap} OTPs allowed per phone per 15 minutes`);
  }

  return { code, expiresAt, resendInSeconds: 60 };
}

/**
 * Verify a submitted OTP. Returns true on success and consumes the entry.
 * Friend review #15 — no `_prisma` param.
 *
 * @derives(ADR-0007) @derives(ADR-0024)
 */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const redis = getRedis();

  // Production-safe operator bypass: phone-allowlist via AXHY_OTP_BYPASS_PHONES.
  // Refuses to match unless the phone is explicitly listed in the env var.
  // Safe to enable in production; refused by server.ts:73-80 guard otherwise.
  //
  // Test-only blanket bypass (AXHY_OTP_BYPASS=1) is checked AFTER and only
  // works in NODE_ENV=test|development per server.ts guard. Both can be
  // active independently; the allowlist runs first because it's the
  // production path.
  if (shouldBypassOtp(phone, code)) {
    try {
      const entries = await redis.hgetall(RedisKeys.otpStore(phone));
      const newest = Object.keys(entries).sort((a, b) => Number(b) - Number(a))[0];
      if (newest) await redis.hdel(RedisKeys.otpStore(phone), newest);
    } catch {
      /* best-effort */
    }
    return true;
  }

  // Test-only dev bypass — gated by server.ts security guard at boot.
  if (process.env.AXHY_OTP_BYPASS === '1' && code === '123456') {
    try {
      const entries = await redis.hgetall(RedisKeys.otpStore(phone));
      const newest = Object.keys(entries).sort((a, b) => Number(b) - Number(a))[0];
      if (newest) await redis.hdel(RedisKeys.otpStore(phone), newest);
    } catch {
      /* best-effort */
    }
    return true;
  }

  const entries = await redis.hgetall(RedisKeys.otpStore(phone));
  const now = Date.now();
  for (const [issuedAtRaw, fieldValue] of Object.entries(entries)) {
    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt)) continue;
    if (now - issuedAt > OTP_TTL_MS) continue;
    const [salt, storedHash] = fieldValue.split('|');
    if (!salt || !storedHash) continue;
    const expected = hashCode(phone, code, salt);
    // crypto.timingSafeEqual to avoid timing-side-channel — the hashes
    // are hex strings of equal length, so cast to Buffer of same length.
    const a = Buffer.from(storedHash, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) continue;
    if (!crypto.timingSafeEqual(a, b)) continue;

    const deleted = await redis.hdel(RedisKeys.otpStore(phone), issuedAtRaw);
    if (deleted >= 1) return true;
    return false; // lost race
  }
  return false;
}
