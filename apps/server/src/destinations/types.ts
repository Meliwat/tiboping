import type { DestinationType, Notification } from '@tiboping/core';

import type { HttpTransport } from './http-client.js';
import type { ResolveAddresses } from './url-policy.js';

export type DeliveryOutcome =
  | { kind: 'success' }
  | { kind: 'retry'; code: string; message: string; retryAfterMs?: number }
  | { kind: 'permanent-failure'; code: string; message: string };

export type DestinationAdapter = {
  type: DestinationType;
  validateConfig: (config: unknown) => Promise<unknown>;
  send: (notification: Notification, config: unknown) => Promise<DeliveryOutcome>;
};

export type AdapterDependencies = {
  transport: HttpTransport;
  resolveAddresses?: ResolveAddresses;
  allowPrivate?: boolean;
  now?: () => number;
};

export const retryAfterMilliseconds = (
  value: string | undefined,
  now: number,
): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
};

export const outcomeForResponse = (
  provider: 'slack' | 'discord' | 'generic',
  status: number,
  headers: Record<string, string>,
  now: number,
): DeliveryOutcome => {
  if (status >= 200 && status < 300) return { kind: 'success' };
  if (status === 429) {
    const retryAfterMs = retryAfterMilliseconds(headers['retry-after'], now);
    return {
      kind: 'retry',
      code: 'provider-rate-limit',
      message: `${provider} rate limited the notification`,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (status === 408 || status >= 500) {
    return {
      kind: 'retry',
      code: status === 408 ? 'provider-timeout' : 'provider-unavailable',
      message: `${provider} returned HTTP ${status}`,
    };
  }
  if (status >= 300 && status < 400) {
    return {
      kind: 'permanent-failure',
      code: 'redirect-rejected',
      message: `${provider} attempted to redirect the webhook request`,
    };
  }
  return {
    kind: 'permanent-failure',
    code: provider === 'generic' ? 'endpoint-rejected' : 'invalid-webhook',
    message: `${provider} returned HTTP ${status}`,
  };
};

export const networkFailure = (): DeliveryOutcome => ({
  kind: 'retry',
  code: 'network-error',
  message: 'The provider could not be reached',
});
