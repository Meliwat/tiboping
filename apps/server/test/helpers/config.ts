import type { AppConfig } from '../../src/config/load-config.js';

export const createTestConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  nodeEnv: 'test',
  appSecret: Buffer.alloc(32, 8),
  adminPassword: 'a long admin password',
  publicUrl: 'http://localhost:3000',
  port: 3000,
  databasePath: ':memory:',
  logLevel: 'silent',
  demoMode: true,
  allowPrivateWebhooks: false,
  ...overrides,
});
