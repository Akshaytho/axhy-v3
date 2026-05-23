/**
 * captureMachine transition tests.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';

import { captureMachine, CAPTURE_STEP_ORDER } from './capture.js';

describe('captureMachine', () => {
  it('starts in IDLE with step null', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('IDLE');
    expect(snap.context.visitId).toBe('v1');
    expect(snap.context.step).toBeNull();
  });

  it('START_CAPTURE moves to CAPTURING at the first step', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'START_CAPTURE' });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('CAPTURING');
    expect(snap.context.step).toBe(CAPTURE_STEP_ORDER[0]);
  });

  it('NAV_TO_STEP updates context.step while staying in CAPTURING', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'START_CAPTURE' });
    actor.send({ type: 'NAV_TO_STEP', step: 'after-photos' });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('CAPTURING');
    expect(snap.context.step).toBe('after-photos');
  });

  it('SUBMIT moves to SUBMITTED', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'START_CAPTURE' });
    actor.send({ type: 'SUBMIT' });
    expect(actor.getSnapshot().value).toBe('SUBMITTED');
  });

  it('RESET returns to IDLE from CAPTURING', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'START_CAPTURE' });
    actor.send({ type: 'NAV_TO_STEP', step: 'before-photos' });
    actor.send({ type: 'RESET' });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('IDLE');
    expect(snap.context.step).toBeNull();
  });

  it('RESET returns to IDLE from SUBMITTED', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'START_CAPTURE' });
    actor.send({ type: 'SUBMIT' });
    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('IDLE');
  });

  it('NAV_TO_STEP from IDLE is ignored (no implicit start)', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'NAV_TO_STEP', step: 'review' });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('IDLE');
    expect(snap.context.step).toBeNull();
  });

  it('SUBMIT from IDLE is ignored', () => {
    const actor = createActor(captureMachine, { input: { visitId: 'v1' } }).start();
    actor.send({ type: 'SUBMIT' });
    expect(actor.getSnapshot().value).toBe('IDLE');
  });

  it('CAPTURE_STEP_ORDER has the 6 expected steps in order', () => {
    expect(CAPTURE_STEP_ORDER).toEqual([
      'qr-scan',
      'before-photos',
      'timer',
      'after-photos',
      'review',
      'submit',
    ]);
  });
});
