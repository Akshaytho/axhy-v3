/**
 * Test fixture — minimal XState machine for extractor unit tests.
 * @derives(ADR-0002)
 */
import { setup } from 'xstate';

export const visitMachine = setup({}).createMachine({
  id: 'visit',
  initial: 'DISPATCHED',
  states: {
    DISPATCHED: {
      on: { START: 'STARTED' },
    },
    STARTED: {
      on: {
        END: 'ENDED',
        ABORT: 'ABORTED',
      },
    },
    ENDED: { type: 'final' },
    ABORTED: { type: 'final' },
  },
});
