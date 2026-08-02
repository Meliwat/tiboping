import { describe, expect, it } from 'vitest';

import type { HttpRequest, HttpTransport } from '../../src/destinations/http-client.js';
import { createApiTestContext } from '../helpers/api.js';

describe('destination API', () => {
  it('manages a generic destination with write-only configuration and secret rotation', async () => {
    const requests: HttpRequest[] = [];
    const transport: HttpTransport = {
      send: async (request) => {
        requests.push(request);
        return { status: 204, headers: {}, body: '' };
      },
    };
    const context = await createApiTestContext({
      config: { allowPrivateWebhooks: true },
      transport,
    });
    try {
      const headers = await context.authenticate();
      const created = await context.app.inject({
        method: 'POST',
        url: '/api/destinations',
        headers,
        payload: {
          type: 'generic',
          name: 'Community relay',
          url: 'http://127.0.0.1/tiboping',
          routing: { mode: 'categories', categories: ['codex', 'outages'] },
        },
      });
      const createdBody = created.json<{
        destination: { id: string };
        signingSecret: string;
      }>();
      expect(created.statusCode).toBe(201);
      expect(Buffer.from(createdBody.signingSecret, 'base64')).toHaveLength(32);
      expect(created.body).not.toContain('127.0.0.1');

      const listed = await context.app.inject({
        method: 'GET',
        url: '/api/destinations',
        headers,
      });
      expect(listed.json()).toMatchObject({
        items: [
          {
            id: createdBody.destination.id,
            name: 'Community relay',
            hasConfiguration: true,
          },
        ],
      });
      expect(listed.body).not.toContain(createdBody.signingSecret);
      expect(listed.body).not.toContain('127.0.0.1');

      const tested = await context.app.inject({
        method: 'POST',
        url: `/api/destinations/${createdBody.destination.id}/test`,
        headers,
      });
      expect(tested.json()).toEqual({ outcome: { kind: 'success' } });
      expect(requests).toHaveLength(1);

      const rotated = await context.app.inject({
        method: 'POST',
        url: `/api/destinations/${createdBody.destination.id}/rotate-secret`,
        headers,
      });
      const rotatedBody = rotated.json<{ signingSecret: string }>();
      expect(rotatedBody.signingSecret).not.toBe(createdBody.signingSecret);

      const updated = await context.app.inject({
        method: 'PATCH',
        url: `/api/destinations/${createdBody.destination.id}`,
        headers,
        payload: { name: 'Relay renamed', routing: { mode: 'everything' } },
      });
      expect(updated.json()).toMatchObject({
        destination: { name: 'Relay renamed', routing: { mode: 'everything' } },
      });

      const paused = await context.app.inject({
        method: 'POST',
        url: `/api/destinations/${createdBody.destination.id}/pause`,
        headers,
      });
      expect(paused.json()).toMatchObject({ destination: { state: 'paused' } });
      const resumed = await context.app.inject({
        method: 'POST',
        url: `/api/destinations/${createdBody.destination.id}/resume`,
        headers,
      });
      expect(resumed.json()).toMatchObject({ destination: { state: 'active' } });
      const removed = await context.app.inject({
        method: 'DELETE',
        url: `/api/destinations/${createdBody.destination.id}`,
        headers,
      });
      expect(removed.statusCode).toBe(204);
    } finally {
      await context.cleanup();
    }
  });

  it('validates routing and rejects provider-shaped configuration mismatches', async () => {
    const context = await createApiTestContext({
      config: { allowPrivateWebhooks: true },
    });
    try {
      const headers = await context.authenticate();
      const noCategories = await context.app.inject({
        method: 'POST',
        url: '/api/destinations',
        headers,
        payload: {
          type: 'generic',
          name: 'No topics',
          url: 'http://127.0.0.1/hook',
          routing: { mode: 'categories', categories: [] },
        },
      });
      expect(noCategories.statusCode).toBe(400);

      const invalidSlack = await context.app.inject({
        method: 'POST',
        url: '/api/destinations',
        headers,
        payload: {
          type: 'slack',
          name: 'Wrong host',
          webhookUrl: 'https://example.com/not-slack',
          routing: { mode: 'everything' },
        },
      });
      expect(invalidSlack.statusCode).toBe(422);
      expect(invalidSlack.json()).toMatchObject({
        error: { code: 'invalid-destination-configuration' },
      });
    } finally {
      await context.cleanup();
    }
  });
});
