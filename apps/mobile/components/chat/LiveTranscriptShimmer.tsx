/**
 * LiveTranscriptShimmer — shows the in-flight transcript while Whisper is
 * resolving the held-mic recording.
 *
 * Two modes:
 *
 *   1. "uploading" — appears immediately on release, before the network
 *      round-trip completes. Renders three pulsing dots so the supervisor
 *      knows the system is processing. Uses RN `Animated` (legacy API)
 *      with `useNativeDriver: true` so the dot pulse runs on the UI
 *      thread; no `setInterval + setState`.
 *
 *   2. "reveal" — once the response lands, reveals the words one-by-one
 *      at the actual cadence the supervisor spoke (from Whisper's
 *      word-level timestamps). When `words[]` is empty (older Whisper
 *      deployment), falls back to a constant-rate reveal scaled to the
 *      full transcript over 1.5 s.
 *
 * The component unmounts when the chat surface finalises the transcript
 * into the TextInput (the parent's `transcribing` becomes `false`).
 *
 * Why no Reanimated: this project does not yet ship the
 * `react-native-worklets/plugin` babel transform required by Reanimated
 * 4.x on the new architecture. The legacy `Animated` API with
 * `useNativeDriver: true` already runs on the UI thread for opacity /
 * transform — sufficient for a pulse + word-fade. Document so the next
 * Reanimated-enabling slice knows what to upgrade.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — live transcript shimmer)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import type { TranscribeWord } from '../../lib/audio/transcribe';

/** Min duration (ms) to spend on the reveal, even for tiny transcripts. */
const MIN_REVEAL_DURATION_MS = 1200;
/** Max gap (ms) between consecutive word reveals on the fallback path. */
const FALLBACK_PER_WORD_MS = 80;
/** Pulse animation duration for the "uploading" dots. */
const PULSE_DURATION_MS = 600;

export type LiveTranscriptShimmerProps = {
  /** True while the audio is being uploaded; renders the dot pulse. */
  uploading: boolean;
  /**
   * Final transcript text. When non-empty, the component switches from
   * "uploading" to "reveal" mode and animates the words in.
   */
  text: string;
  /**
   * Per-word Whisper timestamps. If present, drives the reveal cadence
   * faithfully to what the supervisor spoke. If empty, falls back to
   * `FALLBACK_PER_WORD_MS` per word.
   */
  words: ReadonlyArray<TranscribeWord>;
};

/**
 * Inline shimmer overlay rendered above the chat capture footer while
 * transcription is in flight. Self-cleans its animation timers on unmount.
 */
export function LiveTranscriptShimmer(props: LiveTranscriptShimmerProps): JSX.Element {
  return props.text ? <RevealMode text={props.text} words={props.words} /> : <UploadingMode />;
}

// ─── "uploading" mode ────────────────────────────────────────────────────────

function UploadingMode(): JSX.Element {
  // Three dots, each one running an offset loop. Animated.Value drives
  // opacity which is one of the natively-driveable props.
  const dotOne = useRef(new Animated.Value(0.3)).current;
  const dotTwo = useRef(new Animated.Value(0.3)).current;
  const dotThree = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (value: Animated.Value, delay: number): Animated.CompositeAnimation =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: PULSE_DURATION_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: PULSE_DURATION_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

    const animations: Animated.CompositeAnimation[] = [
      pulse(dotOne, 0),
      pulse(dotTwo, PULSE_DURATION_MS / 3),
      pulse(dotThree, (2 * PULSE_DURATION_MS) / 3),
    ];
    animations.forEach((a) => a.start());

    return () => {
      animations.forEach((a) => a.stop());
    };
  }, [dotOne, dotTwo, dotThree]);

  return (
    <View
      style={s.root}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Transcribing in progress"
    >
      <Text style={s.label}>transcribing</Text>
      <View style={s.dotsRow}>
        <Animated.View style={[s.dot, { opacity: dotOne }]} />
        <Animated.View style={[s.dot, { opacity: dotTwo }]} />
        <Animated.View style={[s.dot, { opacity: dotThree }]} />
      </View>
    </View>
  );
}

// ─── "reveal" mode ───────────────────────────────────────────────────────────

type WordAnim = {
  readonly word: string;
  /** Opacity Animated.Value, drives the fade-in. */
  readonly opacity: Animated.Value;
  /** Delay (ms) from reveal start until this word fades in. */
  readonly delayMs: number;
};

function buildWordAnims(text: string, words: ReadonlyArray<TranscribeWord>): WordAnim[] {
  if (words.length > 0) {
    // Use Whisper-supplied cadence.
    const earliestStart = words[0]?.start ?? 0;
    return words.map((w) => ({
      word: w.word,
      opacity: new Animated.Value(0),
      delayMs: Math.max(0, (w.start - earliestStart) * 1000),
    }));
  }
  // Fallback: split on whitespace, distribute evenly.
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const totalMs = Math.max(MIN_REVEAL_DURATION_MS, tokens.length * FALLBACK_PER_WORD_MS);
  const per = tokens.length > 0 ? totalMs / tokens.length : 0;
  return tokens.map((t, i) => ({
    word: t,
    opacity: new Animated.Value(0),
    delayMs: i * per,
  }));
}

function RevealMode(props: { text: string; words: ReadonlyArray<TranscribeWord> }): JSX.Element {
  // Recompute anims when the input changes. Use a memo so animated values
  // are stable across re-renders of the same input.
  const [anims, setAnims] = useState<WordAnim[]>(() => buildWordAnims(props.text, props.words));

  // Re-build when inputs change.
  useEffect(() => {
    setAnims(buildWordAnims(props.text, props.words));
  }, [props.text, props.words]);

  // Kick off the per-word fade animations.
  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = anims.map((wa) =>
      Animated.sequence([
        Animated.delay(wa.delayMs),
        Animated.timing(wa.opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animations.forEach((a) => a.start());
    return () => {
      animations.forEach((a) => a.stop());
    };
  }, [anims]);

  return (
    <View style={s.root} accessibilityLabel={`Transcribed: ${props.text}`}>
      <Text style={s.label}>heard</Text>
      <View style={s.wordsRow}>
        {anims.map((wa, i) => (
          <Animated.Text key={`${wa.word}-${i}`} style={[s.word, { opacity: wa.opacity }]}>
            {wa.word}
            {i < anims.length - 1 ? ' ' : ''}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3] + 4,
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.surface.paper2,
    borderTopWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  label: {
    fontSize: 11,
    fontWeight: String(tokens.weight.semibold) as '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.color.ink.secondary,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.color.ink.secondary,
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  word: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    fontStyle: 'italic',
  },
});
