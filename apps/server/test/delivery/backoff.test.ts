import { describe, expect, it } from 'vitest';

import { retryDelaysMs, retryDelayForAttempt } from '../../src/delivery/backoff.js';

describe('delivery backoff', () => {
  it('uses the approved retry schedule', () => {
    expect(retryDelaysMs).toEqual([
      30_000,
      2 * 60_000,
      10 * 60_000,
      30 * 60_000,
      2 * 60 * 60_000,
      6 * 60 * 60_000,
    ]);
    expect(retryDelaysMs.map((_, index) => retryDelayForAttempt(index + 1))).toEqual(
      retryDelaysMs,
    );
    expect(retryDelayForAttempt(7)).toBeUndefined();
  });

  it('honors a longer provider Retry-After but never shortens local backoff', () => {
    expect(retryDelayForAttempt(1, 5 * 60_000)).toBe(5 * 60_000);
    expect(retryDelayForAttempt(2, 10_000)).toBe(2 * 60_000);
  });
});
