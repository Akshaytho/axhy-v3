import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { NAV_ROUTES } from '../../lib/api-routes';
import { useWorkerTodayQuery } from '../../lib/queries/use-worker-today';
import { pickWorkerCaptureVisit, type WorkerTodayVisit } from '../../lib/worker-today-helpers';

/**
 * Redirect tab that always opens the worker's most relevant capture flow.
 *
 * Routes by visit state so the worker never re-enters a step they already
 * completed — e.g. PHOTOS_PENDING jumps straight to /review, not /qr-scan.
 * Terminal states (VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED) open
 * the read-only visit detail screen instead of the capture flow.
 *
 * @derives(master-plan §G) — worker capture launcher
 */
export default function WorkerCaptureLauncher(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useWorkerTodayQuery();
  const [handoffStarted, setHandoffStarted] = useState(false);
  const visit = !isLoading && !isError ? pickWorkerCaptureVisit(data) : null;
  const showEmpty = !isLoading && !isError && !visit;

  useEffect(() => {
    if (isLoading || isError) return;
    if (visit) {
      setHandoffStarted(true);
      router.replace(pickStepRoute(visit));
    }
  }, [isError, isLoading, visit]);

  useEffect(() => {
    if (isLoading) setHandoffStarted(false);
  }, [isLoading]);

  if (isError) {
    return (
      <View style={s.center}>
        <Text style={s.title}>Couldn&apos;t open Capture.</Text>
        <Text style={s.body}>Check your connection and try again.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => {
            void refetch();
          }}
          style={({ pressed }) => [s.button, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={s.center}>
        <Text style={s.title}>Nothing to capture right now.</Text>
        <Text style={s.body}>
          You don&apos;t have a visit ready for capture. Pull for new work or head back to your home
          screen.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check again"
          onPress={() => {
            void refetch();
          }}
          style={({ pressed }) => [s.button, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.buttonText}>Check again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to home"
          onPress={() => {
            router.replace(NAV_ROUTES.workerHome);
          }}
          style={({ pressed }) => [s.secondaryButton, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.secondaryButtonText}>Go to home</Text>
        </Pressable>
      </View>
    );
  }

  if (handoffStarted) return <View style={s.blank} />;

  return (
    <View style={s.center}>
      <ActivityIndicator color={tokens.color.brand.accent} />
      <Text style={s.body}>Opening your capture flow…</Text>
    </View>
  );
}

const TERMINAL_VISIT_STATES = new Set(['VERIFIED', 'FLAGGED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED']);

/**
 * Decide which screen to drop the worker on based on visit state.
 * Terminal -> read-only detail. Awaiting verify -> submit poller.
 * Photos taken but not submitted -> review. In progress -> timer.
 * Pre-arrival states -> qr-scan entry (original default).
 */
function pickStepRoute(picked: WorkerTodayVisit): string {
  if (TERMINAL_VISIT_STATES.has(picked.state)) {
    return NAV_ROUTES.workerVisitDetail(picked.id);
  }
  if (picked.state === 'AWAITING_VERIFICATION') {
    return NAV_ROUTES.workerCaptureStep(picked.id, 'submit');
  }
  if (picked.state === 'PHOTOS_PENDING') {
    return NAV_ROUTES.workerCaptureStep(picked.id, 'review');
  }
  if (picked.state === 'IN_PROGRESS') {
    return NAV_ROUTES.workerCaptureStep(picked.id, 'timer');
  }
  return NAV_ROUTES.workerCaptureEntry(picked.id);
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[5],
    backgroundColor: tokens.color.surface.paper,
  },
  blank: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  title: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  body: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
    lineHeight: tokens.type.body.size * 1.4,
  },
  button: {
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: tokens.space[5],
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
  secondaryButton: {
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: tokens.space[5],
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.color.ink.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
});
