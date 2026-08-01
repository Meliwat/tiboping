import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const sessionSchema = z.object({
  version: z.literal(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  csrfToken: z.string().min(32),
  sessionId: z.string().min(16),
});

export type AdminSession = z.infer<typeof sessionSchema>;

export type SessionManager = {
  create: () => { token: string; session: AdminSession };
  verify: (token: string) => AdminSession | undefined;
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export const createSessionManager = (options: {
  key: Uint8Array;
  now?: () => number;
  createRandomBytes?: (size: number) => Buffer;
  ttlMs?: number;
}): SessionManager => {
  const now = options.now ?? Date.now;
  const createRandomBytes = options.createRandomBytes ?? randomBytes;
  const ttlMs = options.ttlMs ?? 8 * 60 * 60 * 1000;

  const signature = (payload: string): Buffer =>
    createHmac('sha256', options.key)
      .update('tiboping:v1:session\0', 'utf8')
      .update(payload, 'utf8')
      .digest();

  return {
    create: () => {
      const issuedAt = now();
      const session = sessionSchema.parse({
        version: 1,
        issuedAt,
        expiresAt: issuedAt + ttlMs,
        csrfToken: createRandomBytes(24).toString('base64url'),
        sessionId: createRandomBytes(16).toString('base64url'),
      });
      const payload = encode(session);
      return {
        token: `${payload}.${signature(payload).toString('base64url')}`,
        session,
      };
    },
    verify: (token) => {
      const [payload, encodedSignature, ...extra] = token.split('.');
      if (!payload || !encodedSignature || extra.length > 0) return undefined;

      const expected = signature(payload);
      const received = Buffer.from(encodedSignature, 'base64url');
      if (
        received.byteLength !== expected.byteLength ||
        !timingSafeEqual(received, expected)
      ) {
        return undefined;
      }

      try {
        const session = sessionSchema.parse(
          JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown,
        );
        return session.expiresAt > now() ? session : undefined;
      } catch {
        return undefined;
      }
    },
  };
};
