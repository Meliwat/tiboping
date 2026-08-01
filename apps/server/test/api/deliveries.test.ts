import { classifyPost } from '@tiboping/core';
import { describe, expect, it } from 'vitest';

import { getDemoFixture } from '../../src/source/demo-source.js';
import { normalizeXPost } from '../../src/source/normalize-post.js';
import { createApiTestContext } from '../helpers/api.js';

describe('deliveries API', () => {
  it('lists delivery history and permits only failed deliveries to retry', async () => {
    const context = await createApiTestContext();
    try {
      const headers = await context.authenticate();
      const raw = getDemoFixture('codex');
      const post = normalizeXPost(raw, {
        targetUserId: raw.author_id,
        observedAt: raw.created_at,
      });
      if (!post) throw new Error('Expected a normalized demo post');
      context.services.posts.insert(post, classifyPost(post.text));
      const destination = context.services.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {},
        routing: { mode: 'everything' },
      });
      const created = context.services.deliveries.create(
        post.id,
        destination.id,
        new Date().toISOString(),
      );

      const notFailed = await context.app.inject({
        method: 'POST',
        url: `/api/deliveries/${created.id}/retry`,
        headers,
      });
      expect(notFailed.statusCode).toBe(409);
      expect(notFailed.json()).toMatchObject({
        error: { code: 'delivery-not-retryable' },
      });

      const now = new Date().toISOString();
      context.services.deliveries.claimDue({
        workerId: 'test-worker',
        now,
        leaseUntil: new Date(Date.now() + 30_000).toISOString(),
      });
      context.services.deliveries.markPermanentFailure(created.id, {
        errorCode: 'invalid-webhook',
        errorMessage: 'Replace the destination webhook',
        now,
      });

      const listed = await context.app.inject({
        method: 'GET',
        url: '/api/deliveries?state=failed',
        headers,
      });
      expect(listed.json()).toMatchObject({
        items: [
          {
            id: created.id,
            state: 'failed',
            lastErrorCode: 'invalid-webhook',
            lastErrorMessage: 'Replace the destination webhook',
          },
        ],
      });

      const retried = await context.app.inject({
        method: 'POST',
        url: `/api/deliveries/${created.id}/retry`,
        headers,
      });
      expect(retried.statusCode).toBe(200);
      expect(retried.json()).toMatchObject({
        delivery: { state: 'pending', attemptCount: 0 },
      });
    } finally {
      await context.cleanup();
    }
  });
});
