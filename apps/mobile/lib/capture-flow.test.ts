import { describe, expect, it } from 'vitest';

import {
  beforePhaseAdvanceStep,
  nextOpenCaptureSlot,
  shouldRetryFailedUpload,
} from './capture-flow';

describe('capture-flow helpers', () => {
  it('finds the first missing capture slot', () => {
    expect(nextOpenCaptureSlot([], 3)).toBe(1);
    expect(nextOpenCaptureSlot([2, 3], 3)).toBe(1);
    expect(nextOpenCaptureSlot([1, 3], 3)).toBe(2);
    expect(nextOpenCaptureSlot([1, 2, 3], 3)).toBeNull();
  });

  it('routes PHOTOS_PENDING before-phase review back to review', () => {
    expect(beforePhaseAdvanceStep('PHOTOS_PENDING')).toBe('review');
    expect(beforePhaseAdvanceStep('ON_SITE')).toBe('timer');
    expect(beforePhaseAdvanceStep('SCHEDULED')).toBe('timer');
    expect(beforePhaseAdvanceStep(undefined)).toBe('timer');
  });

  it('retries only failed uploads with a retained local photo', () => {
    expect(shouldRetryFailedUpload('failed', 'file:///photo.jpg')).toBe(true);
    expect(shouldRetryFailedUpload('failed', null)).toBe(false);
    expect(shouldRetryFailedUpload('done', 'file:///photo.jpg')).toBe(false);
  });
});
