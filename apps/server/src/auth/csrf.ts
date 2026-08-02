import { timingSafeEqual } from 'node:crypto';

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const isExpectedOrigin = (
  origin: string | undefined,
  publicUrl: string,
): boolean => {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(publicUrl).origin;
  } catch {
    return false;
  }
};

export const isValidCsrfToken = (
  candidate: string | string[] | undefined,
  expected: string,
): boolean => typeof candidate === 'string' && safeEqual(candidate, expected);
