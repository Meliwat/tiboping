import { describe, expect, it } from 'vitest';

import { createApiTestContext } from '../helpers/api.js';

describe('demo API', () => {
  it('lists and emits fixtures through the live demo source', async () => {
    const context = await createApiTestContext();
    try {
      await context.services.source.start();
      const headers = await context.authenticate();
      const fixtures = await context.app.inject({
        method: 'GET',
        url: '/api/demo/fixtures',
        headers,
      });
      expect(fixtures.json()).toMatchObject({
        items: [
          { name: 'codex', categories: ['codex'] },
          { name: 'outage', categories: ['outages'] },
          { name: 'usage-limit', categories: ['usage-limits'] },
          {
            name: 'multi-category',
            categories: ['codex', 'outages', 'usage-limits'],
          },
          { name: 'unmatched', categories: [] },
        ],
      });

      const emitted = await context.app.inject({
        method: 'POST',
        url: '/api/demo/emit',
        headers,
        payload: { fixture: 'multi-category' },
      });
      expect(emitted.statusCode).toBe(202);
      await expect
        .poll(() => context.services.posts.get('1990000000000000004'))
        .toMatchObject({ categories: ['codex', 'outages', 'usage-limits'] });
    } finally {
      await context.cleanup();
    }
  });

  it('hides demo routes outside demo mode', async () => {
    const context = await createApiTestContext({ config: { demoMode: false } });
    try {
      const headers = await context.authenticate();
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/demo/fixtures',
        headers,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'not-found' } });
    } finally {
      await context.cleanup();
    }
  });
});
