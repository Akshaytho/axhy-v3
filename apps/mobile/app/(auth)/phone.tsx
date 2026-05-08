/**
 * Phone entry screen — first step of OTP sign-in flow.
 * @derives(ADR-0007)
 */

import { useState } from 'react';
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
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { RequestOTPOutput } from '@axhy/shared-schema';

import { apiFetch, ApiError } from '../../lib/api';

export default function PhoneScreen() {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetOtp() {
    const trimmed = digits.trim();
    if (trimmed.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setLoading(true);
    const phone = `+91${trimmed}`;
    try {
      await apiFetch<RequestOTPOutput>('/auth/otp/request', {
        method: 'POST',
        body: { phone },
        auth: false,
      });
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Wait 15 min.');
      } else {
        setError('Could not send OTP. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.inner}>
        <Text style={s.brand}>Axhy</Text>
        <Text style={s.heading}>Sign in</Text>
        <Text style={s.sub}>Enter your mobile number to continue.</Text>

        <View style={s.inputRow}>
          <View style={s.prefix}>
            <Text style={s.prefixText}>+91</Text>
          </View>
          <TextInput
            style={s.input}
            value={digits}
            onChangeText={(t) => {
              setError(null);
              setDigits(t.replace(/\D/g, '').slice(0, 10));
            }}
            placeholder="98765 43210"
            placeholderTextColor={tokens.color.ink.placeholder}
            keyboardType="phone-pad"
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={handleGetOtp}
            autoFocus
          />
        </View>

        {error !== null && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity
          style={[s.btn, (loading || digits.length !== 10) && s.btnDisabled]}
          onPress={handleGetOtp}
          disabled={loading || digits.length !== 10}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={tokens.color.surface.paper} />
          ) : (
            <Text style={s.btnText}>Get OTP</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  inner: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    justifyContent: 'center',
    paddingBottom: tokens.space[10],
  },
  brand: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accent,
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
    marginBottom: tokens.space[3],
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.card,
    marginBottom: tokens.space[2],
    overflow: 'hidden',
  },
  prefix: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[3],
    borderRightWidth: 1,
    borderRightColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper2,
  },
  prefixText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.secondary,
  },
  input: {
    flex: 1,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[3],
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    letterSpacing: 2,
  },
  error: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[2],
    paddingHorizontal: tokens.space[1],
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
});
