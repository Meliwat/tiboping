import { describe, expect, it } from 'vitest';

import type { XApi } from '../../src/source/types.js';
import { createApiTestContext } from '../helpers/api.js';

const fakeXApi = (): XApi => ({
  resolveUser: async () => ({
    id: '127000000000000001',
    name: 'Tibo',
    username: 'thsottiaux',
    protected: false,
  }),
  listStreamRules: async () => [],
  addStreamRule: async (rule) => ({ id: 'rule-1', ...rule }),
  deleteStreamRules: async () => undefined,
  fetchUserPosts: async () => ({ posts: [] }),
  openFilteredStream: async () => new ReadableStream<Uint8Array>(),
});

describe('setup API', () => {
  it('reports setup progress and requires a tested destination', async () => {
    const context = await createApiTestContext({
      config: { allowPrivateWebhooks: true },
    });
    try {
      const headers = await context.authenticate();
      const initial = await context.app.inject({
        method: 'GET',
        url: '/api/setup',
        headers,
      });
      expect(initial.json()).toMatchObject({
        complete: false,
        source: { mode: 'demo', configured: true },
        readyToActivate: false,
      });

      const destination = context.services.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {
          url: 'http://127.0.0.1/hook',
          signingSecret: Buffer.alloc(32, 1).toString('base64'),
        },
        routing: { mode: 'everything' },
      });
      const blocked = await context.app.inject({
        method: 'POST',
        url: '/api/setup/activate',
        headers,
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({ error: { code: 'setup-incomplete' } });

      context.services.settings.set(`destination.tested:${destination.id}`, 'true');
      const activated = await context.app.inject({
        method: 'POST',
        url: '/api/setup/activate',
        headers,
      });
      expect(activated.statusCode).toBe(200);
      expect(activated.json()).toMatchObject({ complete: true, readyToActivate: true });
    } finally {
      await context.cleanup();
    }
  });

  it('verifies an environment-owned X token without storing or exposing it', async () => {
    const secret = 'environment-x-token';
    const context = await createApiTestContext({
      config: { demoMode: false, xBearerToken: secret },
      xApi: fakeXApi(),
    });
    try {
      const headers = await context.authenticate();
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/setup/x/verify',
        headers,
        payload: {},
      });
      const serialized = response.body;

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        profile: { username: 'thsottiaux' },
        source: {
          credentialSource: 'environment',
          credentialEditable: false,
          state: 'verified',
        },
      });
      expect(serialized).not.toContain(secret);
      expect(context.services.settings.getSecret('x.bearer-token')).toBeUndefined();

      const replacement = await context.app.inject({
        method: 'POST',
        url: '/api/setup/x/verify',
        headers,
        payload: { token: 'replacement' },
      });
      expect(replacement.statusCode).toBe(409);
      expect(replacement.json()).toMatchObject({
        error: { code: 'credential-owned-by-environment' },
      });
    } finally {
      await context.cleanup();
    }
  });

  it('encrypts a dashboard-provided X token and activates it after verification', async () => {
    const secret = 'dashboard-x-token';
    const context = await createApiTestContext({
      config: { demoMode: false },
      xApi: fakeXApi(),
    });
    try {
      const headers = await context.authenticate();
      const verified = await context.app.inject({
        method: 'POST',
        url: '/api/setup/x/verify',
        headers,
        payload: { token: secret },
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.body).not.toContain(secret);

      const row = context.testDatabase.database
        .prepare("SELECT value, encrypted FROM settings WHERE key = 'x.bearer-token'")
        .get() as { value: string; encrypted: number };
      expect(row.encrypted).toBe(1);
      expect(row.value).not.toContain(secret);

      const destination = context.services.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {
          url: 'https://receiver.example/hook',
          signingSecret: Buffer.alloc(32, 2).toString('base64'),
        },
        routing: { mode: 'everything' },
      });
      context.services.settings.set(`destination.tested:${destination.id}`, 'true');
      const activated = await context.app.inject({
        method: 'POST',
        url: '/api/setup/activate',
        headers,
      });
      expect(activated.statusCode).toBe(200);
      expect(activated.json()).toMatchObject({
        complete: true,
        source: { active: true, credentialSource: 'database' },
      });
    } finally {
      await context.cleanup();
    }
  });
});
