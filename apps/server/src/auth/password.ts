import { createHmac, timingSafeEqual } from 'node:crypto';

const verifier = (password: string, key: Uint8Array): Buffer =>
  createHmac('sha256', key)
    .update('tiboping:v1:admin-password\0', 'utf8')
    .update(password, 'utf8')
    .digest();

export const verifyAdminPassword = (
  candidate: string,
  configuredPassword: string,
  key: Uint8Array,
): boolean =>
  timingSafeEqual(verifier(candidate, key), verifier(configuredPassword, key));
