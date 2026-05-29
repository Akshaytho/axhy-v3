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
