/**
 * Worker — Request leave.
 *
 * The worker's self-service time-off screen and the missing entry point for
 * the already-built leave pipeline (POST /leave-requests → HR/supervisor
 * inbox → approve/reject → Worker ON_LEAVE on approval). The worker only
 * REQUESTS — they cannot self-grant. This is NOT a resign/terminate surface
 * (founder lock 2026-05-18 covers only those); time-off requests are routine
 * and worker-originated by design.
 *
 * Dependency-free date selection: a "start in N days" stepper + a "how many
 * days" stepper, so there's no date-picker native module to add. Dates are
 * sent as calendar-day 'YYYY-MM-DD'.
 *
 * @derives(master-plan §G) — worker surface
 * @derives(ADR-0007)
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from '../../components/worker/WCard';
import { useWorkerTodayQuery } from '../../lib/queries/use-worker-today';
import { submitLeaveRequest } from '../../lib/api-leave';

const MAX_START_OFFSET = 60; // can request up to 60 days out
const MAX_DAYS = 14; // single request spans at most two weeks
const MAX_REASON = 500;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/** Calendar-day 'YYYY-MM-DD' in the device's local zone. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Human label like "Mon, 9 Jun" — hand-rolled to avoid Intl reliance on Hermes. */
function pretty(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

interface StepperProps {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: StepperProps): React.JSX.Element {
  return (
    <View style={s.stepperRow}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={decDisabled}
          onPress={onDec}
          hitSlop={8}
          style={({ pressed }) => [
            s.stepBtn,
            decDisabled && s.stepBtnDisabled,
            pressed && !decDisabled && { opacity: 0.7 },
          ]}
        >
          <Feather
            name="minus"
            size={18}
            color={decDisabled ? tokens.color.ink.tertiary : tokens.color.ink.primary}
          />
        </Pressable>
        <Text style={s.stepValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={incDisabled}
          onPress={onInc}
          hitSlop={8}
          style={({ pressed }) => [
            s.stepBtn,
            incDisabled && s.stepBtnDisabled,
            pressed && !incDisabled && { opacity: 0.7 },
          ]}
        >
          <Feather
            name="plus"
            size={18}
            color={incDisabled ? tokens.color.ink.tertiary : tokens.color.ink.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

/** @derives(master-plan §G) */
export default function WorkerLeaveRequest(): React.JSX.Element {
  const { data, isLoading, isError, refetch, isRefetching } = useWorkerTodayQuery();

  const [startOffset, setStartOffset] = useState(0);
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const today = useMemo(() => startOfToday(), []);
  const fromDate = useMemo(() => addDays(today, startOffset), [today, startOffset]);
  const toDate = useMemo(() => addDays(fromDate, days - 1), [fromDate, days]);

  const workerId = data?.workerId;
  const trimmedReason = reason.trim();
  const profileMissing = !workerId && !isLoading;
  const canSubmit =
    !!workerId && trimmedReason.length > 0 && status !== 'submitting' && status !== 'success';

  async function onSubmit(): Promise<void> {
    if (!workerId || trimmedReason.length === 0) return;
    setStatus('submitting');
    setErrorMsg(null);
    try {
      await submitLeaveRequest({
        workerId,
        fromDate: ymd(fromDate),
        toDate: ymd(toDate),
        reason: trimmedReason,
      });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't send your request. Check your connection and try again.",
      );
    }
  }

  const startLabel = startOffset === 0 ? 'Today' : pretty(fromDate);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={s.iconBtn}
        >
          <Feather name="chevron-left" size={26} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.headerTitle}>Request leave</Text>
        <View style={s.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {status === 'success' ? (
            <View style={s.section}>
              <WCard padding={20}>
                <View style={s.successWrap}>
                  <View style={s.successIcon}>
                    <Feather name="check" size={28} color={tokens.color.semantic.ok} />
                  </View>
                  <Text style={s.successTitle}>Leave request sent</Text>
                  <Text style={s.successBody}>
                    {`You asked to be off ${pretty(fromDate)}${
                      days > 1 ? ` → ${pretty(toDate)}` : ''
                    } (${days} day${days === 1 ? '' : 's'}).`}
                  </Text>
                  <Text style={s.successBody}>
                    Your supervisor will review it. You&apos;ll see the result on your profile.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    onPress={() => router.back()}
                    style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={s.primaryBtnText}>Done</Text>
                  </Pressable>
                </View>
              </WCard>
            </View>
          ) : (
            <>
              <View style={s.section}>
                <Text style={s.intro}>
                  Tell your supervisor when you&apos;ll be away. They approve or decline — you
                  don&apos;t go on leave until it&apos;s approved.
                </Text>
              </View>

              <View style={s.section}>
                <WCard padding={16}>
                  <Text style={s.sectionMono}>WHEN</Text>
                  <Stepper
                    label="Starting"
                    value={startLabel}
                    decDisabled={startOffset <= 0}
                    incDisabled={startOffset >= MAX_START_OFFSET}
                    onDec={() => setStartOffset((v) => Math.max(0, v - 1))}
                    onInc={() => setStartOffset((v) => Math.min(MAX_START_OFFSET, v + 1))}
                  />
                  <View style={s.divider} />
                  <Stepper
                    label="For how long"
                    value={`${days} day${days === 1 ? '' : 's'}`}
                    decDisabled={days <= 1}
                    incDisabled={days >= MAX_DAYS}
                    onDec={() => setDays((v) => Math.max(1, v - 1))}
                    onInc={() => setDays((v) => Math.min(MAX_DAYS, v + 1))}
                  />
                  <View style={s.summaryBox}>
                    <Feather name="calendar" size={14} color={tokens.color.ink.secondary} />
                    <Text style={s.summaryText}>
                      {days > 1
                        ? `Away ${pretty(fromDate)} → ${pretty(toDate)}`
                        : `Away ${pretty(fromDate)}`}
                    </Text>
                  </View>
                </WCard>
              </View>

              <View style={s.section}>
                <WCard padding={16}>
                  <Text style={s.sectionMono}>REASON</Text>
                  <TextInput
                    style={s.reasonInput}
                    placeholder="e.g. Family function, not feeling well…"
                    placeholderTextColor={tokens.color.ink.tertiary}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    maxLength={MAX_REASON}
                    textAlignVertical="top"
                    accessibilityLabel="Reason for leave"
                  />
                  <Text style={s.charCount}>{`${reason.length}/${MAX_REASON}`}</Text>
                </WCard>
              </View>

              {profileMissing ? (
                <View style={s.section}>
                  <View style={s.warnBanner}>
                    <Text style={s.warnText}>
                      Couldn&apos;t load your profile, so we can&apos;t send a request yet.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading profile"
                      onPress={() => {
                        void refetch();
                      }}
                      style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={s.retryText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {status === 'error' && errorMsg ? (
                <View style={s.section}>
                  <View style={s.errorBanner}>
                    <Feather name="alert-triangle" size={16} color={tokens.color.semantic.bad} />
                    <Text style={s.errorText}>{errorMsg}</Text>
                  </View>
                </View>
              ) : null}

              <View style={s.section}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send leave request"
                  disabled={!canSubmit}
                  onPress={() => {
                    void onSubmit();
                  }}
                  style={({ pressed }) => [
                    s.primaryBtn,
                    !canSubmit && s.primaryBtnDisabled,
                    pressed && canSubmit && { opacity: 0.9 },
                  ]}
                >
                  {status === 'submitting' ? (
                    <ActivityIndicator color={tokens.color.surface.paper} />
                  ) : (
                    <Text style={s.primaryBtnText}>
                      {status === 'error' ? 'Try again' : 'Send request'}
                    </Text>
                  )}
                </Pressable>
                {isLoading && !data ? (
                  <Text style={s.loadingHint}>Loading your profile…</Text>
                ) : isError && !data ? (
                  <Text style={s.loadingHint}>
                    Profile didn&apos;t load — tap Retry above before sending.
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
    backgroundColor: tokens.color.surface.card,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  scroll: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.ink.secondary,
  },
  sectionMono: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.color.ink.tertiary,
    marginBottom: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    flex: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.surface.paper3,
  },
  stepBtnDisabled: {
    opacity: 0.5,
  },
  stepValue: {
    minWidth: 96,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.surface.paper3,
    marginVertical: 14,
  },
  summaryBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.color.surface.paper2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.ink.primary,
  },
  reasonInput: {
    minHeight: 96,
    fontSize: 15,
    color: tokens.color.ink.primary,
    lineHeight: 21,
    padding: 0,
  },
  charCount: {
    marginTop: 8,
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    textAlign: 'right',
  },
  primaryBtn: {
    marginTop: 4,
    minHeight: tokens.tap.minMobile,
    borderRadius: 14,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    backgroundColor: tokens.color.surface.paper3,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.surface.paper,
  },
  loadingHint: {
    marginTop: 10,
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.color.semantic.badSoft,
    borderWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: tokens.color.semantic.bad,
    fontWeight: '600',
  },
  warnBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.color.semantic.warnSoft,
    borderWidth: 1,
    borderColor: tokens.color.semantic.warn,
    gap: 10,
  },
  warnText: {
    fontSize: 13,
    color: tokens.color.semantic.warn,
    fontWeight: '600',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: tokens.color.surface.paper,
    fontSize: 13,
    fontWeight: '700',
  },
  successWrap: {
    alignItems: 'center',
    gap: 10,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.semantic.okSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  successBody: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
  },
});
