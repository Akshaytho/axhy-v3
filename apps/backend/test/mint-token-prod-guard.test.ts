/**
 * F1-a: mint-token.ts must refuse production NODE_ENV and SUPER_ADMIN role.
 * @derives(F1 trust model 2026-05-27)
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(here, '../scripts/mint-token.ts');

function run(env: Record<string, string>, ...args: string[]) {
  return spawnSync('pnpm', ['tsx', SCRIPT, ...args], {
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
