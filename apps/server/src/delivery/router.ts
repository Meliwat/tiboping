import type { Category } from '@tiboping/core';

import type { TiboPingDatabase } from '../db/client.js';
import type { DeliveryRepository } from '../db/repositories/deliveries.js';
import type { DestinationRepository } from '../db/repositories/destinations.js';
import type { StoredPost } from '../db/repositories/posts.js';

const matchesCategories = (
  selected: readonly Category[],
  actual: readonly Category[],
): boolean => selected.some((category) => actual.includes(category));

export class NotificationRouter {
  private readonly now: () => string;

  public constructor(
    private readonly database: TiboPingDatabase,
    private readonly destinations: DestinationRepository,
    private readonly deliveries: DeliveryRepository,
    options: { now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public route(post: StoredPost): { created: number; existing: number } {
    const routeTransaction = this.database.transaction(() => {
      let created = 0;
      let existing = 0;
      const timestamp = this.now();

      for (const destination of this.destinations.listActive()) {
        const matches =
          destination.routing.mode === 'everything' ||
          matchesCategories(destination.routing.categories, post.categories);
        if (!matches) continue;

        const result = this.deliveries.create(post.id, destination.id, timestamp);
        if (result.created) created += 1;
        else existing += 1;
      }

      return { created, existing };
    });

    return routeTransaction();
  }
}
