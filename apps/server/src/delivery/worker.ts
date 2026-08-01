import { notificationSchema, type Notification } from '@tiboping/core';

import type { Delivery } from '../db/schema.js';
import type { DeliveryRepository } from '../db/repositories/deliveries.js';
import type { DestinationRepository } from '../db/repositories/destinations.js';
import type { PostRepository, StoredPost } from '../db/repositories/posts.js';
import type { DestinationAdapterRegistry } from '../destinations/registry.js';
import type { DeliveryOutcome } from '../destinations/types.js';
import { retryDelayForAttempt } from './backoff.js';

type WorkerDependencies = {
  deliveries: DeliveryRepository;
  destinations: DestinationRepository;
  posts: PostRepository;
  registry: DestinationAdapterRegistry;
  workerId: string;
  now?: () => number;
  leaseMs?: number;
};

const toNotification = (post: StoredPost): Notification =>
  notificationSchema.parse({
    eventId: `x:${post.id}`,
    post: {
      id: post.id,
      authorName: 'Tibo',
      authorUsername: 'thsottiaux',
      text: post.text,
      url: post.url,
      createdAt: post.createdAt,
      kind: post.kind,
    },
    categories: post.categories,
    observedAt: post.observedAt,
  });

export class DeliveryWorker {
  private readonly now: () => number;
  private readonly leaseMs: number;

  public constructor(private readonly dependencies: WorkerDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.leaseMs = dependencies.leaseMs ?? 30_000;
  }

  public async runBatch(concurrency: number): Promise<number> {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Delivery concurrency must be a positive integer');
    }

    const claimed: Delivery[] = [];
    for (let index = 0; index < concurrency; index += 1) {
      const now = this.now();
      const delivery = this.dependencies.deliveries.claimDue({
        workerId: this.dependencies.workerId,
        now: new Date(now).toISOString(),
        leaseUntil: new Date(now + this.leaseMs).toISOString(),
      });
      if (!delivery) break;
      claimed.push(delivery);
    }

    await Promise.all(claimed.map(async (delivery) => this.process(delivery)));
    return claimed.length;
  }

  private async process(delivery: Delivery): Promise<void> {
    const destination = this.dependencies.destinations.get(delivery.destinationId);
    const post = this.dependencies.posts.get(delivery.postId);
    const now = () => new Date(this.now()).toISOString();

    if (!destination || !post) {
      this.dependencies.deliveries.markPermanentFailure(delivery.id, {
        errorCode: 'delivery-resource-missing',
        errorMessage: 'The destination or source post no longer exists',
        now: now(),
      });
      return;
    }

    const config = this.dependencies.destinations.getConfig(destination.id);
    if (config === undefined) {
      this.dependencies.deliveries.markPermanentFailure(delivery.id, {
        errorCode: 'destination-configuration-missing',
        errorMessage: 'The destination configuration could not be loaded',
        now: now(),
      });
      return;
    }

    let outcome: DeliveryOutcome;
    try {
      const adapter = this.dependencies.registry.get(destination.type);
      outcome = await adapter.send(toNotification(post), config);
    } catch {
      outcome = {
        kind: 'retry',
        code: 'adapter-error',
        message: 'The destination adapter failed unexpectedly',
      };
    }

    if (outcome.kind === 'success') {
      this.dependencies.deliveries.markDelivered(delivery.id, now());
      return;
    }

    if (outcome.kind === 'permanent-failure') {
      this.dependencies.deliveries.markPermanentFailure(delivery.id, {
        errorCode: outcome.code,
        errorMessage: outcome.message,
        now: now(),
      });
      return;
    }

    const delay = retryDelayForAttempt(delivery.attemptCount, outcome.retryAfterMs);
    if (delay === undefined) {
      this.dependencies.deliveries.markPermanentFailure(delivery.id, {
        errorCode: 'retry-exhausted',
        errorMessage: `Delivery retries were exhausted after ${delivery.attemptCount} attempts`,
        now: now(),
      });
      return;
    }

    const currentTime = this.now();
    this.dependencies.deliveries.scheduleRetry(delivery.id, {
      nextAttemptAt: new Date(currentTime + delay).toISOString(),
      errorCode: outcome.code,
      errorMessage: outcome.message,
      now: new Date(currentTime).toISOString(),
    });
  }
}
