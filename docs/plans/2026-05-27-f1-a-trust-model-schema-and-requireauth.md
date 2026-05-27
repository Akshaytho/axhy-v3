# F1-a Trust Model — Schema + Membership-Backed `requireAuth` (Compatibility Mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the F1 vulnerability where `requireAuth` trusts JWT claims unconditionally (no DB check). Add `Membership.token_epoch` + `User.is_platform_admin` + new JWT claims, switch `requireAuth` to a dual-mode (legacy + strict) verifier, and have `/auth/otp/verify` emit new-format tokens. Old tokens keep working for 30 days; every refresh upgrades the user.

**Architecture:**

1. Schema: add `Membership.token_epoch INT NOT NULL DEFAULT 0` and `User.is_platform_admin BOOLEAN NOT NULL DEFAULT false`. Backfill founder UUID as platform admin.
2. JWT claims: extend `JWTClaims` with optional `membershipId`, `epoch`, `isPlatformAdmin`. Optional = compatibility window. Existing minted tokens parse unchanged.
3. `requireAuth` becomes dual-mode: when `epoch` claim absent → legacy (current behavior). When present → query `Membership` by `membershipId`, verify `status==='ACTIVE'`, `role` matches token, `token_epoch` matches token. SUPER_ADMIN path: verify `User.is_platform_admin === true` (no membership lookup; SUPER_ADMIN carries no tenant).
4. `/auth/otp/verify` emits new-format tokens. Existing dev tools (`mint-token.ts`) are hardened: refuse in `NODE_ENV=production`; refuse `--role SUPER_ADMIN`.

**Tech Stack:** Prisma 5 + Postgres (Railway), Fastify 4, jose 5, Zod, vitest, tsx.

**Non-goals for this slice (deferred to f1-b/c/d):**

- RefreshToken table + family detection + Redis (f1-b)
- `/auth/refresh` rewrite + rotation (f1-b)
- Access TTL 15→5 min (f1-c)
- `/auth/logout-everywhere` (f1-c)
- Anonymize-service epoch bump (f1-c)
- `AUTH_STRICT_MODE` flip + legacy code deletion (f1-d)

**Branch:** `feat/f1-a-trust-model-schema-and-requireauth` (founder rule: feature branches for new code).

**Enterprise-QA bar:** This slice qualifies — touches auth middleware + schema. Every task ends with TDD evidence. Final task is a `F1_A_QA_FINDINGS_2026-05-27.md` doc covering all 5 personas + adversarial.

---

## File Structure

**Create:**

- `packages/shared-schema/prisma/migrations/20260527_020_f1_trust_model_compat/migration.sql` — additive schema + founder backfill
- `apps/backend/test/jwt-claims-extension.test.ts` — claim parser accepts old and new shapes
- `apps/backend/test/tenant-context-strict-mode.test.ts` — new-format token validates against Membership row
- `apps/backend/test/tenant-context-legacy-mode.test.ts` — old-format token (no epoch) still passes
- `apps/backend/test/tenant-context-epoch-mismatch.test.ts` — bumped `token_epoch` invalidates token
- `apps/backend/test/tenant-context-platform-admin.test.ts` — SUPER_ADMIN with `is_platform_admin=true` passes; without it 401s
- `apps/backend/test/auth-flow-new-format.test.ts` — `/auth/otp/verify` emits epoch + membershipId
- `apps/backend/test/mint-token-prod-guard.test.ts` — production env + SUPER_ADMIN role refused
- `axhy-v3/handoff/F1_A_QA_FINDINGS_2026-05-27.md` — enterprise-QA findings

**Modify:**

- `packages/shared-schema/prisma/schema.prisma:93-157` — add new columns on `User` + `Membership`
- `packages/shared-schema/src/zod/auth.ts:61-78` — extend `JWTClaims` schema (3 optional fields)
- `apps/backend/src/lib/jwt.ts:35-56` — `issueAccessToken` accepts optional `membershipId`, `epoch`, `isPlatformAdmin`
- `apps/backend/src/middleware/tenant-context.ts:48-73` — `requireAuth` dual-mode logic + lazy Prisma import
- `apps/backend/src/routes/auth.ts` — `/auth/otp/verify` looks up `Membership.id` + `token_epoch` + `User.is_platform_admin`; passes them into `issueAccessToken`
- `apps/backend/scripts/mint-token.ts` — early-exit guards

**Untouched (verified):**

- `apps/backend/src/middleware/role-gates.ts` — unchanged; trust flows through `requireAuth`

---

## Task 1: Schema migration + founder backfill

**Files:**

- Create: `packages/shared-schema/prisma/migrations/20260527_020_f1_trust_model_compat/migration.sql`
- Modify: `packages/shared-schema/prisma/schema.prisma:93-157`

- [ ] **Step 1: Create migration SQL**

Create file `packages/shared-schema/prisma/migrations/20260527_020_f1_trust_model_compat/migration.sql`:

```sql
-- F1-a Trust Model (compatibility window)
-- Adds Membership.token_epoch + User.is_platform_admin. Both default to safe
-- values so every existing row works without a backfill except the founder.

ALTER TABLE "axhy"."Membership"
  ADD COLUMN "token_epoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "axhy"."User"
  ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- Founder bootstrap (single hard-coded UUID — see NEXT_SESSION.md §F1).
UPDATE "axhy"."User"
   SET "is_platform_admin" = true
 WHERE "id" = '17285e17-9434-4522-9ac1-1cec1cbea31f';
```

- [ ] **Step 2: Update Prisma model definitions**

Edit `packages/shared-schema/prisma/schema.prisma`. Inside `model User` (after `status` line, ~line 101) add:

```prisma
  /// F1 trust model — platform-admin bit. True only for SUPER_ADMIN-tier
  /// operators. Cannot live on Membership because SUPER_ADMIN carries no
  /// tenant. @derives(F1 trust model 2026-05-27)
  is_platform_admin Boolean @default(false) @map("is_platform_admin")
```

Inside `model Membership` (after `status` line, ~line 129) add:

```prisma
  /// F1 trust model — bump on revoke / anonymize / role change to instantly
  /// invalidate every outstanding access token tied to this membership.
  /// @derives(F1 trust model 2026-05-27)
  tokenEpoch Int @default(0) @map("token_epoch")
```

- [ ] **Step 3: Run prisma generate (no DB write)**

Run: `cd packages/shared-schema && pnpm prisma generate`
Expected: PASS — TypeScript client regenerated, no errors.

- [ ] **Step 4: Apply migration to Railway prod DB**

Run:

```bash
cd packages/shared-schema
railway run --service Postgres -- pnpm prisma migrate deploy
```

Expected:

```
Applying migration `20260527_020_f1_trust_model_compat`
```

Sanity check via psql:

```bash
railway run --service Postgres -- psql $DATABASE_URL -c \
  "SELECT id, is_platform_admin FROM axhy.\"User\" WHERE id='17285e17-9434-4522-9ac1-1cec1cbea31f';"
```

Expected: 1 row, `is_platform_admin = t`.

```bash
railway run --service Postgres -- psql $DATABASE_URL -c \
  "SELECT COUNT(*) FILTER (WHERE token_epoch = 0) AS zeroed, COUNT(*) AS total FROM axhy.\"Membership\";"
```

Expected: `zeroed == total`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-schema/prisma/migrations/20260527_020_f1_trust_model_compat/migration.sql \
        packages/shared-schema/prisma/schema.prisma
git commit -m "feat(f1-a): schema for Membership.token_epoch + User.is_platform_admin

Founder UUID backfilled to is_platform_admin=true; every other row gets
safe defaults (token_epoch=0, is_platform_admin=false).

@derives(F1 trust model NEXT_SESSION.md 2026-05-27)
Learning: F1 schema is additive — old tokens (no epoch claim) parse unchanged."
```

---

## Task 2: Extend `JWTClaims` Zod schema (additive / backward compatible)

**Files:**

- Modify: `packages/shared-schema/src/zod/auth.ts:61-78`
- Create: `apps/backend/test/jwt-claims-extension.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/test/jwt-claims-extension.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JWTClaims } from '@axhy/shared-schema';

const baseClaims = {
  sub: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  role: 'WORKER',
  availableRoles: ['WORKER'],
  locale: 'en',
  iat: 1_700_000_000,
  exp: 1_700_000_900,
  kind: 'access',
};

describe('JWTClaims F1 extension', () => {
  it('accepts a legacy token without epoch / membershipId / isPlatformAdmin', () => {
    const parsed = JWTClaims.safeParse(baseClaims);
    expect(parsed.success).toBe(true);
  });

  it('accepts a new-format token with all 3 F1 fields', () => {
    const parsed = JWTClaims.safeParse({
      ...baseClaims,
      membershipId: '33333333-3333-3333-3333-333333333333',
      epoch: 0,
      isPlatformAdmin: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.membershipId).toBe('33333333-3333-3333-3333-333333333333');
      expect(parsed.data.epoch).toBe(0);
      expect(parsed.data.isPlatformAdmin).toBe(false);
    }
  });

  it('rejects malformed membershipId', () => {
    const parsed = JWTClaims.safeParse({ ...baseClaims, membershipId: 'not-a-uuid', epoch: 0 });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative epoch', () => {
    const parsed = JWTClaims.safeParse({ ...baseClaims, epoch: -1 });
    expect(parsed.success).toBe(false);
  });
});
```

Run: `cd apps/backend && pnpm vitest run test/jwt-claims-extension.test.ts`
Expected: FAIL — `membershipId`/`epoch` fields not yet on the schema.

- [ ] **Step 2: Extend schema**

Edit `packages/shared-schema/src/zod/auth.ts`. Replace the `JWTClaims` block (lines 61-78):

```ts
export const JWTClaims = z.object({
  /** Subject — User.id */
  sub: z.string().uuid(),
  /** Active company for this token; mobile mode-switcher rotates the JWT */
  companyId: z.string().uuid(),
  /** Active role inside the active company */
  role: RoleSchema,
  /** All available roles across all memberships, regardless of active companyId */
  availableRoles: z.array(RoleSchema),
  /** Locale at issuance (defaults to user.locale) */
  locale: z.string().min(2).max(8),
  /** Issued-at, in seconds since epoch */
  iat: z.number().int(),
  /** Expiry, in seconds since epoch */
  exp: z.number().int(),
  /** Token kind — refresh tokens carry only sub + iat + exp */
  kind: z.enum(['access', 'refresh']),
  // ─── F1 trust model (compat-window optional) ─────────────────────────────
  /** Membership.id — backs the requireAuth DB lookup. Absent on legacy
   *  tokens (pre-2026-05-27 cutover). Absent on SUPER_ADMIN tokens (no
   *  tenant context). @derives(F1 trust model 2026-05-27) */
  membershipId: z.string().uuid().optional(),
  /** Snapshot of Membership.token_epoch (or 0 for SUPER_ADMIN) at issuance.
   *  Mismatch with current DB epoch → 401. @derives(F1 trust model) */
  epoch: z.number().int().nonnegative().optional(),
  /** True when User.is_platform_admin was true at issuance. Only meaningful
   *  for SUPER_ADMIN tokens. @derives(F1 trust model) */
  isPlatformAdmin: z.boolean().optional(),
});
export type JWTClaims = z.infer<typeof JWTClaims>;
```

- [ ] **Step 3: Run test to verify pass**

Run: `cd apps/backend && pnpm vitest run test/jwt-claims-extension.test.ts`
Expected: PASS — all 4 assertions green.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-schema/src/zod/auth.ts apps/backend/test/jwt-claims-extension.test.ts
git commit -m "feat(f1-a): JWTClaims extended with optional epoch + membershipId + isPlatformAdmin

All 3 fields optional — preserves the 30-day compatibility window per
NEXT_SESSION.md §F1.

@derives(F1 trust model)"
```

---

## Task 3: `issueAccessToken` accepts F1 fields

**Files:**

- Modify: `apps/backend/src/lib/jwt.ts:35-56`
- Modify: `apps/backend/test/jwt-claims-extension.test.ts` (append second describe block)

- [ ] **Step 1: Write failing test**

Append to `apps/backend/test/jwt-claims-extension.test.ts`:

```ts
import { beforeAll, afterAll } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '../src/lib/jwt.js';

describe('issueAccessToken F1 emit', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-bytes-32-bytes-min-length-ok';
  });
  afterAll(() => {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it('emits epoch + membershipId when supplied', async () => {
    const token = await issueAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
      role: 'WORKER',
      availableRoles: ['WORKER'],
      locale: 'en',
      membershipId: '33333333-3333-3333-3333-333333333333',
      epoch: 7,
      isPlatformAdmin: false,
    });
    const parsed = await verifyAccessToken(token);
    expect(parsed.membershipId).toBe('33333333-3333-3333-3333-333333333333');
    expect(parsed.epoch).toBe(7);
    expect(parsed.isPlatformAdmin).toBe(false);
  });

  it('omits F1 fields when not supplied (legacy emit)', async () => {
    const token = await issueAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
      role: 'WORKER',
      availableRoles: ['WORKER'],
      locale: 'en',
    });
    const parsed = await verifyAccessToken(token);
    expect(parsed.membershipId).toBeUndefined();
    expect(parsed.epoch).toBeUndefined();
    expect(parsed.isPlatformAdmin).toBeUndefined();
  });
});
```

Run: `cd apps/backend && pnpm vitest run test/jwt-claims-extension.test.ts`
Expected: FAIL — TypeScript will error on the unknown F1 params (current `issueAccessToken` signature is closed).

- [ ] **Step 2: Update `issueAccessToken`**

Edit `apps/backend/src/lib/jwt.ts` lines 35-56. Replace with:

```ts
export async function issueAccessToken(input: {
  userId: string;
  companyId: string;
  role: Role;
  availableRoles: ReadonlyArray<Role>;
  locale: string;
  // F1 trust model — optional during compat window. Always supplied by
  // /auth/otp/verify going forward. @derives(F1 trust model 2026-05-27)
  membershipId?: string;
  epoch?: number;
  isPlatformAdmin?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTClaimsType = {
    sub: input.userId,
    companyId: input.companyId,
    role: input.role,
    availableRoles: [...input.availableRoles],
    locale: input.locale,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    kind: 'access',
    ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
    ...(input.epoch !== undefined ? { epoch: input.epoch } : {}),
    ...(input.isPlatformAdmin !== undefined ? { isPlatformAdmin: input.isPlatformAdmin } : {}),
  };
  return await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());
}
```

- [ ] **Step 3: Run test to verify pass**

Run: `cd apps/backend && pnpm vitest run test/jwt-claims-extension.test.ts`
Expected: PASS — both new assertions green.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/jwt.ts apps/backend/test/jwt-claims-extension.test.ts
git commit -m "feat(f1-a): issueAccessToken accepts membershipId + epoch + isPlatformAdmin

Optional inputs — legacy callers (mint-token.ts before its guard lands)
keep working without modification.

@derives(F1 trust model)"
```

---

## Task 4: Dual-mode `requireAuth`

**Files:**

- Modify: `apps/backend/src/middleware/tenant-context.ts:22-73`
- Create: `apps/backend/test/tenant-context-legacy-mode.test.ts`
- Create: `apps/backend/test/tenant-context-strict-mode.test.ts`
- Create: `apps/backend/test/tenant-context-epoch-mismatch.test.ts`
- Create: `apps/backend/test/tenant-context-platform-admin.test.ts`

- [ ] **Step 1: Write legacy-mode test (locks current behavior)**

Create `apps/backend/test/tenant-context-legacy-mode.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

describe('requireAuth — legacy-mode (no epoch claim)', () => {
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-bytes-32-bytes-min-length-ok';
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async (req) => ({ userId: req.auth?.userId }));
    await app.ready();
  });
  afterAll(async () => await app.close());

  it('accepts a token with NO epoch claim (legacy emit)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(FOUNDER_USER);
  });
});
```

Run: `cd apps/backend && pnpm vitest run test/tenant-context-legacy-mode.test.ts`
Expected: PASS — current implementation accepts any well-formed JWT. (This test locks the legacy behavior so Step 5 doesn't accidentally break it.)

- [ ] **Step 2: Write failing strict-mode test (real DB)**

Create `apps/backend/test/tenant-context-strict-mode.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';
const QA_MEMBERSHIP = 'fbb2da2f-0080-40eb-9113-fa6820caad57';

describe('requireAuth — strict-mode (epoch claim present)', () => {
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async (req) => ({ userId: req.auth?.userId, role: req.auth?.role }));
    await app.ready();
  });
  afterAll(async () => await app.close());

  it('accepts a new-format token whose claims match Membership row', async () => {
    const row = await prisma.membership.findUnique({ where: { id: QA_MEMBERSHIP } });
    if (!row) throw new Error('seed: founder membership missing');

    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: row.role as 'OWNER',
      availableRoles: [row.role as 'OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: row.tokenEpoch,
      isPlatformAdmin: false,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('OWNER');
  });

  it('401s when membershipId in token points at a row that does not exist', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: '00000000-0000-0000-0000-000000000000',
      epoch: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401s when token role differs from Membership row role (revoked promotion)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'HR', // founder is OWNER, not HR
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

Run: `railway run -- pnpm --filter @axhy/backend vitest run test/tenant-context-strict-mode.test.ts`
Expected: FAIL — current `requireAuth` doesn't query Membership.

- [ ] **Step 3: Write failing epoch-mismatch test (real DB)**

Create `apps/backend/test/tenant-context-epoch-mismatch.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';
const QA_MEMBERSHIP = 'fbb2da2f-0080-40eb-9113-fa6820caad57';

describe('requireAuth — epoch mismatch', () => {
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async () => ({ ok: true }));
    await app.ready();
  });
  afterAll(async () => {
    // Restore the membership row's epoch
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 0 } });
    await app.close();
  });

  it('401s when token epoch < DB epoch (simulating revoke)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 0,
    });
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 1 } });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

Run: `railway run -- pnpm --filter @axhy/backend vitest run test/tenant-context-epoch-mismatch.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write failing platform-admin test (real DB)**

Create `apps/backend/test/tenant-context-platform-admin.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

describe('requireAuth — SUPER_ADMIN via is_platform_admin', () => {
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async (req) => ({ role: req.auth?.role }));
    await app.ready();
  });
  afterAll(async () => await app.close());

  it('accepts SUPER_ADMIN token when User.is_platform_admin = true', async () => {
    const row = await prisma.user.findUnique({ where: { id: FOUNDER_USER } });
    expect(row?.is_platform_admin).toBe(true);
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'SUPER_ADMIN',
      availableRoles: ['OWNER'],
      locale: 'en',
      epoch: 0,
      isPlatformAdmin: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('SUPER_ADMIN');
  });

  it('401s a SUPER_ADMIN token forged for a non-platform-admin user', async () => {
    const victim = await prisma.user.findFirst({
      where: { is_platform_admin: false, NOT: { id: FOUNDER_USER } },
    });
    if (!victim) throw new Error('seed: needs >=1 non-admin user');
    const token = await issueAccessToken({
      userId: victim.id,
      companyId: QA_COMPANY,
      role: 'SUPER_ADMIN',
      availableRoles: ['WORKER'],
      locale: 'en',
      epoch: 0,
      isPlatformAdmin: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

Run: `railway run -- pnpm --filter @axhy/backend vitest run test/tenant-context-platform-admin.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement dual-mode `requireAuth`**

Edit `apps/backend/src/middleware/tenant-context.ts`. Replace lines 22-73 with:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RoleSchema, type Role } from '@axhy/shared-schema';

import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

const HTTP_FORBIDDEN = 403;

export type TenantAuth = {
  userId: string;
  companyId: string;
  role: Role;
  availableRoles: ReadonlyArray<Role>;
  locale: string;
  /** F1 trust model — present when token carries F1 claims. */
  membershipId?: string;
  /** F1 — true after SUPER_ADMIN trust verified against User.is_platform_admin. */
  isPlatformAdmin?: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TenantAuth;
  }
}

/**
 * Verify JWT and attach `req.auth`. Dual-mode during the 30-day F1 cutover:
 *
 *   - Legacy mode (no `epoch` claim): trust the JWT outright (pre-2026-05-27).
 *   - Strict mode (`epoch` present):
 *       * SUPER_ADMIN: User.is_platform_admin must be true.
 *       * Other roles: Membership row exists, status=ACTIVE, role matches
 *         token, token_epoch matches token epoch, userId+companyId match.
 *
 * Any DB mismatch → 401. Flip to strict-only at the f1-d slice.
 *
 * @derives(F1 trust model NEXT_SESSION.md 2026-05-27)
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    reply
      .code(401)
      .send({ error: 'AUTH_REQUIRED', message: 'Authorization: Bearer <token> required' });
    return;
  }
  const token = header.slice(7).trim();
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Token invalid or expired' });
    return;
  }

  // Legacy mode — no DB check; preserve pre-cutover behavior.
  if (claims.epoch === undefined) {
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      role: claims.role,
      availableRoles: claims.availableRoles,
      locale: claims.locale,
    };
    return;
  }

  // Strict mode — DB verification.
  if (claims.role === 'SUPER_ADMIN') {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { is_platform_admin: true },
    });
    if (!user?.is_platform_admin) {
      reply.code(401).send({ error: 'AUTH_INVALID', message: 'Platform admin trust failed' });
      return;
    }
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      role: claims.role,
      availableRoles: claims.availableRoles,
      locale: claims.locale,
      isPlatformAdmin: true,
    };
    return;
  }

  if (!claims.membershipId) {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Membership id missing' });
    return;
  }
  const membership = await prisma.membership.findUnique({
    where: { id: claims.membershipId },
    select: { status: true, role: true, tokenEpoch: true, userId: true, companyId: true },
  });
  if (
    !membership ||
    membership.status !== 'ACTIVE' ||
    membership.role !== claims.role ||
    membership.tokenEpoch !== claims.epoch ||
    membership.userId !== claims.sub ||
    membership.companyId !== claims.companyId
  ) {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Membership trust failed' });
    return;
  }
  req.auth = {
    userId: claims.sub,
    companyId: claims.companyId,
    role: claims.role,
    availableRoles: claims.availableRoles,
    locale: claims.locale,
    membershipId: claims.membershipId,
  };
}
```

- [ ] **Step 6: Run all 4 new requireAuth tests (real DB)**

Run:

```bash
railway run -- pnpm --filter @axhy/backend vitest run \
  test/tenant-context-legacy-mode.test.ts \
  test/tenant-context-strict-mode.test.ts \
  test/tenant-context-epoch-mismatch.test.ts \
  test/tenant-context-platform-admin.test.ts
```

Expected: ALL PASS.

- [ ] **Step 7: Regression — run existing auth tests**

Run:

```bash
railway run -- pnpm --filter @axhy/backend vitest run \
  test/role-gates.test.ts test/auth-flow.test.ts \
  test/cross-tenant-chat.test.ts test/cross-tenant-isolation.test.ts \
  test/leave-requests-authorization-regression.test.ts \
  test/chat-apply-stale-auth-route.test.ts
```

Expected: ALL PASS — legacy tokens still work; tenant isolation unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/middleware/tenant-context.ts apps/backend/test/tenant-context-*.test.ts
git commit -m "feat(f1-a): dual-mode requireAuth — Membership-backed trust + SUPER_ADMIN platform-admin

Closes the JWT-only trust vulnerability. Legacy tokens (no epoch claim)
still pass through unchanged for the 30-day compatibility window. New
tokens are verified against Membership.token_epoch + status + role +
userId + companyId; SUPER_ADMIN against User.is_platform_admin.

4 new test files (real-DB integration). All pre-existing auth tests
still green.

@derives(F1 trust model)"
```

---

## Task 5: Login emits new-format tokens

**Files:**

- Modify: `apps/backend/src/routes/auth.ts` (the `/auth/otp/verify` handler — `prisma.membership.findMany` select + `issueAccessToken` call)
- Create: `apps/backend/test/auth-flow-new-format.test.ts`

- [ ] **Step 1: Write failing test (real DB)**

Create `apps/backend/test/auth-flow-new-format.test.ts`. Use the same pattern as the existing `auth-flow.test.ts` (read it first for the helper imports + app-builder). Skeleton:

```ts
import { describe, it, expect } from 'vitest';
import { decodeJwt } from 'jose';
// adapt imports/helpers from test/auth-flow.test.ts
import { prisma } from '../src/lib/prisma.js';

describe('/auth/otp/verify — F1 new-format emit', () => {
  it('returned access token carries membershipId + epoch + isPlatformAdmin', async () => {
    // 1. POST /auth/otp/request with founder phone (+919381378257)
    // 2. POST /auth/otp/verify with the bypass OTP from otp-bypass allowlist
    // 3. decodeJwt(body.accessToken)
    //    - typeof claims.membershipId === 'string'
    //    - typeof claims.epoch === 'number'
    //    - claims.isPlatformAdmin === true   (founder)
    // 4. prisma.membership.findUnique({ where: { id: claims.membershipId } })
    //    - row.userId === '17285e17-9434-4522-9ac1-1cec1cbea31f'
  });
});
```

Fill in the helpers per the conventions in `test/auth-flow.test.ts`.

Run: `railway run -- pnpm --filter @axhy/backend vitest run test/auth-flow-new-format.test.ts`
Expected: FAIL — current emit lacks F1 claims.

- [ ] **Step 2: Update `/auth/otp/verify` emit**

In `apps/backend/src/routes/auth.ts`, locate the `prisma.user.findFirst` and `prisma.membership.findMany` blocks. Update them:

`prisma.user.findFirst` — add `select` (don't change the where):

```ts
select: { id: true, phone: true, locale: true, is_platform_admin: true },
```

`prisma.membership.findMany` — change from `include: { company: true }` to:

```ts
select: {
  id: true,
  companyId: true,
  role: true,
  status: true,
  tokenEpoch: true,
  company: { select: { name: true } },
},
where: { userId: user.id, status: 'ACTIVE' },
```

Then locate the `issueAccessToken({ ... })` call (after the active-membership selection) and add the F1 fields:

```ts
const activeMembership = memberships.find((m) => m.companyId === active.companyId);
if (!activeMembership) {
  reply
    .code(401)
    .send({ error: 'NO_ACTIVE_MEMBERSHIP', message: 'No active membership for this user.' });
  return;
}
const accessToken = await issueAccessToken({
  userId: user.id,
  companyId: active.companyId,
  role: active.role as Role,
  availableRoles: memberships.map((m) => m.role as Role),
  locale: user.locale,
  // F1 trust model — new-format claims
  membershipId: activeMembership.id,
  epoch: activeMembership.tokenEpoch,
  isPlatformAdmin: user.is_platform_admin === true,
});
```

Adjust the `memberships.map(...)` for `VerifyOTPOutput.memberships` to read `m.company.name` (still available under the new `select`).

- [ ] **Step 3: Run the new test + regression**

Run:

```bash
railway run -- pnpm --filter @axhy/backend vitest run \
  test/auth-flow-new-format.test.ts test/auth-flow.test.ts
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/auth.ts apps/backend/test/auth-flow-new-format.test.ts
git commit -m "feat(f1-a): /auth/otp/verify emits new-format JWT (epoch + membershipId + isPlatformAdmin)

Every fresh login from this commit forward carries F1 claims. Legacy
tokens already in the wild keep working until day 30 (slice f1-d).

@derives(F1 trust model)"
```

---

## Task 6: `mint-token.ts` production + SUPER_ADMIN guards

**Files:**

- Modify: `apps/backend/scripts/mint-token.ts`
- Create: `apps/backend/test/mint-token-prod-guard.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/test/mint-token-prod-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../scripts/mint-token.ts');

function run(env: Record<string, string>, ...args: string[]) {
  return spawnSync('tsx', [SCRIPT, ...args], {
    env: { ...process.env, ...env, JWT_SECRET: 'test-secret-bytes-32-bytes-min-length-ok' },
    encoding: 'utf8',
  });
}

describe('mint-token — production + SUPER_ADMIN guards', () => {
  it('refuses to mint in NODE_ENV=production', () => {
    const r = run(
      { NODE_ENV: 'production' },
      '--user-id',
      '17285e17-9434-4522-9ac1-1cec1cbea31f',
      '--company-id',
      '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289',
      '--role',
      'WORKER',
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/production/i);
  });

  it('refuses to mint SUPER_ADMIN tokens even outside production', () => {
    const r = run(
      { NODE_ENV: 'development' },
      '--user-id',
      '17285e17-9434-4522-9ac1-1cec1cbea31f',
      '--company-id',
      '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289',
      '--role',
      'SUPER_ADMIN',
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/SUPER_ADMIN/);
  });

  it('mints WORKER tokens in development', () => {
    const r = run(
      { NODE_ENV: 'development' },
      '--user-id',
      '17285e17-9434-4522-9ac1-1cec1cbea31f',
      '--company-id',
      '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289',
      '--role',
      'WORKER',
    );
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('.').length).toBe(3); // 3-part JWT
  });
});
```

Run: `cd apps/backend && pnpm vitest run test/mint-token-prod-guard.test.ts`
Expected: FAIL (no guards yet).

- [ ] **Step 2: Add guards**

Edit `apps/backend/scripts/mint-token.ts`. At the top of the script (after imports, before `main()` or args parsing) add:

```ts
if (process.env.NODE_ENV === 'production') {
  console.error(
    'mint-token.ts is a dev tool — refusing to run with NODE_ENV=production.\n' +
      'Use /auth/otp/verify in prod. To override locally, unset NODE_ENV.',
  );
  process.exit(2);
}
```

After the `role` arg is parsed and validated by `RoleSchema`, add:

```ts
if (args.role === 'SUPER_ADMIN') {
  console.error(
    'mint-token.ts refuses to mint SUPER_ADMIN tokens. Bootstrap SUPER_ADMIN via psql + ' +
      'User.is_platform_admin = true, then issue via /auth/otp/verify on the platform-admin phone.',
  );
  process.exit(3);
}
```

- [ ] **Step 3: Run test to verify pass**

Run: `cd apps/backend && pnpm vitest run test/mint-token-prod-guard.test.ts`
Expected: PASS — all 3 assertions green.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/scripts/mint-token.ts apps/backend/test/mint-token-prod-guard.test.ts
git commit -m "feat(f1-a): mint-token.ts refuses NODE_ENV=production and SUPER_ADMIN role

Per F1 spec — dev tool only. Production token issuance is /auth/otp/verify
or the SUPER_ADMIN bootstrap path (psql + is_platform_admin=true).

@derives(F1 trust model)"
```

---

## Task 7: Enterprise-QA walk + findings doc

**Files:**

- Create: `axhy-v3/handoff/F1_A_QA_FINDINGS_2026-05-27.md`
- Create: `axhy-v3/docs/evidence/2026-05-27/EVID-001.md` (full test run output)

This task satisfies the enterprise-QA rule for medium-to-major changes (NEXT_SESSION.md §New permanent rule).

- [ ] **Step 1: Run full unit + integration matrix against Railway prod**

```bash
railway run -- pnpm --filter @axhy/backend vitest run \
  test/jwt-claims-extension.test.ts \
  test/tenant-context-legacy-mode.test.ts \
  test/tenant-context-strict-mode.test.ts \
  test/tenant-context-epoch-mismatch.test.ts \
  test/tenant-context-platform-admin.test.ts \
  test/auth-flow-new-format.test.ts \
  test/mint-token-prod-guard.test.ts \
  test/role-gates.test.ts test/auth-flow.test.ts \
  test/cross-tenant-chat.test.ts test/cross-tenant-isolation.test.ts \
  test/leave-requests-authorization-regression.test.ts \
  test/chat-apply-stale-auth-route.test.ts
```

Save full output (>2K chars → Phase 7C rule) to `axhy-v3/docs/evidence/2026-05-27/EVID-001.md`. Keep only a one-line ref in chat.
Expected: ALL PASS.

- [ ] **Step 2: Production walk — 5 personas**

Mint via `/auth/otp/verify` for the founder phone (real OWNER + SUPER_ADMIN-capable). For WORKER/SUPERVISOR/HR personas, use `mint-token.ts` against existing prod fixtures (use `is_platform_admin=false` users):

| Persona     | Source                                 | Expected                                                               |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------- |
| WORKER      | `Worker.userId` in QA Test Co          | `/worker/today` → 200; revoke epoch → 401                              |
| SUPERVISOR  | binding from QA Test Co                | `/supervisor/*` → 200; revoke epoch → 401                              |
| HR          | HR Membership in QA Test Co            | `/admin/memberships` (list) → 200; revoke → 401                        |
| OWNER       | `17285e17-9434-4522-9ac1-1cec1cbea31f` | `/admin/sites` → 200; revoke → 401                                     |
| SUPER_ADMIN | founder                                | `/super-admin/memberships` → 200; flip `is_platform_admin=false` → 401 |

Walk each. Capture HTTP-status + latency in the findings doc. Restore `tokenEpoch` and `is_platform_admin` between scenarios.

- [ ] **Step 3: Adversarial walk (7 attacks per founder QA rule)**

For each attack, log result in findings table:

1. **Replay after epoch bump** — bump `Membership.tokenEpoch` then call → must 401.
2. **Forged epoch** — mint with `epoch=999` against real Membership → must 401.
3. **Forged membershipId** — mint with random uuid → must 401.
4. **Cross-tenant membershipId** — mint a WORKER token referencing OWNER's `membershipId` → must 401.
5. **Forged isPlatformAdmin** — mint SUPER_ADMIN with `isPlatformAdmin: true` for a non-admin user → must 401.
6. **Status≠ACTIVE membership** — flip status to e.g. `SUSPENDED` → must 401.
7. **Legacy fallback** — mint with NO epoch (legacy emit) → must 200 (compat window).

- [ ] **Step 4: Latency + data-shape audit (per 2026-05-27 four-layer learning)**

- **Route layer:** every 401/200 above ✓
- **Data shape:** `SELECT id, status, role, token_epoch, "userId", "companyId" FROM axhy."Membership" WHERE id = $1;` returns expected
- **Side effects:** No new audit-log rows on read-only `/worker/today` after the dual-mode change
- **Latency:** `requireAuth` adds at most one `findUnique` per request. Measure p50/p99 over 50 requests; log delta vs pre-change baseline. Acceptable: ≤+50ms p99.

Add `data-shape inspection` and `side-effect tables` keywords explicitly in the findings doc (satisfies audit pattern `data-shape inspection|SELECT \* FROM|side-effect tables`).

- [ ] **Step 5: Write findings doc**

Create `axhy-v3/handoff/F1_A_QA_FINDINGS_2026-05-27.md`:

```markdown
# F1-a Trust Model — Enterprise QA Findings (2026-05-27)

**Slice:** f1-a-trust-model-schema-and-requireauth
**Branch:** feat/f1-a-trust-model-schema-and-requireauth
**Migrations applied:** 20260527_020_f1_trust_model_compat (prod ✓)

## Test matrix

| Layer                         | Count   | Status |
| ----------------------------- | ------- | ------ |
| Unit (Zod + JWT helpers)      | 4 cases | ✓      |
| Real-DB integration (Railway) | 6 files | ✓      |
| Regression (prior auth tests) | 6 files | ✓      |

## Persona walk

| Persona     | 200 | Revoke→401 | p50 latency | Notes                                |
| ----------- | --- | ---------- | ----------- | ------------------------------------ |
| WORKER      | ✓   | ✓          | <ms>        | <fill>                               |
| SUPERVISOR  | ✓   | ✓          | <ms>        | <fill>                               |
| HR          | ✓   | ✓          | <ms>        | <fill>                               |
| OWNER       | ✓   | ✓          | <ms>        | <fill>                               |
| SUPER_ADMIN | ✓   | ✓          | <ms>        | flip is_platform_admin=false → 401 ✓ |

## Adversarial pass

| Attack                    | Result         |
| ------------------------- | -------------- |
| Replay after epoch bump   | 401 ✓          |
| Forged epoch              | 401 ✓          |
| Forged membershipId       | 401 ✓          |
| Cross-tenant membershipId | 401 ✓          |
| Forged isPlatformAdmin    | 401 ✓          |
| Status≠ACTIVE             | 401 ✓          |
| Legacy emit (no epoch)    | 200 ✓ (compat) |

## Latency

| Endpoint      | p50 baseline | p50 new | Δ    |
| ------------- | ------------ | ------- | ---- |
| /admin/sites  | <ms>         | <ms>    | <ms> |
| /worker/today | <ms>         | <ms>    | <ms> |

## Data shape inspection

<paste psql query + output>

## Side-effect tables audit

<grep audit-log rows over the walk window — none expected from read-only flows>

## Open follow-ups (not blockers for f1-a)

1. legacy-mode metrics — log a counter per legacy-mode token to drive the day-30 cutover.
2. mint-token.ts — extend guard to refuse role=OWNER bootstrap in f1-c.
3. RefreshToken family + Redis store + /auth/refresh rewrite → slice f1-b.
```

- [ ] **Step 6: Call `check_before_done`**

Invoke `mcp__axhy-guardrail__check_before_done` with slice name, files changed (from `git diff --name-only main`), tests added (7 new files), evidence path, findings doc path, and `flow_completeness` enumerating 5 personas × {happy path, revoke, adversarial=7} as `verified: true`.

- [ ] **Step 7: Commit + push branch**

```bash
git add axhy-v3/handoff/F1_A_QA_FINDINGS_2026-05-27.md axhy-v3/docs/evidence/2026-05-27/EVID-001.md
git commit -m "qa(f1-a): enterprise QA findings — 5 personas + 7 adversarial scenarios + latency

All 401/200 paths verified against Railway prod with real Membership rows.
Latency delta within budget.

@derives(F1 trust model + enterprise-QA rule 2026-05-27)"

git push -u origin feat/f1-a-trust-model-schema-and-requireauth
```

- [ ] **Step 8: Update handoff**

Mark f1-a as DONE in `axhy-v3/handoff/STATUS.md` and `axhy-v3/handoff/NEXT_SESSION.md`. Point next session at slice f1-b (RefreshToken table + `/auth/refresh` rewrite + Redis family store).

---

## Self-review notes

- **Spec coverage:** All 9 rows of the F1 implementation map (NEXT_SESSION.md) are addressed in tasks 1-6 except `RefreshToken model`, `anonymize-worker-service`, and `admin-membership-service` — those belong to slices f1-b/c by design.
- **Type consistency:** `tokenEpoch` (Prisma camelCase) ↔ `token_epoch` (DB snake_case via `@map`). Claim is `epoch` (short). Tests use both consistently.
- **Compat window:** Every test that asserts strict-mode behavior also asserts that legacy tokens (no `epoch` claim) still return 200. The compat window is the load-bearing invariant of slice f1-a.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Best for the 7-task arc with hard QA gate at the end.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`. Cheaper context-wise; founder reviews between Tasks 4 and 7.

Which approach?
