import type { Category, Routing } from '@tiboping/core';
import { describe, expect, it } from 'vitest';

import { deriveKeys } from '../../src/crypto/keys.js';
import { DeliveryRepository } from '../../src/db/repositories/deliveries.js';
import { DestinationRepository } from '../../src/db/repositories/destinations.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { NotificationRouter } from '../../src/delivery/router.js';
import { firstPost } from '../fixtures/posts.js';
import { createTestDatabase } from '../helpers/database.js';

const categoryCombinations: Category[][] = [
  ['codex'],
  ['outages'],
  ['usage-limits'],
  ['codex', 'outages'],
  ['codex', 'usage-limits'],
  ['outages', 'usage-limits'],
  ['codex', 'outages', 'usage-limits'],
];

describe('NotificationRouter', () => {
  it('routes Everything and every non-empty category combination by intersection', () => {
    const testDatabase = createTestDatabase();
    const key = deriveKeys(Buffer.alloc(32, 12)).encryptionKey;
    const ids = [
      'everything',
      ...categoryCombinations.map((_, index) => `categories-${index}`),
    ];
    const destinations = new DestinationRepository(testDatabase.database, key, {
      createId: () => ids.shift() ?? 'unexpected',
      now: () => '2026-08-01T12:00:00.000Z',
    });
    const posts = new PostRepository(testDatabase.database);
    const deliveries = new DeliveryRepository(testDatabase.database);
    const router = new NotificationRouter(
      testDatabase.database,
      destinations,
      deliveries,
      {
        now: () => '2026-08-01T12:00:03.000Z',
      },
    );

    try {
      const routings: Routing[] = [
        { mode: 'everything' },
        ...categoryCombinations.map((categories) => ({
          mode: 'categories' as const,
          categories,
        })),
      ];
      for (const [index, routing] of routings.entries()) {
        destinations.create({
          type: 'generic',
          name: `Destination ${index}`,
          config: { url: 'https://receiver.example' },
          routing,
        });
      }
      posts.insert(firstPost, {
        version: 1,
        categories: ['outages'],
        matchedRuleIds: ['outages.direct'],
      });

      const result = router.route(posts.get(firstPost.id)!);
      const rows = testDatabase.database
        .prepare('SELECT destination_id FROM deliveries ORDER BY destination_id')
        .all() as Array<{ destination_id: string }>;
      const expectedCategoryIds = categoryCombinations
        .map((categories, index) => ({ categories, id: `categories-${index}` }))
        .filter(({ categories }) => categories.includes('outages'))
        .map(({ id }) => id);

      expect(result.created).toBe(1 + expectedCategoryIds.length);
      expect(rows.map(({ destination_id }) => destination_id)).toEqual(
        ['everything', ...expectedCategoryIds].sort(),
      );
    } finally {
      testDatabase.cleanup();
    }
  });

  it('routes unmatched posts only to Everything and remains idempotent', () => {
    const testDatabase = createTestDatabase();
    const key = deriveKeys(Buffer.alloc(32, 12)).encryptionKey;
    const ids = ['everything', 'categories'];
    const destinations = new DestinationRepository(testDatabase.database, key, {
      createId: () => ids.shift() ?? 'unexpected',
      now: () => '2026-08-01T12:00:00.000Z',
    });
    const posts = new PostRepository(testDatabase.database);
    const deliveries = new DeliveryRepository(testDatabase.database);
    const router = new NotificationRouter(
      testDatabase.database,
      destinations,
      deliveries,
      {
        now: () => '2026-08-01T12:00:03.000Z',
      },
    );

    try {
      destinations.create({
        type: 'generic',
        name: 'Everything',
        config: {},
        routing: { mode: 'everything' },
      });
      destinations.create({
        type: 'generic',
        name: 'Codex',
        config: {},
        routing: { mode: 'categories', categories: ['codex'] },
      });
      posts.insert(firstPost, { version: 1, categories: [], matchedRuleIds: [] });

      expect(router.route(posts.get(firstPost.id)!)).toEqual({ created: 1, existing: 0 });
      expect(router.route(posts.get(firstPost.id)!)).toEqual({ created: 0, existing: 1 });
    } finally {
      testDatabase.cleanup();
    }
  });

  it('skips paused and soft-deleted destinations', () => {
    const testDatabase = createTestDatabase();
    const key = deriveKeys(Buffer.alloc(32, 12)).encryptionKey;
    const ids = ['paused', 'deleted'];
    const destinations = new DestinationRepository(testDatabase.database, key, {
      createId: () => ids.shift() ?? 'unexpected',
    });
    const posts = new PostRepository(testDatabase.database);
    const deliveries = new DeliveryRepository(testDatabase.database);
    const router = new NotificationRouter(
      testDatabase.database,
      destinations,
      deliveries,
    );

    try {
      destinations.create({
        type: 'slack',
        name: 'Paused',
        config: {},
        routing: { mode: 'everything' },
      });
      destinations.create({
        type: 'slack',
        name: 'Deleted',
        config: {},
        routing: { mode: 'everything' },
      });
      destinations.pause('paused', 'manual');
      destinations.softDelete('deleted');
      posts.insert(firstPost, { version: 1, categories: ['codex'], matchedRuleIds: [] });

      expect(router.route(posts.get(firstPost.id)!)).toEqual({ created: 0, existing: 0 });
    } finally {
      testDatabase.cleanup();
    }
  });
});
