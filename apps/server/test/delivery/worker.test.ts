import type {
  DeliveryOutcome,
  DestinationAdapter,
} from '../../src/destinations/types.js';
import { describe, expect, it } from 'vitest';

import { deriveKeys } from '../../src/crypto/keys.js';
import { DeliveryRepository } from '../../src/db/repositories/deliveries.js';
import { DestinationRepository } from '../../src/db/repositories/destinations.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { DestinationAdapterRegistry } from '../../src/destinations/registry.js';
import { DeliveryWorker } from '../../src/delivery/worker.js';
import { firstPost } from '../fixtures/posts.js';
import { createTestDatabase } from '../helpers/database.js';

const key = deriveKeys(Buffer.alloc(32, 13)).encryptionKey;

const setup = (
  outcomeForConfig: (config: unknown) => DeliveryOutcome | Promise<DeliveryOutcome>,
) => {
  const testDatabase = createTestDatabase();
  const posts = new PostRepository(testDatabase.database);
  const ids = ['destination-1', 'destination-2'];
  const destinations = new DestinationRepository(testDatabase.database, key, {
    createId: () => ids.shift() ?? 'unexpected',
    now: () => '2026-08-01T12:00:00.000Z',
  });
  let deliveryNumber = 0;
  const deliveries = new DeliveryRepository(testDatabase.database, {
    createId: () => `delivery-${++deliveryNumber}`,
  });
  const sent: unknown[] = [];
  const adapter: DestinationAdapter = {
    type: 'generic',
    validateConfig: async (config) => config,
    send: async (_notification, config) => {
      sent.push(config);
      return outcomeForConfig(config);
    },
  };
  const registry = new DestinationAdapterRegistry([adapter]);
  posts.insert(firstPost, { version: 1, categories: ['codex'], matchedRuleIds: [] });
  return { testDatabase, posts, destinations, deliveries, registry, sent, adapter };
};

describe('DeliveryWorker', () => {
  it('delivers a job and records success', async () => {
    const context = setup(() => ({ kind: 'success' }));
    const now = Date.parse('2026-08-01T12:00:00.000Z');

    try {
      context.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: { behavior: 'success' },
        routing: { mode: 'everything' },
      });
      context.deliveries.create(
        firstPost.id,
        'destination-1',
        new Date(now).toISOString(),
      );
      const worker = new DeliveryWorker({
        deliveries: context.deliveries,
        destinations: context.destinations,
        posts: context.posts,
        registry: context.registry,
        now: () => now,
        workerId: 'worker-a',
      });

      await expect(worker.runBatch(1)).resolves.toBe(1);
      expect(context.deliveries.get('delivery-1')).toMatchObject({
        state: 'delivered',
        attemptCount: 1,
        deliveredAt: new Date(now).toISOString(),
      });
      expect(context.sent).toEqual([{ behavior: 'success' }]);
    } finally {
      context.testDatabase.cleanup();
    }
  });

  it('schedules exact backoff and a longer provider Retry-After', async () => {
    let call = 0;
    const context = setup(() =>
      call++ === 0
        ? { kind: 'retry', code: 'network-error', message: 'offline' }
        : {
            kind: 'retry',
            code: 'provider-rate-limit',
            message: 'slow down',
            retryAfterMs: 5 * 60_000,
          },
    );
    let now = Date.parse('2026-08-01T12:00:00.000Z');

    try {
      context.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {},
        routing: { mode: 'everything' },
      });
      context.deliveries.create(
        firstPost.id,
        'destination-1',
        new Date(now).toISOString(),
      );
      const worker = new DeliveryWorker({
        deliveries: context.deliveries,
        destinations: context.destinations,
        posts: context.posts,
        registry: context.registry,
        now: () => now,
        workerId: 'worker-a',
      });

      await worker.runBatch(1);
      expect(context.deliveries.get('delivery-1')).toMatchObject({
        state: 'pending',
        attemptCount: 1,
        nextAttemptAt: '2026-08-01T12:00:30.000Z',
      });

      now = Date.parse('2026-08-01T12:00:30.000Z');
      await worker.runBatch(1);
      expect(context.deliveries.get('delivery-1')).toMatchObject({
        state: 'pending',
        attemptCount: 2,
        nextAttemptAt: '2026-08-01T12:05:30.000Z',
        lastErrorCode: 'provider-rate-limit',
      });
    } finally {
      context.testDatabase.cleanup();
    }
  });

  it('pauses only the permanently failing destination while another succeeds', async () => {
    const context = setup((config) =>
      (config as { behavior: string }).behavior === 'fail'
        ? { kind: 'permanent-failure', code: 'invalid-webhook', message: 'revoked' }
        : { kind: 'success' },
    );
    const now = Date.parse('2026-08-01T12:00:00.000Z');

    try {
      context.destinations.create({
        type: 'generic',
        name: 'Broken',
        config: { behavior: 'fail' },
        routing: { mode: 'everything' },
      });
      context.destinations.create({
        type: 'generic',
        name: 'Healthy',
        config: { behavior: 'success' },
        routing: { mode: 'everything' },
      });
      context.deliveries.create(
        firstPost.id,
        'destination-1',
        new Date(now).toISOString(),
      );
      context.deliveries.create(
        firstPost.id,
        'destination-2',
        new Date(now).toISOString(),
      );
      const worker = new DeliveryWorker({
        deliveries: context.deliveries,
        destinations: context.destinations,
        posts: context.posts,
        registry: context.registry,
        now: () => now,
        workerId: 'worker-a',
      });

      await expect(worker.runBatch(2)).resolves.toBe(2);
      expect(context.deliveries.get('delivery-1')?.state).toBe('failed');
      expect(context.deliveries.get('delivery-2')?.state).toBe('delivered');
      expect(context.destinations.get('destination-1')).toMatchObject({
        state: 'paused',
      });
      expect(context.destinations.get('destination-2')).toMatchObject({
        state: 'active',
      });
    } finally {
      context.testDatabase.cleanup();
    }
  });

  it('fails and pauses after the final retry is exhausted', async () => {
    const context = setup(() => ({
      kind: 'retry',
      code: 'network-error',
      message: 'offline',
    }));
    let now = Date.parse('2026-08-01T12:00:00.000Z');

    try {
      context.destinations.create({
        type: 'generic',
        name: 'Receiver',
        config: {},
        routing: { mode: 'everything' },
      });
      context.deliveries.create(
        firstPost.id,
        'destination-1',
        new Date(now).toISOString(),
      );
      const worker = new DeliveryWorker({
        deliveries: context.deliveries,
        destinations: context.destinations,
        posts: context.posts,
        registry: context.registry,
        now: () => now,
        workerId: 'worker-a',
      });

      for (let attempt = 1; attempt <= 7; attempt += 1) {
        await worker.runBatch(1);
        const delivery = context.deliveries.get('delivery-1')!;
        if (attempt < 7) now = Date.parse(delivery.nextAttemptAt);
      }

      expect(context.deliveries.get('delivery-1')).toMatchObject({
        state: 'failed',
        attemptCount: 7,
        lastErrorCode: 'retry-exhausted',
      });
      expect(context.destinations.get('destination-1')?.state).toBe('paused');
    } finally {
      context.testDatabase.cleanup();
    }
  });
});
