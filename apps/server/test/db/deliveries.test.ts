import { describe, expect, it } from 'vitest';

import { deriveKeys } from '../../src/crypto/keys.js';
import { DeliveryRepository } from '../../src/db/repositories/deliveries.js';
import { DestinationRepository } from '../../src/db/repositories/destinations.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { firstPost } from '../fixtures/posts.js';
import { createTestDatabase } from '../helpers/database.js';

const encryptionKey = deriveKeys(Buffer.alloc(32, 5)).encryptionKey;

const seedRelations = (testDatabase: ReturnType<typeof createTestDatabase>) => {
  const posts = new PostRepository(testDatabase.database);
  const destinations = new DestinationRepository(testDatabase.database, encryptionKey, {
    now: () => '2026-08-01T12:00:00.000Z',
    createId: () => 'destination-1',
  });
  posts.insert(firstPost, { version: 1, categories: ['codex'], matchedRuleIds: [] });
  destinations.create({
    type: 'generic',
    name: 'Receiver',
    config: { url: 'https://receiver.example/events' },
    routing: { mode: 'everything' },
  });
  return destinations;
};

describe('delivery repository', () => {
  it('creates one job for each post and destination', () => {
    const testDatabase = createTestDatabase();
    seedRelations(testDatabase);
    const deliveries = new DeliveryRepository(testDatabase.database, {
      createId: () => 'delivery-1',
    });

    try {
      expect(
        deliveries.create(firstPost.id, 'destination-1', '2026-08-01T12:00:00.000Z'),
      ).toEqual({ created: true, id: 'delivery-1' });
      expect(
        deliveries.create(firstPost.id, 'destination-1', '2026-08-01T12:00:01.000Z'),
      ).toEqual({ created: false, id: 'delivery-1' });
    } finally {
      testDatabase.cleanup();
    }
  });

  it('claims due work with a lease and reclaims it after expiry', () => {
    const testDatabase = createTestDatabase();
    seedRelations(testDatabase);
    const deliveries = new DeliveryRepository(testDatabase.database, {
      createId: () => 'delivery-1',
    });

    try {
      deliveries.create(firstPost.id, 'destination-1', '2026-08-01T12:00:00.000Z');
      const firstClaim = deliveries.claimDue({
        workerId: 'worker-a',
        now: '2026-08-01T12:00:00.000Z',
        leaseUntil: '2026-08-01T12:01:00.000Z',
      });
      expect(firstClaim).toMatchObject({
        id: 'delivery-1',
        state: 'sending',
        attemptCount: 1,
        leaseOwner: 'worker-a',
      });
      expect(
        deliveries.claimDue({
          workerId: 'worker-b',
          now: '2026-08-01T12:00:30.000Z',
          leaseUntil: '2026-08-01T12:02:00.000Z',
        }),
      ).toBeUndefined();

      const reclaimed = deliveries.claimDue({
        workerId: 'worker-b',
        now: '2026-08-01T12:01:01.000Z',
        leaseUntil: '2026-08-01T12:02:01.000Z',
      });
      expect(reclaimed).toMatchObject({ attemptCount: 2, leaseOwner: 'worker-b' });
    } finally {
      testDatabase.cleanup();
    }
  });

  it('records retries, completion, permanent failure, and manual recovery', () => {
    const testDatabase = createTestDatabase();
    const destinations = seedRelations(testDatabase);
    const deliveries = new DeliveryRepository(testDatabase.database, {
      createId: () => 'delivery-1',
    });

    try {
      deliveries.create(firstPost.id, 'destination-1', '2026-08-01T12:00:00.000Z');
      deliveries.claimDue({
        workerId: 'worker-a',
        now: '2026-08-01T12:00:00.000Z',
        leaseUntil: '2026-08-01T12:01:00.000Z',
      });
      expect(
        deliveries.scheduleRetry('delivery-1', {
          nextAttemptAt: '2026-08-01T12:02:00.000Z',
          errorCode: 'provider-rate-limit',
          errorMessage: 'Try later',
          now: '2026-08-01T12:00:05.000Z',
        })?.state,
      ).toBe('pending');

      deliveries.claimDue({
        workerId: 'worker-a',
        now: '2026-08-01T12:02:00.000Z',
        leaseUntil: '2026-08-01T12:03:00.000Z',
      });
      expect(
        deliveries.markDelivered('delivery-1', '2026-08-01T12:02:01.000Z'),
      ).toMatchObject({
        state: 'delivered',
        deliveredAt: '2026-08-01T12:02:01.000Z',
      });

      const secondPost = {
        ...firstPost,
        id: '2077928427936711000',
        url: 'https://x.com/thsottiaux/status/2077928427936711000',
      };
      new PostRepository(testDatabase.database).insert(secondPost, {
        version: 1,
        categories: [],
        matchedRuleIds: [],
      });
      const secondDeliveries = new DeliveryRepository(testDatabase.database, {
        createId: () => 'delivery-2',
      });
      secondDeliveries.create(secondPost.id, 'destination-1', '2026-08-01T12:03:00.000Z');
      secondDeliveries.claimDue({
        workerId: 'worker-a',
        now: '2026-08-01T12:03:00.000Z',
        leaseUntil: '2026-08-01T12:04:00.000Z',
      });
      expect(
        secondDeliveries.markPermanentFailure('delivery-2', {
          errorCode: 'invalid-credentials',
          errorMessage: 'Webhook revoked',
          now: '2026-08-01T12:03:01.000Z',
        })?.state,
      ).toBe('failed');
      expect(destinations.get('destination-1')?.state).toBe('paused');

      expect(
        secondDeliveries.manualRetry('delivery-2', '2026-08-01T12:04:00.000Z'),
      ).toMatchObject({
        state: 'pending',
        attemptCount: 0,
      });
    } finally {
      testDatabase.cleanup();
    }
  });
});
