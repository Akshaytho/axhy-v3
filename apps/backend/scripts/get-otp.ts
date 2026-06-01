/**
 * [ORCHESTRATOR_EXCEPTION] Single-file, single-write completion of founder task.
 * No delegation needed — this is the final write, all research already done in-context.
 *
 * Read-only OTP diagnostic for founder login on real phone.
 *
 * The OTP storage in `axhy.otp_attempts` stores `code_hash` (bcrypt-style),
 * NOT plaintext. So this script cannot print the original 6-digit code that
 * was sent to WhatsApp — bcrypt hashes are one-way by design.
 *
 * What this script DOES tell you:
 *   1. Whether there is currently an active (unconsumed, unexpired) OTP
 *      attempt in the DB for the given phone — confirms "did Send OTP
 *      actually persist to prod DB?"
 *   2. Whether the phone is on the AXHY_OTP_BYPASS_PHONES allowlist on
 *      this environment — if YES, the magic code '123456' will pass the
 *      verify step regardless of WhatsApp delivery.
 *
 * Usage:
 *   PHONE='+919381378257' \
 *   railway run --service backend -- \
 *     packages/ai-tools/node_modules/.bin/tsx \
 *     apps/backend/scripts/get-otp.ts
 *
 * Exit codes:
 *   0 — diagnostic info printed successfully
 *   1 — no active OTP row found AND phone not on bypass allowlist
 *
 * @derives(otp-bypass.ts) — production-safe allowlist + magic code 123456
 * @derives(otp-store.ts)  — code_hash storage (bcrypt-style, one-way)
 */

import { PrismaClient } from '@prisma/client';

interface ActiveOtpRow {
  phone: string;
  code_hash: string;
  issued_at: Date;
  expires_at: Date;
  consumed: boolean;
}

function formatIst(d: Date): string {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s()\-]/g, '').trim();
}

function isOnAllowlist(phone: string): boolean {
  const raw = process.env.AXHY_OTP_BYPASS_PHONES;
  if (!raw) return false;
  const set = new Set(
    raw
      .split(',')
      .map((p) => normalizePhone(p))
      .filter((p) => p.length > 0),
  );
  return set.has(normalizePhone(phone));
}

async function main(): Promise<number> {
  const phone = process.env.PHONE ?? '+919381378257';
  const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    console.error('Missing DATABASE_URL / DATABASE_PUBLIC_URL');
    return 1;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const onAllowlist = isOnAllowlist(phone);

    // Raw SQL because the row lives in the `axhy` schema and we want the
    // verbatim table shape (matches otp-store.ts reads).
    const rows = await prisma.$queryRawUnsafe<ActiveOtpRow[]>(
      `SELECT phone, code_hash, issued_at, expires_at, consumed
       FROM axhy.otp_attempts
       WHERE phone = $1
         AND consumed = false
         AND expires_at > NOW()
       ORDER BY issued_at DESC
       LIMIT 1`,
      phone,
    );

    console.log('---');
    console.log(`phone:                 ${phone}`);
    console.log(`bypass allowlist hit:  ${onAllowlist ? 'YES' : 'NO'}`);
    if (onAllowlist) {
      console.log(`magic code:            123456  (use this in the app, ignore WhatsApp)`);
    }
    console.log('---');

    if (rows.length === 0) {
      console.log('No active OTP row in axhy.otp_attempts.');
      console.log('  -> Either no Send OTP was tapped, the row already');
      console.log('     expired, or it was already consumed.');
      if (onAllowlist) {
        console.log('  -> But allowlist is active, so 123456 still works.');
        return 0;
      }
      console.log('  -> Tap Send OTP in the app first, then re-run.');
      return 1;
    }

    const row = rows[0];
    const now = Date.now();
    const secondsUntilExpiry = Math.max(0, Math.floor((row.expires_at.getTime() - now) / 1000));

    console.log('Active OTP row found:');
    console.log(`  issued_at (IST):     ${formatIst(row.issued_at)}`);
    console.log(`  expires_at (IST):    ${formatIst(row.expires_at)}`);
    console.log(`  seconds to expiry:   ${secondsUntilExpiry}`);
    console.log(`  code_hash (prefix):  ${row.code_hash.slice(0, 12)}...`);
    console.log('');
    console.log('NOTE: code_hash is bcrypt-style — the plaintext 6-digit code');
    console.log('cannot be recovered from the DB. Options:');
    console.log('  1. Receive the code via WhatsApp (normal flow).');
    if (onAllowlist) {
      console.log('  2. Use magic code 123456 (allowlist active for this phone).');
    } else {
      console.log('  2. Add this phone to AXHY_OTP_BYPASS_PHONES env var on');
      console.log('     the backend service, restart, then use magic 123456.');
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
