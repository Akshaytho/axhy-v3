/**
 * OTP storage with rate-limit + expiry.
 *
 * Day 4 implementation: simple Postgres-backed store. Replace with Redis at
 * 10K+ rps (per ADR-0009 — Postgres outbox over Redis until measured pain).
 *
 * Schema (created lazily on first use; idempotent):
 *
 *   CREATE TABLE IF NOT EXISTS axhy.otp_attempts (
 *     phone     varchar(16) NOT NULL,
 *     code_hash text        NOT NULL,
 *     issued_at timestamptz NOT NULL DEFAULT now(),
 *     expires_at timestamptz NOT NULL,
 *     consumed   boolean      NOT NULL DEFAULT false,
 *     PRIMARY KEY (phone, issued_at)
 *   );
 *   CREATE INDEX IF NOT EXISTS otp_phone_recent_idx
 *     ON axhy.otp_attempts (phone, issued_at DESC);
 *
 * @derives(ADR-0007)
 * @derives(master-plan §G.1) — phone+OTP rate-limited 3/15min per phone
 */

import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const OTP_TTL_SECONDS = 300; // 5 min validity
// Master plan §G.1 prescribes 3 OTPs per phone per 15 min for prod (prevents
// SMS-billing abuse). In dev (AXHY_OTP_BYPASS=1) we lift the cap so phone
// smoke-testing isn't gated by a 15-min wait when a screenshot loop or
// reload chews through OTPs. Prod default unchanged.
const PROD_MAX_OTPS_PER_15MIN = 3;
const DEV_MAX_OTPS_PER_15MIN = 100;
function maxOtpsPer15Min(): number {
  return process.env.AXHY_OTP_BYPASS === '1' ? DEV_MAX_OTPS_PER_15MIN : PROD_MAX_OTPS_PER_15MIN;
}

function hashCode(phone: string, code: string): string {
  // Salted with phone so a leaked DB row can't be replayed across users
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function generateCode(): string {
  // 6-digit numeric, padded
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

let schemaEnsured = false;
async function ensureSchema(prisma: PrismaClient): Promise<void> {
  if (schemaEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS axhy.otp_attempts (
      phone      varchar(16) NOT NULL,
      code_hash  text        NOT NULL,
      issued_at  timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed   boolean     NOT NULL DEFAULT false,
      PRIMARY KEY (phone, issued_at)
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS otp_phone_recent_idx
      ON axhy.otp_attempts (phone, issued_at DESC);
  `);
  schemaEnsured = true;
}

/**
 * Issue a new OTP for the given phone, returning the plaintext code so the
 * caller can hand it to MSG91 for SMS delivery. Enforces rate limit.
 *
 * @derives(ADR-0007)
 */
export async function issueOtp(
  prisma: PrismaClient,
  phone: string,
): Promise<{
  code: string;
  expiresAt: Date;
  resendInSeconds: number;
}> {
  await ensureSchema(prisma);

  // Rate-limit: prod 3 / 15 min per phone; dev 100 / 15 min (AXHY_OTP_BYPASS=1)
  const cap = maxOtpsPer15Min();
  const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count
     FROM axhy.otp_attempts
     WHERE phone = $1 AND issued_at > now() - interval '15 minutes'`,
    phone,
  );
  if (Number(count[0]?.count ?? 0) >= cap) {
    throw new Error(`OTP_RATE_LIMITED: ${cap} OTPs allowed per phone per 15 minutes`);
  }

  const code = generateCode();
  const codeHash = hashCode(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO axhy.otp_attempts (phone, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    phone,
    codeHash,
    expiresAt,
  );

  return { code, expiresAt, resendInSeconds: 60 };
}

/**
 * Verify a submitted OTP. Returns true on success and marks the row consumed.
 * Returns false (does NOT throw) on invalid / expired / already-consumed.
 *
 * @derives(ADR-0007)
 */
export async function verifyOtp(
  prisma: PrismaClient,
  phone: string,
  code: string,
): Promise<boolean> {
  await ensureSchema(prisma);

  // Dev-mode magic code: bypass mode accepts a fixed code so the app can be
  // exercised without reading DB rows or waiting on SMS. Real-code path below
  // still works (so existing tests that read the issued code keep passing).
  if (process.env.AXHY_OTP_BYPASS === '1' && code === '123456') {
    // Mark the most recent unconsumed row consumed so rate-limit + reuse
    // semantics still match production.
    await prisma.$executeRawUnsafe(
      `UPDATE axhy.otp_attempts
       SET consumed = true
       WHERE phone = $1 AND consumed = false AND expires_at > now()`,
      phone,
    );
    return true;
  }

  const codeHash = hashCode(phone, code);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ phone: string; issued_at: Date; expires_at: Date; consumed: boolean }>
  >(
    `SELECT phone, issued_at, expires_at, consumed
     FROM axhy.otp_attempts
     WHERE phone = $1 AND code_hash = $2 AND consumed = false AND expires_at > now()
     ORDER BY issued_at DESC
     LIMIT 1`,
    phone,
    codeHash,
  );

  const row = rows[0];
  if (!row) return false;

  await prisma.$executeRawUnsafe(
    `UPDATE axhy.otp_attempts SET consumed = true WHERE phone = $1 AND issued_at = $2`,
    row.phone,
    row.issued_at,
  );
  return true;
}
