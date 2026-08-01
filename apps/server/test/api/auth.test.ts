import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { createTestConfig } from '../helpers/config.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

const openDatabases: TestDatabase[] = [];

const setup = async (options: { now?: () => number; publicUrl?: string } = {}) => {
  const testDatabase = createTestDatabase();
  openDatabases.push(testDatabase);
  const app = await buildApp({
    config: createTestConfig({
      ...(options.publicUrl ? { publicUrl: options.publicUrl } : {}),
    }),
    database: testDatabase.database,
    ...(options.now ? { now: options.now } : {}),
  });
  return app;
};

const login = async (app: Awaited<ReturnType<typeof setup>>) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'a long admin password' },
  });
  const cookie = response.headers['set-cookie']?.split(';')[0];
  return {
    response,
    cookie,
    body: response.json<{
      authenticated: boolean;
      csrfToken: string;
      expiresAt: string;
    }>(),
  };
};

afterEach(async () => {
  for (const testDatabase of openDatabases.splice(0)) {
    testDatabase.cleanup();
  }
});

describe('admin authentication', () => {
  it('logs in, returns the current session, and logs out', async () => {
    const app = await setup();
    const signedIn = await login(app);

    expect(signedIn.response.statusCode).toBe(200);
    expect(signedIn.body).toMatchObject({ authenticated: true });
    expect(signedIn.cookie).toMatch(/^tp_session=/u);

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: signedIn.cookie ?? '' },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      csrfToken: signedIn.body.csrfToken,
    });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: signedIn.cookie ?? '',
        origin: 'http://localhost:3000',
        'x-csrf-token': signedIn.body.csrfToken,
      },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers['set-cookie']).toContain('tp_session=;');

    await app.close();
  });

  it('rejects a wrong password and rate limits repeated failures by address', async () => {
    const app = await setup();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'wrong password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong password' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'rate-limit-exceeded' } });

    await app.close();
  });

  it('rejects missing, mismatched-origin, and invalid-CSRF state changes', async () => {
    const app = await setup();
    const signedIn = await login(app);

    const cases = [
      {
        cookie: '',
        origin: 'http://localhost:3000',
        token: signedIn.body.csrfToken,
        code: 401,
      },
      {
        cookie: signedIn.cookie ?? '',
        origin: 'https://evil.example',
        token: signedIn.body.csrfToken,
        code: 403,
      },
      {
        cookie: signedIn.cookie ?? '',
        origin: 'http://localhost:3000',
        token: 'wrong',
        code: 403,
      },
    ];

    for (const testCase of cases) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          cookie: testCase.cookie,
          origin: testCase.origin,
          'x-csrf-token': testCase.token,
        },
      });
      expect(response.statusCode).toBe(testCase.code);
    }

    await app.close();
  });

  it('expires sessions using the injected clock', async () => {
    let now = Date.parse('2026-08-01T12:00:00.000Z');
    const app = await setup({ now: () => now });
    const signedIn = await login(app);
    now += 8 * 60 * 60 * 1000 + 1;

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: signedIn.cookie ?? '' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'authentication-required' } });

    await app.close();
  });

  it('sets secure, HTTP-only, same-site cookies behind HTTPS', async () => {
    const app = await setup({ publicUrl: 'https://tiboping.example' });
    const signedIn = await login(app);
    const setCookie = signedIn.response.headers['set-cookie'];

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');

    await app.close();
  });

  it('rejects tampered session cookies', async () => {
    const app = await setup();
    const signedIn = await login(app);
    const cookie = signedIn.cookie ?? '';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `${cookie}tampered` },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
