import { describe, expect, it } from 'vitest';

import { createApiTestContext } from '../helpers/api.js';

describe('status API', () => {
  it('summarizes source, queue, destinations, and last post without secrets', async () => {
    const context = await createApiTestContext();
    try {
      const headers = await context.authenticate();
      const unauthorized = await context.app.inject({
        method: 'GET',
        url: '/api/status',
      });
      expect(unauthorized.statusCode).toBe(401);
      context.services.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: { hidden: 'webhook-secret' },
        routing: { mode: 'everything' },
      });
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/status',
        headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        source: { mode: 'demo', state: 'demo' },
        database: { status: 'ready' },
        queue: { pending: 0, sending: 0, delivered: 0, failed: 0, cancelled: 0 },
        destinations: { active: 1, paused: 0 },
      });
      expect(response.body).not.toContain('webhook-secret');
    } finally {
      await context.cleanup();
    }
  });
});
