import { createHmac, timingSafeEqual } from 'node:crypto';

const prefix = 'v1=';

export const signWebhook = (
  secret: Uint8Array,
  timestamp: string,
  body: Uint8Array,
): string => {
  const digest = createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body)
    .digest('hex');

  return `${prefix}${digest}`;
};

export const verifyWebhookSignature = (
  secret: Uint8Array,
  timestamp: string,
  body: Uint8Array,
  signature: string,
): boolean => {
  const expected = Buffer.from(signWebhook(secret, timestamp, body), 'utf8');
  const received = Buffer.from(signature, 'utf8');

  return (
    received.byteLength === expected.byteLength && timingSafeEqual(received, expected)
  );
};
