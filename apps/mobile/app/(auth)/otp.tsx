/**
 * OTP verification screen — second step of sign-in flow.
 *
 * F-006a: identified login now flows through `onIdentifiedLogin(authResult)`
 * from `identity-lifecycle.ts` (ONE explicit identity contract). On success,
 * the PushPermissionPrompt modal renders, and `router.replace(...)` fires
 * EXACTLY ONCE across all 5 prompt branches (Pick 5 v2 contract).
 *
 * @derives(ADR-0007)
 * @derives(F-006a scope round-2 v6 Pick 2)
 * @derives(F-006a scope round-2 v6 Pick 5)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { VerifyOTPOutput, RequestOTPOutput } from '@axhy/shared-schema';

import { apiFetch, ApiError } from '../../lib/api';
import { API_ROUTES, NAV_ROUTES } from '../../lib/api-routes';
import { clearPendingAuthPhone, getPendingAuthPhone } from '../../lib/auth-pending-phone';
import {
  onIdentifiedLogin,
  NonSupervisorRoleNotSupportedError,
} from '../../lib/identity-lifecycle';
import PushPermissionPrompt from '../../components/PushPermissionPrompt';

const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneReady, setPhoneReady] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [identifiedLoginComplete, setIdentifiedLoginComplete] = useState(false);
  const verifyInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void getPendingAuthPhone().then((storedPhone) => {
      if (!alive) return;
      setPhone(storedPhone);
      setPhoneReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleVerify = useCallback(async () => {
    if (verifyInFlightRef.current || loading || code.length !== 6 || !phone) return;
    setError(null);
    verifyInFlightRef.current = true;
    setLoading(true);
    try {
      const result = await apiFetch<VerifyOTPOutput>(API_ROUTES.authOtpVerify, {
        method: 'POST',
        body: { phone, code },
        auth: false,
      });
      await onIdentifiedLogin(result);
      // F-006b 2026-05-21: branch on the JWT-scoped role. WORKER continues into
      // the worker auth flow (permissions → consent → /(worker)/index). SUPERVISOR
      // hands off to PushPermissionPrompt as before.
      const role = result.memberships[0]?.role;
      if (role === 'WORKER') {
        await clearPendingAuthPhone();
        router.replace(NAV_ROUTES.authPermissions);
        return;
      }
      // Hand off to PushPermissionPrompt — it owns the exactly-once nav contract.
      await clearPendingAuthPhone();
      setIdentifiedLoginComplete(true);
    } catch (err) {
      if (err instanceof NonSupervisorRoleNotSupportedError) {
        setError(err.message);
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setError('Wrong code. Check the SMS and try again.');
      } else {
        setError('Verification failed. Check your connection and try again.');
      }
    } finally {
      verifyInFlightRef.current = false;
      setLoading(false);
    }
  }, [code, phone]);

  const handlePromptComplete = useCallback(() => {
    router.replace(NAV_ROUTES.supervisorMe);
  }, []);

  async function handleResend() {
    if (!phone || countdown > 0 || resending || resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setResending(true);
    setError(null);
    try {
      await apiFetch<RequestOTPOutput>(API_ROUTES.authOtpRequest, {
        method: 'POST',
        body: { phone },
        auth: false,
      });
      setCountdown(RESEND_SECONDS);
      setCode('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Wait 15 min.');
      } else {
        setError('Could not resend OTP. Try again.');
      }
    } finally {
      resendInFlightRef.current = false;
      setResending(false);
    }
  }

  const maskedPhone = phone
    ? `+91 ${phone.slice(-10, -6).replace(/\d/g, '•')}${phone.slice(-4)}`
    : '';

  if (!phoneReady) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.fallback}>
          <ActivityIndicator color={tokens.color.brand.accent} />
          <Text style={s.fallbackText}>Loading your sign-in step…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!phone) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.fallback}>
          <Text style={s.heading}>Start again</Text>
          <Text style={s.sub}>We need your mobile number before we can verify an OTP.</Text>
          <TouchableOpacity
            style={s.btn}
            onPress={() => router.replace(NAV_ROUTES.authPhone)}
            accessibilityLabel="Back to sign in"
          >
            <Text style={s.btnText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={s.kb} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.inner}>
          <TouchableOpacity style={s.back} onPress={() => router.back()}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={s.heading}>Enter OTP</Text>
          <Text style={s.sub}>Sent to {maskedPhone}</Text>

          <TextInput
            style={s.input}
            value={code}
            onChangeText={(t) => {
              setError(null);
              setCode(t.replace(/\D/g, '').slice(0, 6));
            }}
            placeholder="------"
            placeholderTextColor={tokens.color.ink.placeholder}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleVerify}
            autoComplete="one-time-code"
            accessibilityLabel="One-time password"
            testID="auth-otp-input"
            autoFocus
            textAlign="center"
          />

          {error !== null && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity
            style={[s.btn, (loading || code.length !== 6) && s.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
            activeOpacity={0.8}
            accessibilityLabel="Verify OTP"
            testID="auth-otp-submit"
          >
            {loading ? (
              <ActivityIndicator color={tokens.color.surface.paper} />
            ) : (
              <Text style={s.btnText}>Verify</Text>
            )}
          </TouchableOpacity>

          <View style={s.resendRow}>
            {countdown > 0 ? (
              <Text style={s.resendTimer}>Resend OTP in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                <Text style={[s.resendLink, resending && s.resendLinkDisabled]}>
                  {resending ? 'Sending…' : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {identifiedLoginComplete && <PushPermissionPrompt onComplete={handlePromptComplete} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  kb: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    justifyContent: 'center',
    paddingBottom: tokens.space[10],
  },
  back: {
    position: 'absolute',
    top: tokens.space[2],
    left: tokens.space[4],
  },
  backText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  heading: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: tokens.type.display.tracking,
    marginBottom: tokens.space[1],
  },
  sub: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    marginBottom: tokens.space[6],
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.card,
    paddingVertical: tokens.space[4],
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: 12,
    marginBottom: tokens.space[2],
  },
  error: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[2],
    textAlign: 'center',
  },
  btn: {
    marginTop: tokens.space[3],
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
  resendRow: {
    marginTop: tokens.space[5],
    alignItems: 'center',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[5],
    gap: tokens.space[3],
  },
  fallbackText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  resendTimer: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
  },
  resendLink: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  resendLinkDisabled: {
    opacity: 0.5,
  },
});
