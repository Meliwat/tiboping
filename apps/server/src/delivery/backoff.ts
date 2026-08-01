export const retryDelaysMs = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
] as const;

export const retryDelayForAttempt = (
  attemptCount: number,
  providerRetryAfterMs?: number,
): number | undefined => {
  const localDelay = retryDelaysMs[attemptCount - 1];
  if (localDelay === undefined) return undefined;
  return Math.max(localDelay, providerRetryAfterMs ?? 0);
};
