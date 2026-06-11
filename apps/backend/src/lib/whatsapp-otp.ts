/**
 * WhatsApp Cloud API OTP send wrapper.
 *
 * Mirrors the shape of the (now-deleted) MSG91 module so the auth.ts call site
 * changes by exactly one import line. WhatsApp was chosen over SMS per founder
 * direction 2026-05-25: workers all carry smartphones with WhatsApp installed,
 * and WhatsApp removes the DLT-registration blocker that delayed production
 * OTP sends under the prior MSG91 path.
 *
 * ## Operating modes
 *
 * - **Pilot / dev** (WHATSAPP_ACCESS_TOKEN unset): no-op, returns successfully.
 *   The test harness reads the OTP from the Redis OTP store directly. Same
 *   behavior as the previous MSG91 module's `!process.env.MSG91_API_KEY` path.
 *
 * - **Test mode** (token + phone_number_id set, business verification pending):
 *   Meta only delivers to phone numbers explicitly added in the WhatsApp dashboard
 *   under "To" -> Manage recipient list. Other numbers throw with a sanitized
 *   error which auth.ts maps to 500 OTP_FAILED.
 *
 * - **Production** (after Meta business verification + template approval):
 *   Delivers to any opted-in WhatsApp number that matches the approved template.
 *
 * ## Required env vars
 *
 * - `WHATSAPP_ACCESS_TOKEN` — Bearer token. 24h temporary token during testing,
 *   permanent System User token for production.
 * - `WHATSAPP_PHONE_NUMBER_ID` — Numeric ID Meta assigns to the sender number.
 * - `WHATSAPP_OTP_TEMPLATE_NAME` — Approved Authentication-category template name
 *   (e.g. "axhy_login_otp").
 * - `WHATSAPP_OTP_TEMPLATE_LANG` — Template language code (e.g. "en", "en_US").
 *
 * ## API contract
 *
 * Endpoint: `POST https://graph.facebook.com/v22.0/{phoneNumberId}/messages`
 * Headers: `Authorization: Bearer {accessToken}`, `Content-Type: application/json`
 * Body shape for an Authentication-category template with a copy-code button:
 *   {
 *     messaging_product: "whatsapp",
 *     to: "<E.164 without +>",
 *     type: "template",
 *     template: {
 *       name: "<template_name>",
 *       language: { code: "<lang>" },
 *       components: [
 *         { type: "body",   parameters: [{ type: "text", text: "<otp>" }] },
 *         { type: "button", sub_type: "url", index: "0",
 *           parameters: [{ type: "text", text: "<otp>" }] }
 *       ]
 *     }
 *   }
 *
 * @derives(ADR-0007 amendment pending — channel pivot from MSG91 to WhatsApp)
 * @derives(2026-05-25 founder direction on OTP delivery channel)
 */

const META_GRAPH_VERSION = 'v22.0';

/**
 * Send an OTP via WhatsApp Cloud API. No-op when WHATSAPP_ACCESS_TOKEN is unset
 * (pilot / dev mode); the caller still receives the code through the Redis OTP
 * store so tests can complete the verify step without delivery.
 *
 * @derives(ADR-0007)
 */
export async function sendOtpWhatsApp(input: { phone: string; code: string }): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en';

  if (!token || !phoneNumberId || !templateName) {
    // Pilot / dev mode — caller reads the code through the OTP store.
    // C6 (findings 2026-06-10): in PRODUCTION this silent no-op means real
    // customers never receive OTPs while every request returns 200 — make
    // the misconfiguration loud in logs so ops sees it immediately.
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[whatsapp-otp] WHATSAPP_* env missing in production — OTP for %s NOT delivered. ' +
          'Set WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_OTP_TEMPLATE_NAME.',
        input.phone.slice(0, 6) + '…',
      );
    }
    return;
  }

  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: input.phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: input.code }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: input.code }],
        },
      ],
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Sanitized error — do NOT leak Meta API details (may contain token echoes
    // or recipient phone numbers) into the auth.ts error log.
    throw new Error(`WhatsApp OTP send failed: HTTP ${res.status}`);
  }
}
