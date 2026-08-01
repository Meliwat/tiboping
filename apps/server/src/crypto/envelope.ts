import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

const envelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal('A256GCM'),
  nonce: z.string().min(1),
  ciphertext: z.string(),
  tag: z.string().min(1),
});

const associatedData = (context: string): Buffer =>
  Buffer.from(`tiboping:v1:${context}`, 'utf8');

export const encryptSecret = (
  plaintext: string,
  context: string,
  key: Uint8Array,
  createRandomBytes: (size: number) => Buffer = randomBytes,
): string => {
  if (key.byteLength !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte key');
  }

  const nonce = createRandomBytes(12);
  if (nonce.byteLength !== 12) {
    throw new Error('AES-GCM nonce source must return exactly 12 bytes');
  }

  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return JSON.stringify({
    version: 1,
    algorithm: 'A256GCM',
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  });
};

export const decryptSecret = (
  serialized: string,
  context: string,
  key: Uint8Array,
): string => {
  if (key.byteLength !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte key');
  }

  const envelope = envelopeSchema.parse(JSON.parse(serialized) as unknown);
  const nonce = Buffer.from(envelope.nonce, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');

  if (nonce.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error('Encrypted secret envelope has invalid authentication metadata');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
