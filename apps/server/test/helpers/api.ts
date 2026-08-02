import type { XApi } from '../../src/source/types.js';
import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/load-config.js';
import type { HttpTransport } from '../../src/destinations/http-client.js';
import {
  createRuntimeServices,
  type RuntimeServices,
} from '../../src/services/runtime.js';
import { createTestConfig } from './config.js';
import { createTestDatabase, type TestDatabase } from './database.js';

const successfulTransport: HttpTransport = {
  send: async () => ({ status: 204, headers: {}, body: '' }),
};

export type ApiTestContext = {
  app: Awaited<ReturnType<typeof buildApp>>;
  config: AppConfig;
  services: RuntimeServices;
  testDatabase: TestDatabase;
  authenticate: () => Promise<Record<string, string>>;
  cleanup: () => Promise<void>;
};

export const createApiTestContext = async (
  options: {
    config?: Partial<AppConfig>;
    transport?: HttpTransport;
    xApi?: XApi;
  } = {},
): Promise<ApiTestContext> => {
  const testDatabase = createTestDatabase();
  const config = createTestConfig(options.config);
  const services = createRuntimeServices({
    config,
    database: testDatabase.database,
    transport: options.transport ?? successfulTransport,
    ...(options.xApi ? { xApi: options.xApi } : {}),
  });
  const app = await buildApp({ config, database: testDatabase.database, services });

  return {
    app,
    config,
    services,
    testDatabase,
    authenticate: async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: config.adminPassword },
      });
      const body = response.json<{ csrfToken: string }>();
      return {
        cookie: response.headers['set-cookie']?.split(';')[0] ?? '',
        origin: new URL(config.publicUrl).origin,
        'x-csrf-token': body.csrfToken,
      };
    },
    cleanup: async () => {
      await services.source.stop();
      await app.close();
      testDatabase.cleanup();
    },
  };
};
