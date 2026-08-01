import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { createTestConfig } from '../helpers/config.js';
import { createTestDatabase } from '../helpers/database.js';

describe('health routes', () => {
  it('reports liveness and database readiness without authentication', async () => {
    const testDatabase = createTestDatabase();
    const app = await buildApp({
      config: createTestConfig(),
      database: testDatabase.database,
    });

    const health = await app.inject({ method: 'GET', url: '/healthz' });
    const ready = await app.inject({ method: 'GET', url: '/readyz' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
    expect(JSON.stringify(ready.json())).not.toContain('APP_SECRET');

    await app.close();
    testDatabase.cleanup();
  });

  it('returns a stable JSON 404 for unknown API routes', async () => {
    const testDatabase = createTestDatabase();
    const app = await buildApp({
      config: createTestConfig(),
      database: testDatabase.database,
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'a long admin password' },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { cookie: login.headers['set-cookie']?.split(';')[0] ?? '' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'not-found', message: 'API route not found' },
    });

    await app.close();
    testDatabase.cleanup();
  });
});
