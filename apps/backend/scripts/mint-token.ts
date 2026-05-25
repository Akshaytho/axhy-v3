/**
 * Mint a short-lived access JWT for QA / smoke-test use.
 *
 * The script re-uses production `issueAccessToken` so any change to JWT shape
 * in `lib/jwt.ts` automatically applies. JWT_SECRET must already be in the
 * shell env — pull it via `railway run -- node -e "process.stdout.write(process.env.JWT_SECRET)"`
 * or via `set -a && source .env.local && set +a` before running.
 *
 * Token TTL is the production default (900s = 15 min). Outputs to stdout only.
 *
 * Usage:
 *   tsx scripts/mint-token.ts --user-id <uid> --company-id <cid> --role WORKER
 *   tsx scripts/mint-token.ts --user-id <uid> --company-id <cid> --role SUPERVISOR --locale en
 *
 * Roles: WORKER | SUPERVISOR | HR | COMPANY_ADMIN | SUPER_ADMIN
 *
 * @derives(ADR-0007)
 */

import { RoleSchema, type Role } from '@axhy/shared-schema';

import { issueAccessToken } from '../src/lib/jwt.js';

type Args = {
  userId: string;
  companyId: string;
  role: Role;
  locale: string;
};

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { locale?: string } = { locale: 'en' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (!flag || !val) continue;
    if (flag === '--user-id') {
      out.userId = val;
      i++;
    } else if (flag === '--company-id') {
      out.companyId = val;
      i++;
    } else if (flag === '--role') {
      const parsed = RoleSchema.safeParse(val);
      if (!parsed.success) {
        throw new Error(`--role must be one of ${RoleSchema.options.join('|')}; got "${val}"`);
      }
      out.role = parsed.data;
      i++;
    } else if (flag === '--locale') {
      out.locale = val;
      i++;
    }
  }
  if (!out.userId) throw new Error('--user-id is required');
  if (!out.companyId) throw new Error('--company-id is required');
  if (!out.role) throw new Error('--role is required');
  return out as Args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = await issueAccessToken({
    userId: args.userId,
    companyId: args.companyId,
    role: args.role,
    availableRoles: [args.role],
    locale: args.locale,
  });
  process.stdout.write(token);
}

main().catch((err) => {
  process.stderr.write(`[mint-token] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
