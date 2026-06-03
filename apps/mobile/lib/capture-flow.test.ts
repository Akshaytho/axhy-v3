import { describe, expect, it } from 'vitest';

import {
  MIN_PHOTOS_PER_PHASE,
  MAX_PHOTOS_PER_PHASE,
  beforePhaseAdvanceStep,
  nextOpenCaptureSlot,
  shouldRetryFailedUpload,
} from './capture-flow';

describe('capture-flow helpers', () => {
  it('exposes the contract photo bounds (min 3, max 8)', () => {
    expect(MIN_PHOTOS_PER_PHASE).toBe(3);
    expect(MAX_PHOTOS_PER_PHASE).toBe(8);
  });

  it('finds the first missing capture slot', () => {
    expect(nextOpenCaptureSlot([], 3)).toBe(1);
    expect(nextOpenCaptureSlot([2, 3], 3)).toBe(1);
    expect(nextOpenCaptureSlot([1, 3], 3)).toBe(2);
    expect(nextOpenCaptureSlot([1, 2, 3], 3)).toBeNull();
  });

  it('finds the next open slot up to the new ceiling of 8', () => {
    expect(nextOpenCaptureSlot([1, 2, 3], MAX_PHOTOS_PER_PHASE)).toBe(4);
    expect(nextOpenCaptureSlot([1, 2, 3, 4, 5, 6, 7], MAX_PHOTOS_PER_PHASE)).toBe(8);
    expect(nextOpenCaptureSlot([1, 2, 3, 4, 5, 6, 7, 8], MAX_PHOTOS_PER_PHASE)).toBeNull();
  });

  it('routes Before-Photos Done to the Before-Review checkpoint (PHOTOS_PENDING → final review)', () => {
    expect(beforePhaseAdvanceStep('PHOTOS_PENDING')).toBe('review');
    expect(beforePhaseAdvanceStep('ON_SITE')).toBe('before-photos-review');
    expect(beforePhaseAdvanceStep('SCHEDULED')).toBe('before-photos-review');
    expect(beforePhaseAdvanceStep(undefined)).toBe('before-photos-review');
  });

  it('retries only failed uploads with a retained local photo', () => {
    expect(shouldRetryFailedUpload('failed', 'file:///photo.jpg')).toBe(true);
    expect(shouldRetryFailedUpload('failed', null)).toBe(false);
    expect(shouldRetryFailedUpload('done', 'file:///photo.jpg')).toBe(false);
  });
});
