import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '../src/crypto/envelope.js';
import { deriveKeys } from '../src/crypto/keys.js';
import { signWebhook, verifyWebhookSignature } from '../src/crypto/signature.js';

const rootSecret = Buffer.from(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  'hex',
);

describe('deriveKeys', () => {
  it('derives stable and domain-separated keys', () => {
    const first = deriveKeys(rootSecret);
    const second = deriveKeys(rootSecret);

    expect(first.encryptionKey).toEqual(second.encryptionKey);
    expect(first.sessionKey).toEqual(second.sessionKey);
    expect(first.encryptionKey).not.toEqual(first.sessionKey);
    expect(first.encryptionKey).toHaveLength(32);
    expect(first.sessionKey).toHaveLength(32);
  });
});

describe('secret envelopes', () => {
  const { encryptionKey } = deriveKeys(rootSecret);

  it('round trips an authenticated value', () => {
    const encrypted = encryptSecret(
      'https://hooks.slack.com/services/top-secret',
      'destinations.config',
      encryptionKey,
      () => Buffer.alloc(12, 3),
    );

    expect(encrypted).not.toContain('top-secret');
    expect(decryptSecret(encrypted, 'destinations.config', encryptionKey)).toBe(
      'https://hooks.slack.com/services/top-secret',
    );
  });

  it('uses a fresh nonce for every value', () => {
    const first = encryptSecret('same', 'field', encryptionKey);
    const second = encryptSecret('same', 'field', encryptionKey);

    expect(first).not.toBe(second);
  });

  it('rejects a wrong context, wrong key, or tampering', () => {
    const encrypted = encryptSecret('secret', 'field', encryptionKey);
    const otherKey = deriveKeys(Buffer.alloc(32, 2)).encryptionKey;
    const parsed = JSON.parse(encrypted) as Record<string, unknown>;
    const ciphertext = Buffer.from(String(parsed['ciphertext']), 'base64url');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    parsed['ciphertext'] = ciphertext.toString('base64url');

    expect(() => decryptSecret(encrypted, 'other-field', encryptionKey)).toThrow();
    expect(() => decryptSecret(encrypted, 'field', otherKey)).toThrow();
    expect(() => decryptSecret(JSON.stringify(parsed), 'field', encryptionKey)).toThrow();
  });
});

describe('webhook signatures', () => {
  it('matches a stable HMAC test vector and verifies it', () => {
    const secret = Buffer.from('generic-webhook-secret');
    const body = Buffer.from('{"event_id":"x:123"}');
    const signature = signWebhook(secret, '1785585602', body);

    expect(signature).toBe(
      'v1=65b718ccb9cfb1364d17d51d6128f7e5d6a0c218701fc1801777d0e9ee6ac197',
    );
    expect(verifyWebhookSignature(secret, '1785585602', body, signature)).toBe(true);
    expect(verifyWebhookSignature(secret, '1785585603', body, signature)).toBe(false);
  });

  it('matches the public 32-byte base64 test vector', () => {
    const secret = Buffer.from('CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws=', 'base64');
    const body = Buffer.from('{"event_id":"x:123"}');

    expect(signWebhook(secret, '1785585602', body)).toBe(
      'v1=64f92f2c0f28768e248496a6d1a7034ae88263963d47b0138683d1faadc9c22f',
    );
  });
});
