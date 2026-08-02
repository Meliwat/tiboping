import { randomBytes } from 'node:crypto';

import { environmentSchema } from './schema.js';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  appSecret: Buffer;
  adminPassword: string;
  xBearerToken?: string;
  publicUrl: string;
  port: number;
  databasePath: string;
  logLevel: LogLevel;
  demoMode: boolean;
  allowPrivateWebhooks: boolean;
};

const decodeRootSecret = (encoded: string): Buffer => {
  const decoded = Buffer.from(encoded, 'base64');
  const canonicalInput = encoded.replace(/=+$/u, '');
  const canonicalDecoded = decoded.toString('base64').replace(/=+$/u, '');

  if (decoded.length !== 32 || canonicalInput !== canonicalDecoded) {
    throw new Error('APP_SECRET must be the base64 encoding of exactly 32 random bytes');
  }

  return decoded;
};

export const loadConfig = (
  environment: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  createRandomBytes: (size: number) => Buffer = randomBytes,
): AppConfig => {
  const parsed = environmentSchema.parse(environment);
  const appSecret = parsed.APP_SECRET
    ? decodeRootSecret(parsed.APP_SECRET)
    : createRandomBytes(32);

  return {
    nodeEnv: parsed.NODE_ENV,
    appSecret,
    adminPassword:
      parsed.ADMIN_PASSWORD ??
      (parsed.NODE_ENV === 'test' ? 'tiboping-test' : 'tiboping-demo'),
    ...(parsed.X_BEARER_TOKEN ? { xBearerToken: parsed.X_BEARER_TOKEN } : {}),
    publicUrl: parsed.PUBLIC_URL.replace(/\/$/u, ''),
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    logLevel: parsed.LOG_LEVEL,
    demoMode: parsed.DEMO_MODE,
    allowPrivateWebhooks: parsed.ALLOW_PRIVATE_WEBHOOKS,
  };
};
