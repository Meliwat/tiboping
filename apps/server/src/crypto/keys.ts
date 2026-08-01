import { hkdfSync } from 'node:crypto';

export type DerivedKeys = {
  encryptionKey: Buffer;
  sessionKey: Buffer;
};

const salt = Buffer.from('tiboping:v1:root-keys', 'utf8');

const derive = (rootSecret: Uint8Array, purpose: string): Buffer =>
  Buffer.from(hkdfSync('sha256', rootSecret, salt, Buffer.from(purpose, 'utf8'), 32));

export const deriveKeys = (rootSecret: Uint8Array): DerivedKeys => {
  if (rootSecret.byteLength !== 32) {
    throw new Error('TiboPing root secret must be exactly 32 bytes');
  }

  return {
    encryptionKey: derive(rootSecret, 'database-encryption'),
    sessionKey: derive(rootSecret, 'session-signing'),
  };
};
