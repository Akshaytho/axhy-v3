/**
 * @axhy/state-machines — captureMachine
 *
 * Local UI-progress machine that tracks the worker's position in the 6-step
 * photo capture flow. NOT backend-synced — only mobile reads this machine to
 * decide where ResumeCaptureBanner should deep-link.
 *
 * This machine is completely independent of `visitMachine`. The
 * `PHOTOS_UPLOADED` event on `visitMachine` fires from the backend Submit
 * route (2b-3), not from this machine.
 *
 * States:
 *   - IDLE         — no capture started; mobile shows "Start" CTA.
 *   - CAPTURING    — worker is in one of the 6 steps; `context.step` identifies which.
 *   - SUBMITTED    — worker hit Submit; the visit is now in the backend's hands.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { assign, setup } from 'xstate';

/** The 6 capture-flow steps. Order matches mobile `lib/api-routes.ts` CAPTURE_STEPS.
 *  @derives(master-plan §G) */
export type CaptureStep =
  | 'qr-scan'
  | 'before-photos'
  | 'timer'
  | 'after-photos'
  | 'review'
  | 'submit';

/** @derives(master-plan §G) */
export const CAPTURE_STEP_ORDER: ReadonlyArray<CaptureStep> = [
  'qr-scan',
  'before-photos',
  'timer',
  'after-photos',
  'review',
  'submit',
] as const;

/** @derives(master-plan §G) */
export type CaptureStateValue = 'IDLE' | 'CAPTURING' | 'SUBMITTED';

/** @derives(master-plan §G) */
export type CaptureEvent =
  | { type: 'START_CAPTURE' }
  | { type: 'NAV_TO_STEP'; step: CaptureStep }
  | { type: 'SUBMIT' }
  | { type: 'RESET' };

/** @derives(master-plan §G) */
export type CaptureContext = {
  visitId: string;
  step: CaptureStep | null;
};

/** @derives(master-plan §G) */
export const captureMachine = setup({
  types: {
    context: {} as CaptureContext,
    events: {} as CaptureEvent,
    input: {} as { visitId?: string },
  },
}).createMachine({
  id: 'capture',
  initial: 'IDLE',
  context: ({ input }) => ({
    visitId: input.visitId ?? '',
    step: null,
  }),
  states: {
    IDLE: {
      on: {
        START_CAPTURE: {
          target: 'CAPTURING',
          actions: assign({ step: () => CAPTURE_STEP_ORDER[0] ?? null }),
        },
      },
    },
    CAPTURING: {
      on: {
        NAV_TO_STEP: {
          actions: assign({ step: ({ event }) => event.step }),
        },
        SUBMIT: 'SUBMITTED',
        RESET: {
          target: 'IDLE',
          actions: assign({ step: () => null }),
        },
      },
    },
    SUBMITTED: {
      on: {
        RESET: {
          target: 'IDLE',
          actions: assign({ step: () => null }),
        },
      },
    },
  },
});

/** @derives(master-plan §G) */
export type CaptureMachine = typeof captureMachine;
