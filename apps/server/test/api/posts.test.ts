import { classifyPost } from '@tiboping/core';
import { describe, expect, it } from 'vitest';

import { getDemoFixture } from '../../src/source/demo-source.js';
import { normalizeXPost } from '../../src/source/normalize-post.js';
import { createApiTestContext } from '../helpers/api.js';

describe('posts API', () => {
  it('paginates recent posts with categories and rule explanations', async () => {
    const context = await createApiTestContext();
    try {
      const headers = await context.authenticate();
      for (const name of ['codex', 'outage', 'usage-limit'] as const) {
        const raw = getDemoFixture(name);
        const post = normalizeXPost(raw, {
          targetUserId: raw.author_id,
          observedAt: raw.created_at,
        });
        if (!post) throw new Error('Expected a normalized demo post');
        context.services.posts.insert(post, classifyPost(post.text));
      }

      const first = await context.app.inject({
        method: 'GET',
        url: '/api/posts?limit=2',
        headers,
      });
      const firstBody = first.json<{
        items: Array<{ id: string; categories: string[]; matchedRuleIds: string[] }>;
        nextCursor: string;
      }>();
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.items[0]).toMatchObject({
        id: '1990000000000000003',
        categories: ['usage-limits'],
      });
      expect(firstBody.items[0]?.matchedRuleIds.length).toBeGreaterThan(0);

      const second = await context.app.inject({
        method: 'GET',
        url: `/api/posts?limit=2&before=${firstBody.nextCursor}`,
        headers,
      });
      expect(second.json()).toMatchObject({
        items: [{ id: '1990000000000000001', categories: ['codex'] }],
      });
    } finally {
      await context.cleanup();
    }
  });
});
