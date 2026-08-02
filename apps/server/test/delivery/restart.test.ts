import { describe, expect, it } from 'vitest';

import { deriveKeys } from '../../src/crypto/keys.js';
import { DeliveryRepository } from '../../src/db/repositories/deliveries.js';
import { DestinationRepository } from '../../src/db/repositories/destinations.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { DestinationAdapterRegistry } from '../../src/destinations/registry.js';
import type { DestinationAdapter } from '../../src/destinations/types.js';
import { DeliveryWorker } from '../../src/delivery/worker.js';
import { firstPost } from '../fixtures/posts.js';
import { createTestDatabase } from '../helpers/database.js';

describe('delivery restart behavior', () => {
  it('reclaims an expired lease and documents the ambiguous remote duplicate edge', async () => {
    const testDatabase = createTestDatabase();
    const posts = new PostRepository(testDatabase.database);
    const destinations = new DestinationRepository(
      testDatabase.database,
      deriveKeys(Buffer.alloc(32, 14)).encryptionKey,
      { createId: () => 'destination-1' },
    );
    const deliveries = new DeliveryRepository(testDatabase.database, {
      createId: () => 'delivery-1',
    });
    let sends = 0;
    const adapter: DestinationAdapter = {
      type: 'generic',
      validateConfig: async (config) => config,
      send: async () => {
        sends += 1;
        return { kind: 'success' };
      },
    };

    try {
      posts.insert(firstPost, { version: 1, categories: [], matchedRuleIds: [] });
      destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {},
        routing: { mode: 'everything' },
      });
      deliveries.create(firstPost.id, 'destination-1', '2026-08-01T12:00:00.000Z');
      const abandoned = deliveries.claimDue({
        workerId: 'crashed-worker',
        now: '2026-08-01T12:00:00.000Z',
        leaseUntil: '2026-08-01T12:01:00.000Z',
      })!;

      // Simulate a remote acceptance followed by a local crash before acknowledgement.
      await adapter.send(
        {
          eventId: `x:${firstPost.id}`,
          post: {
            id: firstPost.id,
            authorName: 'Tibo',
            authorUsername: 'thsottiaux',
            text: firstPost.text,
            url: firstPost.url,
            createdAt: firstPost.createdAt,
            kind: firstPost.kind,
          },
          categories: [],
          observedAt: firstPost.observedAt,
        },
        {},
      );
      expect(abandoned.state).toBe('sending');

      const worker = new DeliveryWorker({
        deliveries,
        destinations,
        posts,
        registry: new DestinationAdapterRegistry([adapter]),
        now: () => Date.parse('2026-08-01T12:01:01.000Z'),
        workerId: 'replacement-worker',
      });
      await worker.runBatch(1);

      expect(deliveries.get('delivery-1')).toMatchObject({
        state: 'delivered',
        attemptCount: 2,
      });
      expect(sends).toBe(2);
    } finally {
      testDatabase.cleanup();
    }
  });
});
