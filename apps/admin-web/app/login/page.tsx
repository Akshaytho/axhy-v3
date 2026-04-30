/**
 * Login `/login` — Direction A panel-corrected from Claude Design output.
 *
 * Source design: claude.ai/design — TmrynxzoHw_sU0MFNxvWvw — login.html.
 *
 * Panel corrections applied 2026-04-30 (vs Claude Design's raw output):
 *   - Demo OTP logic ('any non-000000 succeeds') REMOVED. Wires to real
 *     POST /auth/otp/request and /auth/otp/verify on the Axhy backend.
 *     (Vinod + Aanya: ship-blocker.)
 *   - Token storage NOT implemented in this page. On 200 from /verify the
 *     page transitions to the success step and routes to '/'. Token
 *     persistence + session strategy (cookie vs localStorage) is its own
 *     panel debate, deferred until /admin home exists.
 *   - Inline 'Privacy and Terms' consent line now points at the real
 *     /privacy and /terms pages we just shipped (Tanvi).
 *   - WhatsApp escape link uses shared <WhatsAppButton/> with prefill text.
 *   - Phone auto-prefix '+91 ' kept (Priya — India-default UX).
 *   - Minimal top bar (single Logo only) — no main nav per brief.
 *
 * Backend URL configured via NEXT_PUBLIC_AXHY_API_URL.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — login critique)
 */

'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { env } from '../../lib/env';
import { Logo } from '../_components/Logo';
import { WhatsAppButton } from '../_components/WhatsAppButton';

const API_URL = env.NEXT_PUBLIC_AXHY_API_URL;

type Step = 'phone' | 'code' | 'success';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    if (step === 'code') {
      const t = setTimeout(() => otpInputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    if (step === 'phone') {
      const t = setTimeout(() => phoneInputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    if (step === 'success') {
      const t = setTimeout(() => router.push('/owner'), 1400);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  function handlePhoneInput(value: string) {
    setPhoneError(null);
    let v = value.replace(/[^\d+]/g, '');
    if (v && !v.startsWith('+')) v = '+91 ' + v;
    setPhone(v);
  }

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneError('Enter a valid phone number.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+' + digits }),
      });
      if (res.status === 429) {
        setPhoneError('Too many attempts. Try again in a few minutes.');
        return;
      }
      if (!res.ok) {
        setPhoneError('Could not send code. Check your number and try again.');
        return;
      }
      setStep('code');
      setResendSeconds(60);
    } catch {
      setPhoneError('Network issue. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) {
      setOtpError('Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const res = await fetch(`${API_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+' + digits, code: otp }),
      });
      if (!res.ok) {
        setOtpError('Incorrect code. Try again.');
        return;
      }
      setStep('success');
    } catch {
      setOtpError('Network issue. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendSeconds > 0) return;
    const digits = phone.replace(/\D/g, '');
    setResendSeconds(60);
    setOtp('');
    try {
      await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+' + digits }),
      });
    } catch {
      /* swallow — UX shows the timer either way */
    }
  }

  function handleChangePhone() {
    setStep('phone');
    setOtp('');
    setOtpError(null);
  }

  return (
    <div className="page">
      <header className="login-bar">
        <Logo />
      </header>

      <main className="login-shell">
        <div className="login-card">
          {step === 'phone' && (
            <section className="login-step">
              <h1 className="login-h1">Sign in to Axhy.</h1>
              <p className="login-sub">
                Enter your phone number and we&apos;ll send a 6-digit code.
              </p>

              <form onSubmit={handlePhoneSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    placeholder="+91 98765 43210"
                    className={phoneError ? 'login-input login-input-error' : 'login-input'}
                  />
                  {phoneError && (
                    <p className="login-field-error" role="alert">
                      <ErrorIcon /> {phoneError}
                    </p>
                  )}
                </div>
                <div className="login-submit-row">
                  <button type="submit" className="btn btn-primary login-submit" disabled={sending}>
                    {sending ? 'Sending…' : 'Send OTP'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {step === 'code' && (
            <section className="login-step">
              <h1 className="login-h1">Sign in to Axhy.</h1>
              <p className="login-sub">
                We sent a 6-digit code to <span className="mono login-phone-echo">{phone}</span>.
              </p>

              <form onSubmit={handleOtpSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="otp">6-digit code</label>
                  <input
                    id="otp"
                    ref={otpInputRef}
                    className={
                      otpError
                        ? 'login-input login-input-otp login-input-error'
                        : 'login-input login-input-otp'
                    }
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => {
                      setOtpError(null);
                      setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                  />
                  {otpError && (
                    <p className="login-field-error" role="alert">
                      <ErrorIcon /> {otpError}
                    </p>
                  )}
                  <div className="login-resend-row">
                    <span>
                      {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Didn’t get it?'}
                    </span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendSeconds > 0}
                      className="login-resend-btn"
                    >
                      Resend code
                    </button>
                  </div>
                </div>
                <div className="login-submit-row">
                  <button
                    type="submit"
                    className="btn btn-primary login-submit"
                    disabled={verifying}
                  >
                    {verifying ? 'Verifying…' : 'Verify and continue'}
                  </button>
                </div>
                <div className="login-alt">
                  <button type="button" onClick={handleChangePhone}>
                    Use a different phone number
                  </button>
                </div>
              </form>
            </section>
          )}

          {step === 'success' && (
            <section className="login-step login-success">
              <div className="login-check" aria-hidden="true">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              </div>
              <h2 className="login-success-h2">You&apos;re signed in.</h2>
              <div className="login-redirect">
                <span className="login-spinner" aria-hidden="true" />
                <span>Redirecting…</span>
              </div>
            </section>
          )}

          {step !== 'success' && (
            <div className="login-below">
              <p className="login-consent">
                By signing in you agree to our{' '}
                <a href="/privacy" className="login-consent-link">
                  Privacy
                </a>{' '}
                and{' '}
                <a href="/terms" className="login-consent-link">
                  Terms
                </a>
                .
              </p>
              <WhatsAppButton
                label="Trouble signing in? WhatsApp us."
                size="md"
                variant="secondary"
                className="login-escape"
                prefill="Hi, I'm having trouble signing into Axhy."
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5M8 11v.01" />
    </svg>
  );
}
