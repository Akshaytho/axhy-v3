# HR A1 Thin Admin-Web Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working HR-portal in `apps/admin-web` over the already-shipped R1-R5 backend routes plus a refined leave-decide hook so an HR user can perform the seven core HR operations end-to-end through the UI alone, with real-DB integration tests and a Playwright E2E water-flow that satisfies the QA Enterprise Walk SOP.

**Architecture:** Next.js 15 app-router server components for reads, server actions for writes, httpOnly cookies for JWT, server-side role gate at `/hr/layout.tsx`. Backend gains GET handlers with HR pod scoping for read-back and a refined `requireRole('SUPERVISOR','HR')` + pod-ownership check on leave-decide. Forms use `useActionState`; only the form is client, page stays server. Tokens never reach browser JS.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Fastify, Prisma, Zod, Vitest (backend), Playwright (E2E), pnpm workspaces (Turborepo), `@axhy/ui-tokens` for styling, jose for JWT verification on the admin-web edge.

**Spec:** `docs/superpowers/specs/2026-05-29-hr-a1-thin-portal-design.md` (commit `41074e7`).

**Branch:** `feat/hr-a1-thin-portal` (off `origin/main`).

---

## File Structure

### Created

- `packages/jwt-public/package.json`
- `packages/jwt-public/tsconfig.json`
- `packages/jwt-public/src/index.ts`
- `packages/jwt-public/src/verify.ts`
- `packages/jwt-public/src/verify.test.ts`
- `apps/backend/src/middleware/pod-scope.ts`
- `apps/backend/src/middleware/pod-scope.test.ts`
- `apps/backend/test/admin-memberships-get.test.ts`
- `apps/backend/test/admin-workers-get.test.ts`
- `apps/backend/test/admin-sites-get.test.ts`
- `apps/backend/test/leave-requests-hr-gate.test.ts`
- `apps/admin-web/lib/auth.ts`
- `apps/admin-web/lib/api.ts`
- `apps/admin-web/lib/zod-helpers.ts`
- `apps/admin-web/app/api/auth/session/route.ts`
- `apps/admin-web/app/forbidden/page.tsx`
- `apps/admin-web/app/hr/layout.tsx`
- `apps/admin-web/app/hr/error.tsx`
- `apps/admin-web/app/hr/page.tsx`
- `apps/admin-web/app/hr/hr.module.css`
- `apps/admin-web/app/hr/Nav.tsx`
- `apps/admin-web/app/hr/memberships/page.tsx`
- `apps/admin-web/app/hr/memberships/styles.module.css`
- `apps/admin-web/app/hr/memberships/new/page.tsx`
- `apps/admin-web/app/hr/memberships/new/InviteForm.tsx`
- `apps/admin-web/app/hr/memberships/new/actions.ts`
- `apps/admin-web/app/hr/workers/page.tsx`
- `apps/admin-web/app/hr/workers/styles.module.css`
- `apps/admin-web/app/hr/workers/new/page.tsx`
- `apps/admin-web/app/hr/workers/new/WorkerForm.tsx`
- `apps/admin-web/app/hr/workers/new/actions.ts`
- `apps/admin-web/app/hr/workers/[id]/page.tsx`
- `apps/admin-web/app/hr/workers/[id]/AnonymizeButton.tsx`
- `apps/admin-web/app/hr/workers/[id]/actions.ts`
- `apps/admin-web/app/hr/sites/page.tsx`
- `apps/admin-web/app/hr/sites/styles.module.css`
- `apps/admin-web/app/hr/sites/new/page.tsx`
- `apps/admin-web/app/hr/sites/new/SiteForm.tsx`
- `apps/admin-web/app/hr/sites/new/actions.ts`
- `apps/admin-web/app/hr/sites/[id]/page.tsx`
- `apps/admin-web/app/hr/sites/[id]/bindings/new/page.tsx`
- `apps/admin-web/app/hr/sites/[id]/bindings/new/BindingForm.tsx`
- `apps/admin-web/app/hr/sites/[id]/bindings/new/actions.ts`
- `apps/admin-web/app/hr/leave-requests/page.tsx`
- `apps/admin-web/app/hr/leave-requests/styles.module.css`
- `apps/admin-web/app/hr/leave-requests/[id]/page.tsx`
- `apps/admin-web/app/hr/leave-requests/[id]/DecideButtons.tsx`
- `apps/admin-web/app/hr/leave-requests/[id]/actions.ts`
- `apps/admin-web/e2e/hr-water-flow.spec.ts`
- `apps/admin-web/playwright.config.ts` (if missing)
- `docs/evidence/2026-05-29/EVID-HR-A1-QA.md`

### Modified

- `apps/backend/src/routes/admin-memberships.ts` (add GET list)
- `apps/backend/src/routes/admin-workers.ts` (add GET list + detail)
- `apps/backend/src/routes/admin-sites.ts` (add GET list + detail + bindings list)
- `apps/backend/src/routes/leave-requests.ts` (add GET inbox + refine decide gate)
- `apps/backend/src/lib/jwt.ts` (ensure `userId` in access-token payload)
- `apps/admin-web/app/login/page.tsx` (extract tokens, POST to session route, redirect by role)
- `apps/admin-web/package.json` (add jose + zod + @axhy/jwt-public deps)
- `apps/admin-web/next.config.ts` (transpile @axhy/jwt-public)
- `pnpm-workspace.yaml` (add packages/jwt-public if not already wildcarded)

---

## Cross-cutting conventions

- Every backend test file ends in `_test.ts` or lives under `apps/backend/test/`. Use `import { describe, it, expect, beforeEach, afterEach } from 'vitest';` and the existing `createTestApp()` helper if present; if not, use `Fastify().inject()` directly.
- Every backend GET handler uses `requireRole(...)` preHandler, reads `req.auth.companyId` and `req.auth.userId`, and applies pod scoping via `getMyPodIds` when role is HR.
- Cursor format: `Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url')`. Decode and validate before use. Reject malformed cursors with 400 `CURSOR_INVALID`.
- Every admin-web server action uses the discriminated union `FormState = { ok: true; data?: unknown } | { ok: false; code: string; message: string; fields?: Record<string, string> }`.
- Every admin-web page that touches HR data calls `await requireRole('HR')` first.
- `@axhy/ui-tokens` already provides CSS variables; reuse `var(--color-*)`, `var(--space-*)`, `var(--font-*)`.

---

## Tasks

### Task 1: Scaffold `@axhy/jwt-public` shared package

**Files:**

- Create: `packages/jwt-public/package.json`
- Create: `packages/jwt-public/tsconfig.json`
- Create: `packages/jwt-public/src/index.ts`
- Create: `packages/jwt-public/src/verify.ts`
- Create: `packages/jwt-public/src/verify.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/admin-web/package.json`
- Modify: `apps/admin-web/next.config.ts`

- [ ] **Step 1: Write the failing verify test**

`packages/jwt-public/src/verify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { verifyAccessToken } from './verify';

const SECRET = new TextEncoder().encode('test-secret-at-least-32-bytes-long-aaa');

async function sign(payload: Record<string, unknown>, expIn = '15m') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expIn)
    .sign(SECRET);
}

describe('verifyAccessToken', () => {
  it('returns payload for a valid token', async () => {
    const token = await sign({ userId: 'u1', companyId: 'c1', role: 'HR' });
    const result = await verifyAccessToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe('u1');
      expect(result.payload.companyId).toBe('c1');
      expect(result.payload.role).toBe('HR');
    }
  });

  it('returns ok=false for an expired token', async () => {
    const token = await sign({ userId: 'u1', companyId: 'c1', role: 'HR' }, '-1s');
    const result = await verifyAccessToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXPIRED');
  });

  it('returns ok=false for a tampered token', async () => {
    const token = (await sign({ userId: 'u1', companyId: 'c1', role: 'HR' })) + 'x';
    const result = await verifyAccessToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID');
  });

  it('rejects payloads missing required claims', async () => {
    const token = await sign({ userId: 'u1' });
    const result = await verifyAccessToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MALFORMED');
  });
});
```

- [ ] **Step 2: Create `packages/jwt-public/package.json`**

```json
{
  "name": "@axhy/jwt-public",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "jose": "^5.9.6"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 3: Create `packages/jwt-public/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

(If `tsconfig.base.json` does not exist at repo root, copy `compilerOptions` from `packages/state-machines/tsconfig.json` and inline them here.)

- [ ] **Step 4: Implement `packages/jwt-public/src/verify.ts`**

```ts
import { jwtVerify, type JWTPayload } from 'jose';

export type AccessTokenPayload = {
  userId: string;
  companyId: string;
  role: 'OWNER' | 'HR' | 'SUPERVISOR' | 'WORKER' | 'SUPER_ADMIN';
};

export type VerifyResult =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; code: 'EXPIRED' | 'INVALID' | 'MALFORMED' };

const REQUIRED = ['userId', 'companyId', 'role'] as const;

function hasRequired(p: JWTPayload): p is JWTPayload & AccessTokenPayload {
  return REQUIRED.every((k) => typeof (p as Record<string, unknown>)[k] === 'string');
}

export async function verifyAccessToken(token: string, secret: Uint8Array): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!hasRequired(payload)) return { ok: false, code: 'MALFORMED' };
    return { ok: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('expired')) return { ok: false, code: 'EXPIRED' };
    return { ok: false, code: 'INVALID' };
  }
}
```

- [ ] **Step 5: Implement `packages/jwt-public/src/index.ts`**

```ts
export { verifyAccessToken } from './verify';
export type { AccessTokenPayload, VerifyResult } from './verify';
```

- [ ] **Step 6: Wire workspace + admin-web**

`pnpm-workspace.yaml` — confirm `packages/*` is listed. If not, add it.

`apps/admin-web/package.json` — add to dependencies:

```json
"@axhy/jwt-public": "workspace:*",
"jose": "^5.9.6",
"zod": "^3.23.8"
```

(Skip whichever is already present.)

`apps/admin-web/next.config.ts` — ensure `transpilePackages` includes `@axhy/jwt-public`:

```ts
const nextConfig = {
  transpilePackages: ['@axhy/ui-tokens', '@axhy/jwt-public'],
  // ...existing config
};
```

- [ ] **Step 7: Install + verify**

Run: `pnpm install`

Run: `pnpm --filter @axhy/jwt-public test`
Expected: 4 tests pass.

Run: `pnpm --filter @axhy/jwt-public typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

Commit message must include `[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md`.

```bash
git add packages/jwt-public pnpm-workspace.yaml apps/admin-web/package.json apps/admin-web/next.config.ts pnpm-lock.yaml
git commit -m "feat(jwt-public): add edge-safe access-token verifier package

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend pod-scope middleware

**Files:**

- Create: `apps/backend/src/middleware/pod-scope.ts`
- Create: `apps/backend/src/middleware/pod-scope.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/src/middleware/pod-scope.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getMyPodIds, PodOwnershipError, requirePodOwnership } from './pod-scope';

const prisma = new PrismaClient();

describe('pod-scope helpers', () => {
  const companyId = '00000000-0000-0000-0000-00000000c001';
  const otherCompanyId = '00000000-0000-0000-0000-00000000c002';
  const hrA = '00000000-0000-0000-0000-0000000000a1';
  const hrB = '00000000-0000-0000-0000-0000000000a2';
  const podA = '00000000-0000-0000-0000-000000000p01';
  const podB = '00000000-0000-0000-0000-000000000p02';
  const podOther = '00000000-0000-0000-0000-000000000p03';

  beforeEach(async () => {
    await prisma.hRPod.deleteMany({ where: { id: { in: [podA, podB, podOther] } } });
    await prisma.hRPod.create({
      data: { id: podA, companyId, name: 'Pod A', primaryOwnerUserId: hrA },
    });
    await prisma.hRPod.create({
      data: { id: podB, companyId, name: 'Pod B', primaryOwnerUserId: hrB, backupOwnerUserId: hrA },
    });
    await prisma.hRPod.create({
      data: {
        id: podOther,
        companyId: otherCompanyId,
        name: 'Other tenant',
        primaryOwnerUserId: hrA,
      },
    });
  });

  afterEach(async () => {
    await prisma.hRPod.deleteMany({ where: { id: { in: [podA, podB, podOther] } } });
  });

  it('returns primary + backup pods within the caller company', async () => {
    const ids = await getMyPodIds(prisma, hrA, companyId);
    expect(new Set(ids)).toEqual(new Set([podA, podB]));
  });

  it('does not return pods from another tenant', async () => {
    const ids = await getMyPodIds(prisma, hrA, companyId);
    expect(ids).not.toContain(podOther);
  });

  it('returns empty for a user who owns no pods', async () => {
    const stranger = '00000000-0000-0000-0000-0000000000a9';
    const ids = await getMyPodIds(prisma, stranger, companyId);
    expect(ids).toEqual([]);
  });

  it('requirePodOwnership throws PodOwnershipError when not owner', async () => {
    const stranger = '00000000-0000-0000-0000-0000000000a9';
    await expect(requirePodOwnership(prisma, podA, stranger, companyId)).rejects.toBeInstanceOf(
      PodOwnershipError,
    );
  });

  it('requirePodOwnership resolves when caller is primary owner', async () => {
    await expect(requirePodOwnership(prisma, podA, hrA, companyId)).resolves.toBeUndefined();
  });

  it('requirePodOwnership resolves when caller is backup owner', async () => {
    await expect(requirePodOwnership(prisma, podB, hrA, companyId)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure (module missing)**

Run: `pnpm --filter @axhy/backend exec vitest run src/middleware/pod-scope.test.ts`
Expected: cannot find module `./pod-scope`.

- [ ] **Step 3: Implement `pod-scope.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export class PodOwnershipError extends Error {
  constructor(message = 'NOT_POD_OWNER') {
    super(message);
    this.name = 'PodOwnershipError';
  }
}

export async function getMyPodIds(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const rows = await prisma.hRPod.findMany({
    where: {
      companyId,
      OR: [{ primaryOwnerUserId: userId }, { backupOwnerUserId: userId }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function requirePodOwnership(
  prisma: PrismaClient,
  podId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  const pod = await prisma.hRPod.findFirst({
    where: {
      id: podId,
      companyId,
      OR: [{ primaryOwnerUserId: userId }, { backupOwnerUserId: userId }],
    },
    select: { id: true },
  });
  if (!pod) throw new PodOwnershipError();
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @axhy/backend exec vitest run src/middleware/pod-scope.test.ts`
Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/middleware/pod-scope.ts apps/backend/src/middleware/pod-scope.test.ts
git commit -m "feat(backend): add pod-scope helpers for HR portal queries

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: GET `/admin/memberships` handler

**Files:**

- Modify: `apps/backend/src/routes/admin-memberships.ts`
- Create: `apps/backend/test/admin-memberships-get.test.ts`

- [ ] **Step 1: Write the failing integration test**

`apps/backend/test/admin-memberships-get.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, seedTenantWithTwoPods, mintToken, type TestCtx } from './helpers';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await buildTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedTenantWithTwoPods(ctx);
});

describe('GET /admin/memberships', () => {
  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/admin/memberships' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for WORKER role', async () => {
    const token = await mintToken(ctx, {
      role: 'WORKER',
      userId: ctx.fixtures.workerA1.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('HR-A sees only Pod A memberships', async () => {
    const token = await mintToken(ctx, {
      role: 'HR',
      userId: ctx.fixtures.hrA.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.items.map((m: { id: string }) => m.id);
    expect(ids).toContain(ctx.fixtures.workerA1.membershipId);
    expect(ids).not.toContain(ctx.fixtures.workerB1.membershipId);
  });

  it('OWNER sees all memberships in tenant', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((m: { id: string }) => m.id);
    expect(ids).toContain(ctx.fixtures.workerA1.membershipId);
    expect(ids).toContain(ctx.fixtures.workerB1.membershipId);
  });

  it('does not leak across tenants', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    const ids = res.json().items.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(ctx.fixtures.tenant2WorkerMembershipId);
  });

  it('respects limit and returns nextCursor', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships?limit=2',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    expect(body.nextCursor).toBeTruthy();
  });

  it('rejects malformed cursor with 400 CURSOR_INVALID', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships?cursor=not-a-cursor',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('CURSOR_INVALID');
  });
});
```

> **Note:** `apps/backend/test/helpers.ts` is expected to exist (per F1-b test pattern). If it does not export `buildTestApp`, `seedTenantWithTwoPods`, `mintToken`, `TestCtx`, see Task 4 for the helper definitions and create them first.

- [ ] **Step 2: Add list handler to `admin-memberships.ts`**

Inside `registerAdminMembershipRoutes`, after the existing POST handler:

```ts
import { getMyPodIds } from '../middleware/pod-scope.js';

const ListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

app.get('/admin/memberships', { preHandler: requireRole('OWNER', 'HR') }, async (req, reply) => {
  const parsedQuery = ListQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    reply.code(400).send({ error: 'QUERY_INVALID', issues: parsedQuery.error.issues });
    return;
  }
  const { cursor: rawCursor, limit } = parsedQuery.data;
  const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
  if (rawCursor !== undefined && cursor === null) {
    reply.code(400).send({ error: 'CURSOR_INVALID' });
    return;
  }

  const where: Parameters<typeof prisma.membership.findMany>[0]['where'] = {
    companyId: req.auth.companyId,
  };
  if (req.auth.role === 'HR') {
    const myPodIds = await getMyPodIds(prisma, req.auth.userId, req.auth.companyId);
    where.podId = { in: myPodIds };
  }
  if (cursor) {
    where.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ];
  }

  const rows = await prisma.membership.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      podId: true,
      createdAt: true,
      user: { select: { name: true, phoneE164: true } },
    },
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    podId: m.podId,
    createdAt: m.createdAt.toISOString(),
    name: m.user?.name ?? null,
    phone: m.user?.phoneE164 ?? null,
  }));
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: new Date(last.createdAt), id: last.id }) : null;
  reply.send({ items, nextCursor });
});
```

> Adjust `prisma.membership` select fields to what exists in the actual schema (e.g., if `phoneE164` is on `User`, keep as shown; if `phone`, rename). When the schema differs, fix the select and rerun tests — do not invent fields.

- [ ] **Step 3: Run test**

Run: `pnpm --filter @axhy/backend exec vitest run test/admin-memberships-get.test.ts`
Expected: 7/7 pass.

If failures point at the `helpers.ts` shape, complete Task 4's helpers first then return here.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin-memberships.ts apps/backend/test/admin-memberships-get.test.ts
git commit -m "feat(backend): GET /admin/memberships with HR pod scoping

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Test helpers (if missing)

**Files:**

- Modify or Create: `apps/backend/test/helpers.ts`

- [ ] **Step 1: Inspect existing helpers**

Run: `ls apps/backend/test/helpers* 2>/dev/null && head -200 apps/backend/test/helpers.ts 2>/dev/null`

If the file already exports `buildTestApp`, `seedTenantWithTwoPods`, `mintToken`, `TestCtx`, **skip this task**.

If the file exists but lacks `seedTenantWithTwoPods` or `mintToken`, add the missing exports.

If the file does not exist, create it with the content below.

- [ ] **Step 2: Implement helpers**

```ts
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthRoutes } from '../src/routes/auth.js';
import { registerAdminMembershipRoutes } from '../src/routes/admin-memberships.js';
import { registerAdminWorkerRoutes } from '../src/routes/admin-workers.js';
import { registerAdminSiteRoutes } from '../src/routes/admin-sites.js';
import { registerLeaveRequestRoutes } from '../src/routes/leave-requests.js';
import { requireAuthPlugin } from '../src/middleware/require-auth.js';

const SECRET = process.env.JWT_SECRET ?? 'test-secret-at-least-32-bytes-long-aaaaaa';
const secretKey = new TextEncoder().encode(SECRET);

export type TestCtx = {
  app: FastifyInstance;
  prisma: PrismaClient;
  reset: () => Promise<void>;
  fixtures: Fixtures;
};

export type Fixtures = {
  tenant1: string;
  tenant2: string;
  owner: { userId: string; membershipId: string };
  hrA: { userId: string; membershipId: string; podId: string };
  hrB: { userId: string; membershipId: string; podId: string };
  supervisorA: { userId: string; membershipId: string };
  workerA1: { userId: string; membershipId: string };
  workerB1: { userId: string; membershipId: string };
  tenant2WorkerMembershipId: string;
  siteA: { id: string };
};

export async function buildTestApp(): Promise<TestCtx> {
  const prisma = new PrismaClient();
  const app = Fastify({ logger: false });
  await app.register(requireAuthPlugin);
  await registerAuthRoutes(app, prisma);
  await registerAdminMembershipRoutes(app, prisma);
  await registerAdminWorkerRoutes(app, prisma);
  await registerAdminSiteRoutes(app, prisma);
  await registerLeaveRequestRoutes(app, prisma);
  await app.ready();
  const fixtures = {} as Fixtures;
  return {
    app,
    prisma,
    reset: async () => {
      await prisma.leaveRequest.deleteMany({});
      await prisma.siteSupervisorBinding.deleteMany({});
      await prisma.site.deleteMany({});
      await prisma.membership.deleteMany({});
      await prisma.hRPod.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.company.deleteMany({});
    },
    fixtures,
  };
}

export async function seedTenantWithTwoPods(ctx: TestCtx): Promise<void> {
  const { prisma, fixtures } = ctx;
  const tenant1 = randomUUID();
  const tenant2 = randomUUID();
  fixtures.tenant1 = tenant1;
  fixtures.tenant2 = tenant2;
  await prisma.company.createMany({
    data: [
      { id: tenant1, name: 'Tenant 1' },
      { id: tenant2, name: 'Tenant 2' },
    ],
  });

  async function mkUser(role: string, tenant: string, podId?: string) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        phoneE164: `+1555${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        name: role + '-' + userId.slice(0, 8),
      },
    });
    await prisma.membership.create({
      data: {
        id: membershipId,
        companyId: tenant,
        userId,
        role,
        status: 'ACTIVE',
        podId: podId ?? null,
      },
    });
    return { userId, membershipId };
  }

  const owner = await mkUser('OWNER', tenant1);
  fixtures.owner = owner;

  const podA = randomUUID();
  const podB = randomUUID();
  const hrA = await mkUser('HR', tenant1);
  const hrB = await mkUser('HR', tenant1);
  await prisma.hRPod.create({
    data: { id: podA, companyId: tenant1, name: 'Pod A', primaryOwnerUserId: hrA.userId },
  });
  await prisma.hRPod.create({
    data: { id: podB, companyId: tenant1, name: 'Pod B', primaryOwnerUserId: hrB.userId },
  });
  fixtures.hrA = { ...hrA, podId: podA };
  fixtures.hrB = { ...hrB, podId: podB };
  // Place HRs into their own pods via membership.podId
  await prisma.membership.update({ where: { id: hrA.membershipId }, data: { podId: podA } });
  await prisma.membership.update({ where: { id: hrB.membershipId }, data: { podId: podB } });

  const supervisorA = await mkUser('SUPERVISOR', tenant1, podA);
  fixtures.supervisorA = supervisorA;

  const workerA1 = await mkUser('WORKER', tenant1, podA);
  fixtures.workerA1 = workerA1;
  const workerB1 = await mkUser('WORKER', tenant1, podB);
  fixtures.workerB1 = workerB1;

  // Tenant 2 worker (isolation check)
  const tenant2Worker = await mkUser('WORKER', tenant2);
  fixtures.tenant2WorkerMembershipId = tenant2Worker.membershipId;

  // Seed a site for site tests
  const siteId = randomUUID();
  await prisma.site.create({
    data: { id: siteId, companyId: tenant1, name: 'Site A', state: 'DRAFT' },
  });
  fixtures.siteA = { id: siteId };
}

export async function mintToken(
  _ctx: TestCtx,
  payload: { userId: string; companyId: string; role: string },
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretKey);
}
```

> The exact `register*` import paths must match the actual route files. If a register function name differs, adjust. If the auth middleware accepts the same `JWT_SECRET` from env, the test process must set `JWT_SECRET=test-secret-at-least-32-bytes-long-aaaaaa` (add to `apps/backend/vitest.config.ts` `env` block or a setup file).

- [ ] **Step 3: Run a quick smoke test**

Run: `pnpm --filter @axhy/backend exec vitest run src/middleware/pod-scope.test.ts`
Expected: still 6/6 pass (helpers do not affect this file).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/helpers.ts
git commit -m "test(backend): add HR-portal test helpers (seed + mint)

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: GET `/admin/workers` list + detail

**Files:**

- Modify: `apps/backend/src/routes/admin-workers.ts`
- Create: `apps/backend/test/admin-workers-get.test.ts`

- [ ] **Step 1: Write failing tests**

`apps/backend/test/admin-workers-get.test.ts` — mirror the membership tests with worker-specific assertions plus a detail test. Include:

- 401 without auth
- 403 WORKER + 403 SUPERVISOR
- HR-A sees Pod A workers only
- OWNER sees all workers in tenant
- Tenant 2 worker not visible to Tenant 1 OWNER
- `GET /admin/workers/:id` returns 200 for in-scope worker
- `GET /admin/workers/:id` returns 404 for out-of-scope worker when HR (do not leak existence)
- Pagination with `?limit=1`
- Malformed cursor → 400

(Use the same shape as Task 3's tests. Substitute `workers` URL and `prisma.user/membership` joins.)

- [ ] **Step 2: Add handlers**

Inside `admin-workers.ts`, after the existing POST handlers:

```ts
import { getMyPodIds } from '../middleware/pod-scope.js';

// (reuse decodeCursor / encodeCursor — extract them into a shared
// apps/backend/src/lib/cursor.ts if used by 3+ files; for now duplicate is OK)

app.get('/admin/workers', { preHandler: requireRole('OWNER', 'HR') }, async (req, reply) => {
  // Identical structure to memberships list, but filtered to role='WORKER'.
  const parsedQuery = ListQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    reply.code(400).send({ error: 'QUERY_INVALID' });
    return;
  }
  const { cursor: rawCursor, limit } = parsedQuery.data;
  const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
  if (rawCursor !== undefined && cursor === null) {
    reply.code(400).send({ error: 'CURSOR_INVALID' });
    return;
  }

  const where: Parameters<typeof prisma.membership.findMany>[0]['where'] = {
    companyId: req.auth.companyId,
    role: 'WORKER',
  };
  if (req.auth.role === 'HR') {
    const myPodIds = await getMyPodIds(prisma, req.auth.userId, req.auth.companyId);
    where.podId = { in: myPodIds };
  }
  if (cursor) {
    where.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ];
  }

  const rows = await prisma.membership.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      userId: true,
      status: true,
      podId: true,
      createdAt: true,
      user: { select: { name: true, phoneE164: true, anonymizedAt: true } },
    },
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((m) => ({
    workerId: m.userId,
    membershipId: m.id,
    status: m.status,
    podId: m.podId,
    name: m.user?.name ?? null,
    phone: m.user?.phoneE164 ?? null,
    anonymizedAt: m.user?.anonymizedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: new Date(last.createdAt), id: last.membershipId })
      : null;
  reply.send({ items, nextCursor });
});

app.get<{ Params: { id: string } }>(
  '/admin/workers/:id',
  { preHandler: requireRole('OWNER', 'HR') },
  async (req, reply) => {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.params.id, companyId: req.auth.companyId, role: 'WORKER' },
      select: {
        id: true,
        userId: true,
        status: true,
        podId: true,
        createdAt: true,
        user: { select: { name: true, phoneE164: true, anonymizedAt: true } },
      },
    });
    if (!membership) {
      reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
      return;
    }
    if (req.auth.role === 'HR') {
      const myPodIds = await getMyPodIds(prisma, req.auth.userId, req.auth.companyId);
      if (!membership.podId || !myPodIds.includes(membership.podId)) {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }
    }
    reply.send({
      workerId: membership.userId,
      membershipId: membership.id,
      status: membership.status,
      podId: membership.podId,
      name: membership.user?.name ?? null,
      phone: membership.user?.phoneE164 ?? null,
      anonymizedAt: membership.user?.anonymizedAt?.toISOString() ?? null,
    });
  },
);
```

If `User.anonymizedAt` does not exist (verify), substitute with whatever column R3 sets (`Worker.terminatedAt`, `Membership.anonymizedAt`, etc.). Inspect `R3 anonymize` impl before writing.

- [ ] **Step 3: Run test**

Run: `pnpm --filter @axhy/backend exec vitest run test/admin-workers-get.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin-workers.ts apps/backend/test/admin-workers-get.test.ts
git commit -m "feat(backend): GET /admin/workers + /:id with HR pod scoping

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: GET `/admin/sites` + `:id` + `:id/bindings`

**Files:**

- Modify: `apps/backend/src/routes/admin-sites.ts`
- Create: `apps/backend/test/admin-sites-get.test.ts`

- [ ] **Step 1: Write failing tests** (list, detail, bindings list; role gate + tenant isolation + pagination; sites are tenant-scoped not pod-scoped per spec section 2)

- [ ] **Step 2: Add three GET handlers** (`/admin/sites`, `/admin/sites/:id`, `/admin/sites/:id/bindings`)

Use the same pattern as Task 5 minus pod scoping. For `/bindings`, filter by `siteId` + `companyId`. Order by `createdAt desc, id desc` for cursor.

`/admin/sites/:id` should 404 on cross-tenant request (do not leak existence).

- [ ] **Step 3: Run test, expect pass**

Run: `pnpm --filter @axhy/backend exec vitest run test/admin-sites-get.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(backend): GET /admin/sites, /:id, /:id/bindings

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: GET `/leave-requests` inbox + refine decide gate

**Files:**

- Modify: `apps/backend/src/routes/leave-requests.ts`
- Create: `apps/backend/test/leave-requests-hr-gate.test.ts`

- [ ] **Step 1: Write failing tests** — Test matrix:
  - GET `/leave-requests` with HR sees only own-pod workers' requests
  - GET `/leave-requests` filters by `state=REQUESTED` by default
  - POST `/leave-requests/:id/approve` by HR-A for worker in Pod A → 200
  - POST `/leave-requests/:id/approve` by HR-A for worker in Pod B → 403 NOT_YOUR_POD
  - POST `/leave-requests/:id/approve` by HR-A for worker outside any pod → 403 WORKER_NOT_IN_POD
  - Existing SUPERVISOR happy path still 200
  - Existing WORKER 403 still 403

- [ ] **Step 2: Add inbox GET handler**

```ts
app.get('/leave-requests', { preHandler: requireRole('HR') }, async (req, reply) => {
  const parsedQuery = ListQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    reply.code(400).send({ error: 'QUERY_INVALID' });
    return;
  }
  const { cursor: rawCursor, limit } = parsedQuery.data;
  const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
  if (rawCursor !== undefined && cursor === null) {
    reply.code(400).send({ error: 'CURSOR_INVALID' });
    return;
  }

  const myPodIds = await getMyPodIds(prisma, req.auth.userId, req.auth.companyId);
  const workerMemberships = await prisma.membership.findMany({
    where: { companyId: req.auth.companyId, role: 'WORKER', podId: { in: myPodIds } },
    select: { userId: true },
  });
  const workerIds = workerMemberships.map((m) => m.userId);

  const where: Parameters<typeof prisma.leaveRequest.findMany>[0]['where'] = {
    companyId: req.auth.companyId,
    state: 'REQUESTED',
    workerId: { in: workerIds },
  };
  if (cursor) {
    where.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ];
  }
  const rows = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    workerId: r.workerId,
    fromDate: r.fromDate.toISOString().slice(0, 10),
    toDate: r.toDate.toISOString().slice(0, 10),
    reason: r.reason,
    state: r.state,
    createdAt: r.createdAt.toISOString(),
  }));
  const last = rows.at(hasMore ? limit - 1 : -1);
  reply.send({ items, nextCursor: hasMore && last ? encodeCursor(last) : null });
});
```

- [ ] **Step 3: Refine the decide gate at line ~121**

Replace the current `if (auth.role !== 'SUPERVISOR')` block with the spec section 3.3 code (verbatim).

- [ ] **Step 4: Verify JWT payload has `userId`**

Inspect `apps/backend/src/lib/jwt.ts`. If `issueAccessToken` does not include `userId` in the payload, add it. Update `requireAuth` if it does not surface `req.auth.userId`. Re-run F1-a regression test:

Run: `pnpm --filter @axhy/backend exec vitest run test/auth-flow-new-format.test.ts`
Expected: still green.

- [ ] **Step 5: Run inbox + decide tests**

Run: `pnpm --filter @axhy/backend exec vitest run test/leave-requests-hr-gate.test.ts`
Expected: full pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(backend): GET /leave-requests HR inbox + HR decide gate

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Backend regression sweep + audit

- [ ] **Step 1: Full backend test**

Run: `pnpm --filter @axhy/backend test`
Expected: all green. Investigate any regression.

- [ ] **Step 2: Audit**

Run: `pnpm --filter @axhy/ai-tools run audit`
Expected: no NEW blockers or HIGHs vs the pre-A1 baseline of 7 MEDIUMs. Note any new MEDIUM in `docs/evidence/2026-05-29/EVID-HR-A1-QA.md` (will be created later).

- [ ] **Step 3: Commit if any fix-ups required**

---

### Task 9: Admin-web auth helpers (`lib/auth.ts`)

**Files:**

- Create: `apps/admin-web/lib/auth.ts`

- [ ] **Step 1: Implement**

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken, type AccessTokenPayload } from '@axhy/jwt-public';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-only-secret-must-set-in-env',
);

export type Session = AccessTokenPayload;

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const at = store.get('axhy_at')?.value;
  if (!at) return null;
  const result = await verifyAccessToken(at, SECRET);
  return result.ok ? result.payload : null;
}

export async function requireRole(...roles: Session['role'][]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) redirect('/forbidden');
  return session;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter admin-web typecheck`
Expected: 0 errors. If `JWT_SECRET` is missing from `.env.local`, add it to `apps/admin-web/.env.local.example` (with a placeholder) and to `apps/admin-web/lib/env.ts` validation.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(admin-web): session helpers backed by @axhy/jwt-public

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Admin-web API client (`lib/api.ts`)

**Files:**

- Create: `apps/admin-web/lib/api.ts`

- [ ] **Step 1: Implement**

```ts
import { cookies } from 'next/headers';

const BASE = process.env.NEXT_PUBLIC_AXHY_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

export async function fetchJson<T>(path: string, init: FetchInit = {}): Promise<T> {
  const store = await cookies();
  const at = store.get('axhy_at')?.value;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.body && !(init.body instanceof FormData)
      ? { 'content-type': 'application/json' }
      : {}),
    ...init.headers,
  };
  if (at) headers.authorization = `Bearer ${at}`;
  const res = await fetch(BASE + path, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText;
    try {
      const body = await res.json();
      code = typeof body?.error === 'string' ? body.error : code;
      message = typeof body?.message === 'string' ? body.message : message;
    } catch {
      // body not JSON
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 2: Typecheck, commit**

Run: `pnpm --filter admin-web typecheck`

```bash
git add apps/admin-web/lib/api.ts
git commit -m "feat(admin-web): fetchJson API client + ApiError

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `/api/auth/session` route handler

**Files:**

- Create: `apps/admin-web/app/api/auth/session/route.ts`

- [ ] **Step 1: Implement**

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAccessToken } from '@axhy/jwt-public';

const Body = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
});

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-only-secret-must-set-in-env',
);

const FIFTEEN_MIN = 15 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'BODY_INVALID' }, { status: 400 });
  }
  const { accessToken, refreshToken } = parsed.data;
  const verified = await verifyAccessToken(accessToken, SECRET);
  if (!verified.ok) {
    return NextResponse.json({ error: 'TOKEN_INVALID', code: verified.code }, { status: 401 });
  }
  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  store.set('axhy_at', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: FIFTEEN_MIN,
  });
  store.set('axhy_rt', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: SEVEN_DAYS,
  });
  const redirect = verified.payload.role === 'HR' ? '/hr' : '/owner';
  return NextResponse.json({ redirect });
}

export async function DELETE() {
  const store = await cookies();
  store.delete('axhy_at');
  store.delete('axhy_rt');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter admin-web typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(admin-web): /api/auth/session route handler

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Login page token wiring

**Files:**

- Modify: `apps/admin-web/app/login/page.tsx`

- [ ] **Step 1: Modify `handleVerifySubmit`**

Inside the OTP verify success branch (after the existing `await fetch(.../auth/otp/verify)`):

```ts
const verifyJson = await verifyRes.json();
const { accessToken, refreshToken, user } = verifyJson;
if (!accessToken || !refreshToken || !user) {
  setOtpError('Login response invalid — please retry');
  setStep('otp');
  return;
}
const sessionRes = await fetch('/api/auth/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessToken, refreshToken }),
});
if (!sessionRes.ok) {
  setOtpError('Could not start session — please retry');
  setStep('otp');
  return;
}
const { redirect } = await sessionRes.json();
setStep('success');
setTimeout(() => router.push(redirect ?? '/owner'), 600);
```

Replace the existing `setTimeout(() => router.push('/owner'), 1400)`.

- [ ] **Step 2: Build admin-web**

Run: `pnpm --filter admin-web build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(admin-web): extract tokens, persist via session route, redirect by role

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: HR shell layout + nav + error boundary + forbidden page

**Files:**

- Create: `apps/admin-web/app/hr/layout.tsx`
- Create: `apps/admin-web/app/hr/Nav.tsx`
- Create: `apps/admin-web/app/hr/error.tsx`
- Create: `apps/admin-web/app/hr/hr.module.css`
- Create: `apps/admin-web/app/forbidden/page.tsx`

- [ ] **Step 1: `app/hr/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { requireRole } from '@/lib/auth';
import { HrNav } from './Nav';
import styles from './hr.module.css';

export default async function HrLayout({ children }: { children: ReactNode }) {
  await requireRole('HR');
  return (
    <div className={styles.shell}>
      <HrNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: `app/hr/Nav.tsx`**

```tsx
import Link from 'next/link';
import styles from './hr.module.css';

const ITEMS = [
  { href: '/hr', label: 'Dashboard' },
  { href: '/hr/memberships', label: 'Memberships' },
  { href: '/hr/workers', label: 'Workers' },
  { href: '/hr/sites', label: 'Sites' },
  { href: '/hr/leave-requests', label: 'Leave requests' },
];

export function HrNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>AXHY HR</div>
      <ul>
        {ITEMS.map((it) => (
          <li key={it.href}>
            <Link href={it.href}>{it.label}</Link>
          </li>
        ))}
      </ul>
      <form action="/api/auth/session" method="DELETE" className={styles.logout}>
        <button type="submit">Log out</button>
      </form>
    </nav>
  );
}
```

(Forms cannot natively `DELETE`; replace with a small client component if needed: `<button onClick={() => fetch('/api/auth/session', { method: 'DELETE' }).then(() => location.assign('/login'))}>Log out</button>`.)

- [ ] **Step 3: `app/hr/error.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (error.message.includes('401') || error.message.includes('NEXT_REDIRECT')) {
      router.push('/login');
    }
  }, [error, router]);
  return (
    <section style={{ padding: 32 }}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
```

- [ ] **Step 4: `app/hr/hr.module.css`**

Minimal layout (shell + nav + main grid). Reuse tokens `--color-bg`, `--color-text`, `--space-4`, `--space-8`. Keep it ~60 lines.

- [ ] **Step 5: `app/forbidden/page.tsx`**

```tsx
export default function Forbidden() {
  return (
    <main style={{ padding: 64, textAlign: 'center' }}>
      <h1>Access denied</h1>
      <p>Your account does not have access to this area.</p>
      <p>
        <a href="/login">Return to login</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Typecheck, build**

Run: `pnpm --filter admin-web typecheck && pnpm --filter admin-web build`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin-web): HR shell layout, nav, error boundary, forbidden page

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: HR dashboard

**Files:**

- Create: `apps/admin-web/app/hr/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { fetchJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';

type Listing<T> = { items: T[]; nextCursor: string | null };

export default async function HrDashboard() {
  await requireRole('HR');
  const [members, workers, sites, leaves] = await Promise.all([
    fetchJson<Listing<unknown>>('/admin/memberships?limit=1'),
    fetchJson<Listing<unknown>>('/admin/workers?limit=1'),
    fetchJson<Listing<unknown>>('/admin/sites?limit=1'),
    fetchJson<Listing<unknown>>('/leave-requests?limit=50'),
  ]);
  return (
    <section>
      <h1>HR dashboard</h1>
      <dl>
        <dt>Memberships visible</dt>
        <dd>{members.items.length + (members.nextCursor ? '+' : '')}</dd>
        <dt>Workers visible</dt>
        <dd>{workers.items.length + (workers.nextCursor ? '+' : '')}</dd>
        <dt>Sites visible</dt>
        <dd>{sites.items.length + (sites.nextCursor ? '+' : '')}</dd>
        <dt>Pending leave requests</dt>
        <dd>
          {leaves.items.length}
          {leaves.nextCursor ? '+' : ''}
        </dd>
      </dl>
    </section>
  );
}
```

> Note: `?limit=1` returns only the first item, but `nextCursor` indicates "there are more." For a real count, add `GET /admin/.../count` later — for the dashboard purpose "1+" is enough.

- [ ] **Step 2: Typecheck, commit**

---

### Task 15: HR memberships pages

**Files:**

- Create: `apps/admin-web/app/hr/memberships/page.tsx`
- Create: `apps/admin-web/app/hr/memberships/styles.module.css`
- Create: `apps/admin-web/app/hr/memberships/new/page.tsx`
- Create: `apps/admin-web/app/hr/memberships/new/InviteForm.tsx`
- Create: `apps/admin-web/app/hr/memberships/new/actions.ts`

- [ ] **Step 1: List page (`memberships/page.tsx`)**

Server component:

- `await requireRole('HR')`
- `fetchJson<Listing<MembershipDTO>>('/admin/memberships?limit=50' + cursor)`
- Render table of name | phone | role | status | podId
- Link "Invite new" → `/hr/memberships/new`
- Pagination link uses `?cursor=<nextCursor>` (read from `searchParams`)

- [ ] **Step 2: Invite page (`memberships/new/page.tsx`)**

```tsx
import { requireRole } from '@/lib/auth';
import { InviteForm } from './InviteForm';

export default async function NewMembership() {
  await requireRole('HR');
  return (
    <section>
      <h1>Invite member</h1>
      <InviteForm />
    </section>
  );
}
```

- [ ] **Step 3: Form (`memberships/new/InviteForm.tsx`)**

```tsx
'use client';
import { useActionState } from 'react';
import { inviteMembership, type FormState } from './actions';

const INITIAL: FormState = { ok: false, code: '', message: '' };

export function InviteForm() {
  const [state, formAction] = useActionState(inviteMembership, INITIAL);
  return (
    <form action={formAction}>
      <label>
        Phone <input name="phone" type="tel" required pattern="\+\d{10,15}" />
      </label>
      <label>
        Name <input name="name" required maxLength={120} />
      </label>
      <label>
        Role
        <select name="role" required defaultValue="SUPERVISOR">
          <option value="HR">HR</option>
          <option value="SUPERVISOR">SUPERVISOR</option>
        </select>
      </label>
      <label>
        Base salary (paise) <input name="baseSalaryPaise" type="number" min={0} required />
      </label>
      <label>
        Pod ID (optional) <input name="podId" />
      </label>
      <button type="submit">Invite</button>
      {!state.ok && state.message ? <p role="alert">{state.message}</p> : null}
      {state.ok ? <p role="status">Invited.</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Action (`memberships/new/actions.ts`)**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, fetchJson } from '@/lib/api';

const Body = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/),
  name: z.string().min(1).max(120),
  role: z.enum(['HR', 'SUPERVISOR']),
  baseSalaryPaise: z.coerce.number().int().min(0),
  podId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type FormState =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

export async function inviteMembership(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = Body.safeParse({
    phone: fd.get('phone'),
    name: fd.get('name'),
    role: fd.get('role'),
    baseSalaryPaise: fd.get('baseSalaryPaise'),
    podId: fd.get('podId') ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }
  try {
    const body = await fetchJson<{ membershipId: string }>('/admin/memberships', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    revalidatePath('/hr/memberships');
    return { ok: true, id: body.membershipId };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}
```

- [ ] **Step 5: Typecheck, build**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(admin-web): HR memberships list + invite (R1)

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: HR workers list + invite + detail + anonymize

**Files:**

- Create: `apps/admin-web/app/hr/workers/page.tsx`
- Create: `apps/admin-web/app/hr/workers/styles.module.css`
- Create: `apps/admin-web/app/hr/workers/new/page.tsx`
- Create: `apps/admin-web/app/hr/workers/new/WorkerForm.tsx`
- Create: `apps/admin-web/app/hr/workers/new/actions.ts`
- Create: `apps/admin-web/app/hr/workers/[id]/page.tsx`
- Create: `apps/admin-web/app/hr/workers/[id]/AnonymizeButton.tsx`
- Create: `apps/admin-web/app/hr/workers/[id]/actions.ts`

- [ ] **Step 1: List page** — same pattern as memberships list, hitting `/admin/workers`. Render columns: name, phone, status, podId, "View".

- [ ] **Step 2: Invite page + form + action**

Mirror Task 15's pattern. Backend schema fields: `phone`, `name`, `baseSalaryPaise`, `bankIfsc?`, `bankAcct?`, `preferredLanguage?` (default `'hi'`). POST `/admin/workers`. On success redirect to `/hr/workers`.

- [ ] **Step 3: Worker detail page**

```tsx
import { fetchJson, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { AnonymizeButton } from './AnonymizeButton';

type Worker = {
  workerId: string;
  membershipId: string;
  status: string;
  podId: string | null;
  name: string | null;
  phone: string | null;
  anonymizedAt: string | null;
};

export default async function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('HR');
  const { id } = await params;
  let worker: Worker;
  try {
    worker = await fetchJson<Worker>(`/admin/workers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return (
    <section>
      <h1>{worker.name ?? '(unnamed)'}</h1>
      <dl>
        <dt>Phone</dt>
        <dd>{worker.phone ?? '—'}</dd>
        <dt>Pod</dt>
        <dd>{worker.podId ?? '—'}</dd>
        <dt>Status</dt>
        <dd>{worker.status}</dd>
        <dt>Anonymized at</dt>
        <dd>{worker.anonymizedAt ?? '—'}</dd>
      </dl>
      {worker.anonymizedAt ? null : <AnonymizeButton workerId={worker.workerId} />}
    </section>
  );
}
```

- [ ] **Step 4: `AnonymizeButton.tsx`** — client component with a `<dialog>` confirm modal, reason textarea, "Confirm" calls server action `anonymizeWorker(workerId, reason)`.

- [ ] **Step 5: Action** — POST `/admin/workers/:id/anonymize` with `{ reason }`. On success `revalidatePath('/hr/workers')` + `revalidatePath('/hr/workers/' + workerId)`.

- [ ] **Step 6: Typecheck, build, commit**

---

### Task 17: HR sites list + create + detail

**Files:**

- Create: pages + form + action under `apps/admin-web/app/hr/sites/...`

- [ ] **Step 1: Sites list** — fetch `/admin/sites`, render columns: name, state, address, "View".

- [ ] **Step 2: Sites/new page + form + action** — fields: `name` (1-120), `address?`, `latitude?`, `longitude?`, `workdays?` (regex `^[MTWFSU_]{7}$`, default `'MTWTFS_'`). POST `/admin/sites`. Redirect to `/hr/sites/<id>`.

- [ ] **Step 3: Site detail** — fetch `/admin/sites/:id` + `/admin/sites/:id/bindings` in parallel. Show site fields, render bindings table (supervisor name, effectiveFrom, effectiveUntil, reason). "Add binding" → `/hr/sites/:id/bindings/new`.

- [ ] **Step 4: Typecheck, build, commit**

---

### Task 18: HR site bindings — add

**Files:**

- Create: `apps/admin-web/app/hr/sites/[id]/bindings/new/page.tsx`
- Create: `apps/admin-web/app/hr/sites/[id]/bindings/new/BindingForm.tsx`
- Create: `apps/admin-web/app/hr/sites/[id]/bindings/new/actions.ts`

- [ ] **Step 1: Form fields** — `supervisorUserId` (UUID), `effectiveFrom` (datetime-local), `effectiveUntil?`, `actingForUserId?` (UUID), `reason` (1-1000).

- [ ] **Step 2: Action** — POST `/admin/sites/:id/bindings` with Zod-validated body. Refinement: `effectiveUntil` required if `actingForUserId` set.

- [ ] **Step 3: Typecheck, build, commit**

---

### Task 19: HR leave-requests inbox + decide

**Files:**

- Create: `apps/admin-web/app/hr/leave-requests/page.tsx`
- Create: `apps/admin-web/app/hr/leave-requests/styles.module.css`
- Create: `apps/admin-web/app/hr/leave-requests/[id]/page.tsx`
- Create: `apps/admin-web/app/hr/leave-requests/[id]/DecideButtons.tsx`
- Create: `apps/admin-web/app/hr/leave-requests/[id]/actions.ts`

- [ ] **Step 1: Inbox** — fetch `/leave-requests?limit=50`, render rows: workerId (fetch worker name in parallel via Promise.all if needed; for A1 show ID), fromDate, toDate, reason, "Decide".

- [ ] **Step 2: Detail** — fetch `/leave-requests/:id` if a GET exists; otherwise pass row data via search params or rehydrate from inbox (acceptable for A1 since the inbox already has the row).

- [ ] **Step 3: DecideButtons.tsx** — two buttons "Approve" / "Reject", each calls a server action.

- [ ] **Step 4: Actions** — POST `/leave-requests/:id/approve` and `/reject`. On success `revalidatePath('/hr/leave-requests')`.

- [ ] **Step 5: Typecheck, build, commit**

---

### Task 20: Admin-web regression sweep

- [ ] **Step 1:** `pnpm --filter admin-web typecheck`
- [ ] **Step 2:** `pnpm --filter admin-web build`
- [ ] **Step 3:** `pnpm --filter @axhy/ai-tools run audit`

Fix any new issue.

- [ ] **Step 4: Commit fix-ups**

---

### Task 21: Playwright E2E water-flow

**Files:**

- Create: `apps/admin-web/playwright.config.ts` (if missing)
- Create: `apps/admin-web/e2e/hr-water-flow.spec.ts`
- Modify: `apps/admin-web/package.json` (add `e2e` script + `@playwright/test` devDep if missing)

- [ ] **Step 1: Install Playwright (if needed)**

```bash
pnpm --filter admin-web add -D @playwright/test
pnpm --filter admin-web exec playwright install --with-deps chromium
```

- [ ] **Step 2: playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
```

- [ ] **Step 3: `e2e/hr-water-flow.spec.ts`**

Write the full water-flow per spec section 7.3. Use a unique phone (e.g. `+15550000${Date.now().toString().slice(-7)}`) for invitees. Before the test runs, seed an HR + pod via a small `e2e/seed.ts` script that hits the backend test API or runs Prisma directly. (If neither is feasible, document the seed as "pre-existing fixture in staging DB" — for A1 the test can rely on a pre-seeded HR account.)

Key assertions:

- After login, URL contains `/hr` and page text contains "HR dashboard".
- After invite supervisor, list page contains the invited phone.
- After invite worker, workers list contains the worker.
- After anonymize, detail page shows `Anonymized at: <ISO date>`.
- After create site, sites list contains site name.
- After add binding, site detail bindings table contains the supervisor row.
- After approve leave, inbox no longer contains the request.

- [ ] **Step 4: Run against local dev**

```bash
pnpm --filter admin-web dev &   # background
pnpm --filter @axhy/backend dev &
pnpm --filter admin-web exec playwright test
```

Expected: green. Capture screenshots into `apps/admin-web/playwright-report/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "test(admin-web): Playwright HR water-flow E2E

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: SOP four-layer verification + EVID-HR-A1-QA.md

**Files:**

- Create: `docs/evidence/2026-05-29/EVID-HR-A1-QA.md`
- Create: `apps/backend/scripts/qa-hr-a1-four-layer.ts`

- [ ] **Step 1: Verification script**

A tsx script that:

1. Reads a recent `e2e` run log for request URLs (or replays the water-flow against `http://localhost:3000`).
2. For each of the 7 operations, runs a SQL query confirming the DB row exists with expected values.
3. Lists side-effect channels (audit log, queue, cache); for A1 most are "n/a (DB only)".

- [ ] **Step 2: EVID-HR-A1-QA.md**

Use the standing SOP template. For each of the 7 ops record:

- UI assertion (Playwright step that proved it)
- Route assertion (request log line)
- Primary DB assertion (SQL + result row)
- Side-effects (n/a + reason, or row)

Plus a root-cause-first walk section enumerating any issues found and which were batch-fixed.

- [ ] **Step 3: Commit**

```bash
git commit -m "evidence(hr-a1): SOP 4-layer verification + findings

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Pre-merge gates + handoff update

**Files:**

- Modify: `handoff/STATUS.md`
- Modify: `handoff/NEXT_SESSION.md`

- [ ] **Step 1: Full sweep**

```
pnpm -r typecheck
pnpm --filter @axhy/backend test
pnpm --filter @axhy/ai-tools run audit
```

All green.

- [ ] **Step 2: Update STATUS.md**

Replace the `Active phase` and persona-surface table to reflect HR A1 DONE. Add a new row for COMPANY_ADMIN-extended slice as `not started`. Update the F1-b 5-persona QA row to `unblocked, ready`.

- [ ] **Step 3: Update NEXT_SESSION.md**

Rewrite to capture:

- HR A1 shipped (commit hash, PR number once opened)
- Next-up: Slice 2 (COMPANY_ADMIN-extended) brainstorm OR F1-b 5-persona enterprise QA walk
- Pre-existing audit MEDIUMs (unchanged)
- Branch state on `feat/hr-a1-thin-portal` (or main after merge)
- Stashed token-check mods note (still on stash list from prior session — discard if confirmed redundant)

- [ ] **Step 4: `check_before_done`**

Call with full `flow_completeness` array (one row per HR operation + tests + audit + E2E + SOP). `screenshots_taken: true` with paths to Playwright report screenshots. `typecheck_passed`, `tests_passed`, `handoff_updated` all true.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/hr-a1-thin-portal
gh pr create --title "HR A1 — thin admin-web portal" --body "$(cat <<'EOF'
## Summary
- Build HR portal in apps/admin-web over R1-R5 backend routes
- Add GET endpoints + pod-scope middleware + HR leave-decide gate refinement
- Token cookie wiring in admin-web
- Playwright E2E water-flow + SOP 4-layer verification

## Test plan
- [ ] Backend tests pass (pnpm --filter @axhy/backend test)
- [ ] Admin-web typecheck + build (pnpm --filter admin-web typecheck && build)
- [ ] Audit: no new HIGH/BLOCKER (pre-existing 7 MEDIUMs unchanged)
- [ ] Playwright E2E green
- [ ] SOP 4-layer evidence in docs/evidence/2026-05-29/EVID-HR-A1-QA.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Commit handoff updates**

```bash
git commit -m "docs(handoff): HR A1 shipped; next: slice 2 or F1-b 5-persona QA

[ORCHESTRATOR_APPROVED] subagent-driven build per docs/plans/2026-05-29-hr-a1-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Done criteria

Per spec section 10:

- 7 HR ops work end-to-end through UI.
- Backend integration tests + leave-decide refinement tests pass against real DB.
- Playwright E2E passes (local or staging — note environment in EVID).
- SOP findings filed.
- `check_before_done` green.
- PR open against `main`.
- Pre-existing audit MEDIUMs unchanged in count.
