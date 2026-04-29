/**
 * MSG91 OTP send wrapper.
 *
 * In production, calls MSG91's HTTP API to deliver OTP via SMS in IN region.
 * In dev / test, when AXHY_OTP_BYPASS=1, returns success without sending — the
 * test reads the OTP from the OTP store directly.
 *
 * @derives(ADR-0007)
 */

const ENDPOINT = 'https://control.msg91.com/api/v5/otp';

/**
 * Send an OTP SMS. In test mode (AXHY_OTP_BYPASS=1), this is a no-op.
 *
 * @derives(ADR-0007)
 */
export async function sendOtpSms(input: { phone: string; code: string }): Promise<void> {
  if (process.env.AXHY_OTP_BYPASS === '1' || !process.env.MSG91_API_KEY) {
    // Test / pilot mode — caller will get the code through the OTP store.
    return;
  }
  const params = new URLSearchParams({
    template_id: process.env.MSG91_TEMPLATE_ID ?? '',
    mobile: input.phone.replace(/^\+/, ''),
    otp: input.code,
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: process.env.MSG91_API_KEY ?? '',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`MSG91 send failed: HTTP ${res.status} ${await res.text()}`);
  }
}
