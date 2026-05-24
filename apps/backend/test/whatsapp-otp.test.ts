/**
 * Unit tests for the WhatsApp Cloud API OTP send wrapper.
 *
 * No real Meta API calls — global.fetch is mocked via vi.spyOn so the test
 * runs in isolation without a network and without requiring real credentials.
 *
 * Covers the three contracts in sendOtpWhatsApp:
 *   1. Pilot / dev mode: env vars unset -> no-op, returns successfully, no fetch.
 *   2. Test/prod mode: env vars set -> POSTs to graph.facebook.com with the
 *      Authentication-category template body shape.
 *   3. Failure mode: non-2xx Meta response -> throws with a sanitized error.
 *
 * @derives(ADR-0007 amendment pending)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { sendOtpWhatsApp } from '../src/lib/whatsapp-otp.js';

const ENV_KEYS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_OTP_TEMPLATE_NAME',
  'WHATSAPP_OTP_TEMPLATE_LANG',
] as const;

let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  originalEnv = {};
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  vi.restoreAllMocks();
});

describe('sendOtpWhatsApp', () => {
  it('is a no-op when WHATSAPP_ACCESS_TOKEN is unset (pilot / dev mode)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await expect(
      sendOtpWhatsApp({ phone: '+919999999999', code: '123456' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs the Authentication-template body shape to graph.facebook.com when env vars are set', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token-abc';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'axhy_login_otp';
    process.env.WHATSAPP_OTP_TEMPLATE_LANG = 'en_US';

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 }),
      );

    await sendOtpWhatsApp({ phone: '+919999988888', code: '654321' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v22.0/1234567890/messages');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token-abc');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('919999988888'); // stripped leading +
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('axhy_login_otp');
    expect(body.template.language.code).toBe('en_US');
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '654321' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: '654321' }],
      },
    ]);
  });

  it('defaults template language to "en" when WHATSAPP_OTP_TEMPLATE_LANG is unset', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token-abc';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'axhy_login_otp';

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await sendOtpWhatsApp({ phone: '+919999988888', code: '111111' });

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.template.language.code).toBe('en');
  });

  it('throws a sanitized error when Meta returns non-2xx (no token / phone echoes)', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'leak-me-not-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'axhy_login_otp';

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 131030, message: 'Recipient phone number not in allowed list' },
        }),
        { status: 400 },
      ),
    );

    let thrown: unknown;
    try {
      await sendOtpWhatsApp({ phone: '+919999988888', code: '999999' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const msg = (thrown as Error).message;
    expect(msg).toBe('WhatsApp OTP send failed: HTTP 400');
    expect(msg).not.toContain('leak-me-not-token');
    expect(msg).not.toContain('919999988888');
    expect(msg).not.toContain('Recipient phone');
  });
});
