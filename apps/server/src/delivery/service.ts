import type { DestinationType, Notification } from '@tiboping/core';

import type { DeliveryRepository } from '../db/repositories/deliveries.js';
import type { DestinationAdapterRegistry } from '../destinations/registry.js';
import type { DeliveryOutcome } from '../destinations/types.js';

export class DeliveryService {
  public constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly registry: DestinationAdapterRegistry,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public async testDestination(
    type: DestinationType,
    config: unknown,
    notification: Notification,
  ): Promise<DeliveryOutcome> {
    const adapter = this.registry.get(type);
    const validated = await adapter.validateConfig(config);
    return adapter.send(notification, validated);
  }

  public retryFailedDelivery(id: string) {
    return this.deliveries.manualRetry(id, this.now());
  }
}
